from decimal import Decimal

from app.database import consultar, ejecutar, transaccion
from app.schemas.lista import MAX_CANTIDAD

MAX_LISTAS = 30
MAX_PRODUCTOS_POR_LISTA = 200


class ListaNoEncontrada(Exception):
    """La lista no existe o es de otro cliente."""


class ItemNoEncontrado(Exception):
    pass


class ProductoNoDisponible(Exception):
    pass


class LimiteAlcanzado(Exception):
    pass


def listar(id_cliente):
    """Las listas del cliente con su resumen, las usadas más recientemente primero."""
    filas = consultar(
        """SELECT l.id_lista, l.nombre, l.fecha_actualizacion,
                  COUNT(i.id_item) AS productos,
                  COALESCE(SUM(i.comprado), 0) AS comprados,
                  COALESCE(SUM(CASE WHEN i.comprado = 0 AND p.activo = 1
                                    THEN i.cantidad * p.precio ELSE 0 END), 0) AS total_estimado
           FROM listas_compra l
           LEFT JOIN listas_compra_items i ON i.id_lista = l.id_lista
           LEFT JOIN productos p ON p.id_producto = i.id_producto
           WHERE l.id_cliente = %s
           GROUP BY l.id_lista, l.nombre, l.fecha_actualizacion
           ORDER BY l.fecha_actualizacion DESC, l.id_lista DESC""",
        (id_cliente,),
    )
    return [
        {**f, "productos": int(f["productos"]), "comprados": int(f["comprados"])}
        for f in filas
    ]


def obtener(id_lista, id_cliente):
    filas = consultar(
        """SELECT id_lista, nombre, fecha_actualizacion
           FROM listas_compra WHERE id_lista = %s AND id_cliente = %s""",
        (id_lista, id_cliente),
    )
    if not filas:
        raise ListaNoEncontrada()
    lista = filas[0]

    items = consultar(
        """SELECT i.id_item, i.id_producto, i.cantidad, i.comprado,
                  p.nombre, p.precio, p.unidad, p.stock, p.imagen_url, p.activo,
                  c.nombre AS categoria, m.nombre AS marca
           FROM listas_compra_items i
           JOIN productos p ON p.id_producto = i.id_producto
           JOIN categorias c ON c.id_categoria = p.id_categoria
           LEFT JOIN marcas m ON m.id_marca = p.id_marca
           WHERE i.id_lista = %s
           ORDER BY i.comprado, p.nombre""",
        (id_lista,),
    )
    total = Decimal("0")
    for item in items:
        item["comprado"] = bool(item["comprado"])
        item["activo"] = bool(item["activo"])
        if item["activo"] and not item["comprado"]:
            total += item["precio"] * item["cantidad"]

    lista["items"] = items
    lista["productos"] = len(items)
    lista["comprados"] = sum(1 for i in items if i["comprado"])
    lista["total_estimado"] = total
    return lista


def crear(id_cliente, nombre):
    with transaccion() as cursor:
        # Bloquea al cliente para que dos peticiones juntas no rebasen el límite
        cursor.execute("SELECT id_cliente FROM clientes WHERE id_cliente = %s FOR UPDATE", (id_cliente,))
        cursor.execute("SELECT COUNT(*) AS n FROM listas_compra WHERE id_cliente = %s", (id_cliente,))
        if cursor.fetchone()["n"] >= MAX_LISTAS:
            raise LimiteAlcanzado(f"Puedes tener hasta {MAX_LISTAS} listas.")
        cursor.execute(
            "INSERT INTO listas_compra (id_cliente, nombre) VALUES (%s, %s)",
            (id_cliente, nombre),
        )
        id_lista = cursor.lastrowid
    return obtener(id_lista, id_cliente)


def _bloquear_lista(cursor, id_lista, id_cliente):
    cursor.execute(
        "SELECT id_lista FROM listas_compra WHERE id_lista = %s AND id_cliente = %s FOR UPDATE",
        (id_lista, id_cliente),
    )
    if cursor.fetchone() is None:
        raise ListaNoEncontrada()


