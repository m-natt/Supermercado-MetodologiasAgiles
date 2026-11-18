from app.database import consultar, transaccion
from app.schemas.inventario import MAX_STOCK

# Un producto con este número de unidades o menos se considera "stock bajo"
UMBRAL_DEFECTO = 10


class ProductoNoEncontrado(Exception):
    pass


class AjusteInvalido(Exception):
    """El cambio de stock no se puede hacer (quedaría negativo, demasiado grande...)."""


SELECT_INVENTARIO = """
    SELECT p.id_producto, p.nombre, p.unidad, p.precio, p.stock, p.activo,
           c.nombre AS categoria, m.nombre AS marca
    FROM productos p
    JOIN categorias c ON c.id_categoria = p.id_categoria
    LEFT JOIN marcas m ON m.id_marca = p.id_marca
"""


def estado_de(stock, umbral):
    """'agotado' (0), 'bajo' (hasta el umbral) u 'ok'."""
    if stock <= 0:
        return "agotado"
    if stock <= umbral:
        return "bajo"
    return "ok"


def _armar(fila, umbral):
    return {
        "id_producto": fila["id_producto"],
        "nombre": fila["nombre"],
        "categoria": fila["categoria"],
        "marca": fila["marca"],
        "unidad": fila["unidad"],
        "precio": fila["precio"],
        "stock": fila["stock"],
        "activo": bool(fila["activo"]),
        "estado": estado_de(fila["stock"], umbral),
    }


def listar(umbral=UMBRAL_DEFECTO, incluir_inactivos=False):
    """Todo el inventario (lo más urgente primero) con un resumen."""
    sql = SELECT_INVENTARIO
    if not incluir_inactivos:
        sql += " WHERE p.activo = 1"
    sql += " ORDER BY p.stock ASC, p.nombre ASC"
    productos = [_armar(fila, umbral) for fila in consultar(sql)]

    agotados = sum(1 for p in productos if p["estado"] == "agotado")
    bajos = sum(1 for p in productos if p["estado"] == "bajo")
    return {
        "umbral": umbral,
        "resumen": {
            "total": len(productos),
            "agotados": agotados,
            "bajos": bajos,
            "normales": len(productos) - agotados - bajos,
            "unidades": sum(max(0, p["stock"]) for p in productos),
        },
        "productos": productos,
    }


def alertas(umbral=UMBRAL_DEFECTO):
    """Solo los productos activos agotados o con stock bajo."""
    filas = consultar(
        SELECT_INVENTARIO + " WHERE p.activo = 1 AND p.stock <= %s ORDER BY p.stock ASC, p.nombre ASC",
        (umbral,),
    )
    productos = [_armar(fila, umbral) for fila in filas]
    return {
        "umbral": umbral,
        "total": len(productos),
        "agotados": [p for p in productos if p["estado"] == "agotado"],
        "bajos": [p for p in productos if p["estado"] == "bajo"],
    }


def _cambiar_stock(id_producto, calcular_nuevo, umbral):
    # FOR UPDATE bloquea la fila: si entra una compra al mismo tiempo, una
    # espera a la otra y no se pisan los números.
    with transaccion() as cursor:
        cursor.execute("SELECT stock FROM productos WHERE id_producto = %s FOR UPDATE", (id_producto,))
        fila = cursor.fetchone()
        if fila is None:
            raise ProductoNoEncontrado()
        anterior = fila["stock"]
        nuevo = calcular_nuevo(anterior)
        cursor.execute("UPDATE productos SET stock = %s WHERE id_producto = %s", (nuevo, id_producto))

    producto = _armar(
        consultar(SELECT_INVENTARIO + " WHERE p.id_producto = %s", (id_producto,))[0], umbral
    )
    producto["stock_anterior"] = anterior
    return producto


def ajustar(id_producto, cantidad, umbral=UMBRAL_DEFECTO):
    """Suma (o resta, si es negativa) existencias."""
    def calcular(anterior):
        nuevo = anterior + cantidad
        if nuevo < 0:
            raise AjusteInvalido(
                f"No hay suficiente stock: hay {anterior} y quieres quitar {-cantidad}."
            )
        if nuevo > MAX_STOCK:
            raise AjusteInvalido(f"El stock no puede pasar de {MAX_STOCK:,} unidades.")
        return nuevo

    return _cambiar_stock(id_producto, calcular, umbral)


def fijar(id_producto, stock, umbral=UMBRAL_DEFECTO):
    """Deja las existencias en un número exacto."""
    return _cambiar_stock(id_producto, lambda anterior: stock, umbral)
