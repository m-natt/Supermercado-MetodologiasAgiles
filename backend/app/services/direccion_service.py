from app.database import consultar, ejecutar, transaccion

_COLUMNAS = """
id_direccion, id_cliente, calle, colonia, ciudad, codigo_postal, referencias
"""


def listar(id_cliente):
    return consultar(
        f"""SELECT {_COLUMNAS}
            FROM direcciones
            WHERE id_cliente = %s AND activa = 1
            ORDER BY id_direccion DESC""",
        (id_cliente,),
    )


def obtener(id_cliente, id_direccion):
    filas = consultar(
        f"""SELECT {_COLUMNAS}
            FROM direcciones
            WHERE id_cliente = %s AND id_direccion = %s AND activa = 1""",
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
    """Guarda los cambios y devuelve el id de la dirección resultante.

    Si la dirección ya se usó en algún pedido, no se modifica (el pedido debe
    seguir mostrando a dónde se entregó): se oculta y se guarda una nueva con
    los cambios. Si nunca se usó, se modifica directamente.
    """
    valores = (datos.calle, datos.colonia, datos.ciudad, datos.codigo_postal, datos.referencias)
    with transaccion() as cursor:
        cursor.execute(
            "SELECT COUNT(*) AS n FROM pedidos WHERE id_direccion = %s",
            (id_direccion,),
        )
        if cursor.fetchone()["n"] == 0:
            cursor.execute(
                """UPDATE direcciones
                   SET calle = %s, colonia = %s, ciudad = %s, codigo_postal = %s, referencias = %s
                   WHERE id_cliente = %s AND id_direccion = %s""",
                valores + (id_cliente, id_direccion),
            )
            return id_direccion

        cursor.execute(
            """UPDATE direcciones SET activa = 0
               WHERE id_cliente = %s AND id_direccion = %s""",
            (id_cliente, id_direccion),
        )
        cursor.execute(
            """INSERT INTO direcciones
               (id_cliente, calle, colonia, ciudad, codigo_postal, referencias)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (id_cliente,) + valores,
        )
        return cursor.lastrowid


def eliminar(id_cliente, id_direccion):
    """Quita la dirección de la lista del cliente.

    Si ya se usó en algún pedido no se puede borrar (el pedido necesita saber
    a dónde se entregó), así que solo se marca como inactiva. Si nunca se usó,
    se borra de verdad.
    """
    with transaccion() as cursor:
        cursor.execute(
            "SELECT COUNT(*) AS n FROM pedidos WHERE id_direccion = %s",
            (id_direccion,),
        )
        if cursor.fetchone()["n"] > 0:
            cursor.execute(
                """UPDATE direcciones SET activa = 0
                   WHERE id_cliente = %s AND id_direccion = %s""",
                (id_cliente, id_direccion),
            )
        else:
            cursor.execute(
                """DELETE FROM direcciones
                   WHERE id_cliente = %s AND id_direccion = %s""",
                (id_cliente, id_direccion),
            )