def _marcar_actualizada(cursor, id_lista):
    cursor.execute(
        "UPDATE listas_compra SET fecha_actualizacion = NOW() WHERE id_lista = %s",
        (id_lista,),
    )


def renombrar(id_lista, id_cliente, nombre):
    with transaccion() as cursor:
        _bloquear_lista(cursor, id_lista, id_cliente)
        cursor.execute(
            "UPDATE listas_compra SET nombre = %s, fecha_actualizacion = NOW() WHERE id_lista = %s",
            (nombre, id_lista),
        )
    return obtener(id_lista, id_cliente)


def eliminar(id_lista, id_cliente):
    with transaccion() as cursor:
        _bloquear_lista(cursor, id_lista, id_cliente)
        cursor.execute("DELETE FROM listas_compra WHERE id_lista = %s", (id_lista,))


def agregar_item(id_lista, id_cliente, id_producto, cantidad):
    """Agrega el producto; si ya estaba, suma la cantidad y lo vuelve a dejar pendiente."""
    with transaccion() as cursor:
        _bloquear_lista(cursor, id_lista, id_cliente)
        cursor.execute("SELECT activo FROM productos WHERE id_producto = %s", (id_producto,))
        producto = cursor.fetchone()
        if producto is None or not producto["activo"]:
            raise ProductoNoDisponible()

        cursor.execute(
            "SELECT 1 AS ok FROM listas_compra_items WHERE id_lista = %s AND id_producto = %s",
            (id_lista, id_producto),
        )
        if cursor.fetchone() is None:
            cursor.execute("SELECT COUNT(*) AS n FROM listas_compra_items WHERE id_lista = %s", (id_lista,))
            if cursor.fetchone()["n"] >= MAX_PRODUCTOS_POR_LISTA:
                raise LimiteAlcanzado(f"Una lista puede tener hasta {MAX_PRODUCTOS_POR_LISTA} productos.")

        cursor.execute(
            """INSERT INTO listas_compra_items (id_lista, id_producto, cantidad)
               VALUES (%s, %s, %s)
               ON DUPLICATE KEY UPDATE cantidad = LEAST(cantidad + %s, %s), comprado = 0""",
            (id_lista, id_producto, cantidad, cantidad, MAX_CANTIDAD),
        )
        _marcar_actualizada(cursor, id_lista)
    return obtener(id_lista, id_cliente)


def cambiar_item(id_lista, id_cliente, id_producto, cantidad=None, comprado=None):
    with transaccion() as cursor:
        _bloquear_lista(cursor, id_lista, id_cliente)
        cursor.execute(
            "SELECT id_item FROM listas_compra_items WHERE id_lista = %s AND id_producto = %s",
            (id_lista, id_producto),
        )
        item = cursor.fetchone()
        if item is None:
            raise ItemNoEncontrado()
        if cantidad is not None:
            cursor.execute("UPDATE listas_compra_items SET cantidad = %s WHERE id_item = %s",
                           (cantidad, item["id_item"]))
        if comprado is not None:
            cursor.execute("UPDATE listas_compra_items SET comprado = %s WHERE id_item = %s",
                           (int(comprado), item["id_item"]))
        _marcar_actualizada(cursor, id_lista)
    return obtener(id_lista, id_cliente)


def quitar_item(id_lista, id_cliente, id_producto):
    with transaccion() as cursor:
        _bloquear_lista(cursor, id_lista, id_cliente)
        cursor.execute(
            "DELETE FROM listas_compra_items WHERE id_lista = %s AND id_producto = %s",
            (id_lista, id_producto),
        )
        if cursor.rowcount == 0:
            raise ItemNoEncontrado()
        _marcar_actualizada(cursor, id_lista)
    return obtener(id_lista, id_cliente)
