from app.database import consultar, ejecutar

# Trae el producto junto con el nombre de su categoria y marca
SELECT_PRODUCTO = """
    SELECT p.id_producto, p.id_categoria, c.nombre AS categoria,
           p.id_marca, m.nombre AS marca,
           p.nombre, p.descripcion, p.precio, p.unidad, p.stock,
           p.imagen_url, p.activo
    FROM productos p
    JOIN categorias c ON c.id_categoria = p.id_categoria
    LEFT JOIN marcas m ON m.id_marca = p.id_marca
"""


def listar(id_categoria=None, incluir_inactivos=False,
           id_marca=None, precio_min=None, precio_max=None):
    condiciones = []
    params = []
    if not incluir_inactivos:
        condiciones.append("p.activo = 1")
    if id_categoria is not None:
        condiciones.append("p.id_categoria = %s")
        params.append(id_categoria)
    if id_marca is not None:
        condiciones.append("p.id_marca = %s")
        params.append(id_marca)
    if precio_min is not None:
        condiciones.append("p.precio >= %s")
        params.append(precio_min)
    if precio_max is not None:
        condiciones.append("p.precio <= %s")
        params.append(precio_max)

    sql = SELECT_PRODUCTO
    if condiciones:
        sql += " WHERE " + " AND ".join(condiciones)
    sql += " ORDER BY p.nombre"
    return consultar(sql, params)


def obtener(id_producto):
    filas = consultar(SELECT_PRODUCTO + " WHERE p.id_producto = %s", (id_producto,))
    return filas[0] if filas else None


def _valores(datos):
    return (
        datos.id_categoria, datos.id_marca, datos.nombre, datos.descripcion,
        datos.precio, datos.unidad, datos.stock, datos.imagen_url, datos.activo,
    )


def crear(datos):
    nuevo_id = ejecutar(
        """INSERT INTO productos
           (id_categoria, id_marca, nombre, descripcion, precio, unidad, stock, imagen_url, activo)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        _valores(datos),
    )
    return obtener(nuevo_id)


def actualizar(id_producto, datos):
    ejecutar(
        """UPDATE productos
           SET id_categoria = %s, id_marca = %s, nombre = %s, descripcion = %s,
               precio = %s, unidad = %s, stock = %s, imagen_url = %s, activo = %s
           WHERE id_producto = %s""",
        _valores(datos) + (id_producto,),
    )
    return obtener(id_producto)


def eliminar(id_producto):
    # Borrado logico: el producto puede estar en pedidos o carritos
    ejecutar("UPDATE productos SET activo = 0 WHERE id_producto = %s", (id_producto,))
