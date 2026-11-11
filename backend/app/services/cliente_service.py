from datetime import datetime, timedelta

from app.database import consultar, ejecutar, transaccion
from app.seguridad import (
    DURACION_SESION_DIAS, hash_token, hashear_contrasena, nuevo_token, verificar_contrasena,
)
from app.services.pedido_service import CONTRASENA_INVITADO

# Columnas que se pueden mostrar. La contraseña nunca sale del backend.
COLUMNAS_PUBLICAS = "c.id_cliente, c.nombre, c.apellidos, c.correo, c.telefono"


class CorreoRegistrado(Exception):
    pass


def _crear_sesion(cursor, id_cliente):
    token, token_hash = nuevo_token()
    ahora = datetime.now()
    # Aprovecha para borrar las sesiones vencidas de este cliente
    cursor.execute("DELETE FROM sesiones WHERE id_cliente = %s AND expira <= %s", (id_cliente, ahora))
    cursor.execute(
        "INSERT INTO sesiones (id_cliente, token_hash, expira) VALUES (%s, %s, %s)",
        (id_cliente, token_hash, ahora + timedelta(days=DURACION_SESION_DIAS)),
    )
    return token


def _publico(cursor, id_cliente):
    cursor.execute(f"SELECT {COLUMNAS_PUBLICAS} FROM clientes c WHERE c.id_cliente = %s", (id_cliente,))
    return cursor.fetchone()


def registrar(datos):
    contrasena_hash = hashear_contrasena(datos.contrasena)
    with transaccion() as cursor:
        cursor.execute(
            "SELECT id_cliente, contrasena FROM clientes WHERE correo = %s FOR UPDATE",
            (datos.correo,),
        )
        existente = cursor.fetchone()
        if existente and existente["contrasena"] != CONTRASENA_INVITADO:
            raise CorreoRegistrado()

        valores = (datos.nombre, datos.apellidos, datos.telefono, contrasena_hash)
        if existente:
            # Ya compró como invitado: su registro convierte esa cuenta en una normal
            cursor.execute(
                """UPDATE clientes SET nombre = %s, apellidos = %s, telefono = %s, contrasena = %s
                   WHERE id_cliente = %s""",
                valores + (existente["id_cliente"],),
            )
            id_cliente = existente["id_cliente"]
        else:
            cursor.execute(
                """INSERT INTO clientes (nombre, apellidos, telefono, contrasena, correo)
                   VALUES (%s, %s, %s, %s, %s)""",
                valores + (datos.correo,),
            )
            id_cliente = cursor.lastrowid

        token = _crear_sesion(cursor, id_cliente)
        return {"token": token, "cliente": _publico(cursor, id_cliente)}


def iniciar_sesion(correo, contrasena):
    """Devuelve {"token", "cliente"} o None si el correo o la contraseña no coinciden."""
    filas = consultar("SELECT id_cliente, contrasena FROM clientes WHERE correo = %s", (correo,))
    guardado = filas[0]["contrasena"] if filas else None
    correcta, hash_nuevo = verificar_contrasena(contrasena, guardado)
    if not correcta:
        return None

    id_cliente = filas[0]["id_cliente"]
    with transaccion() as cursor:
        if hash_nuevo:
            cursor.execute("UPDATE clientes SET contrasena = %s WHERE id_cliente = %s", (hash_nuevo, id_cliente))
        token = _crear_sesion(cursor, id_cliente)
        return {"token": token, "cliente": _publico(cursor, id_cliente)}


def cliente_por_token(token):
    filas = consultar(
        f"""SELECT {COLUMNAS_PUBLICAS}
            FROM sesiones s JOIN clientes c ON c.id_cliente = s.id_cliente
            WHERE s.token_hash = %s AND s.expira > %s""",
        (hash_token(token), datetime.now()),
    )
    return filas[0] if filas else None


def cerrar_sesion(token):
    ejecutar("DELETE FROM sesiones WHERE token_hash = %s", (hash_token(token),))
