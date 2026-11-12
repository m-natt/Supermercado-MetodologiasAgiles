from app.database import consultar, ejecutar

_COLUMNAS = """
id_direccion, id_cliente, calle, colonia, ciudad, codigo_postal, referencias
"""


def listar(id_cliente):
    return consultar(
        f"""SELECT {_COLUMNAS}
            FROM direcciones
            WHERE id_cliente = %s
            ORDER BY id_direccion DESC""",
        (id_cliente,),
    )


def obtener(id_cliente, id_direccion):
    filas = consultar(
        f"""SELECT {_COLUMNAS}
            FROM direcciones
            WHERE id_cliente = %s AND id_direccion = %s""",
        (id_cliente, id_direccion),
    )
    return filas[0] if filas else None


def crear(id_cliente, datos):
    return ejecutar(
        """INSERT INTO direcciones
           (id_cliente, calle, colonia, ciudad, codigo_postal, referencias)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (
            id_cliente,
            datos.calle,
            datos.colonia,
            datos.ciudad,
            datos.codigo_postal,
            datos.referencias,
        ),
    )


def actualizar(id_cliente, id_direccion, datos):
    return ejecutar(
        """UPDATE direcciones
           SET calle = %s,
               colonia = %s,
               ciudad = %s,
               codigo_postal = %s,
               referencias = %s
           WHERE id_cliente = %s AND id_direccion = %s""",
        (
            datos.calle,
            datos.colonia,
            datos.ciudad,
            datos.codigo_postal,
            datos.referencias,
            id_cliente,
            id_direccion,
        ),
    )


def eliminar(id_cliente, id_direccion):
    return ejecutar(
        """DELETE FROM direcciones
           WHERE id_cliente = %s AND id_direccion = %s""",
        (id_cliente, id_direccion),
    )
