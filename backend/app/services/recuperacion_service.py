"""Recuperar la contraseña con un código de 6 dígitos.

El correo es SIMULADO: el código se escribe en la terminal donde corre el
backend (como si fuera la bandeja de entrada). Nunca se devuelve en la API.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from app.database import consultar, transaccion
from app.seguridad import hashear_contrasena

MINUTOS_VIGENCIA = 15
MAX_INTENTOS = 5


class CodigoInvalido(Exception):
    pass


def _hash_codigo(id_cliente, codigo):
    # Se mezcla con el id del cliente para que el mismo código no dé el mismo hash
    return hashlib.sha256(f"{id_cliente}:{codigo}".encode()).hexdigest()


def _imprimir_correo(correo, nombre, codigo):
    lineas = [
        "=" * 58,
        "CORREO SIMULADO (en una tienda real llegaría al correo)",
        f"Para:    {correo}",
        "Asunto:  Recupera tu contraseña - Supermercado Bonito :3",
        f"Hola {nombre}, tu código es: {codigo}",
        f"Vence en {MINUTOS_VIGENCIA} minutos. Si no lo pediste, ignora este mensaje.",
        "=" * 58,
    ]
    texto = "\n".join(lineas)
    try:
        print(texto, flush=True)
    except UnicodeEncodeError:
        # Algunas terminales de Windows no aceptan acentos
        print(texto.encode("ascii", "replace").decode(), flush=True)


def solicitar(correo):
    """Crea un código y lo "envía". Si el correo no existe, no hace nada
    (la página responde igual en ambos casos para no revelar qué correos existen)."""
    filas = consultar("SELECT id_cliente, nombre FROM clientes WHERE correo = %s", (correo,))
    if not filas:
        return
    cliente = filas[0]
    codigo = f"{secrets.randbelow(10**6):06d}"
    with transaccion() as cursor:
        # Solo vale el código más reciente
        cursor.execute(
            "UPDATE recuperaciones SET usado = 1 WHERE id_cliente = %s AND usado = 0",
            (cliente["id_cliente"],),
        )
        cursor.execute(
            "INSERT INTO recuperaciones (id_cliente, codigo_hash, expira) VALUES (%s, %s, %s)",
            (cliente["id_cliente"], _hash_codigo(cliente["id_cliente"], codigo),
             datetime.now() + timedelta(minutes=MINUTOS_VIGENCIA)),
        )
    _imprimir_correo(correo, cliente["nombre"], codigo)


def confirmar(correo, codigo, contrasena_nueva):
    """Cambia la contraseña si el código es correcto. Lanza CodigoInvalido si no."""
    with transaccion() as cursor:
        cursor.execute("SELECT id_cliente FROM clientes WHERE correo = %s", (correo,))
        cliente = cursor.fetchone()
        recuperacion = None
        if cliente:
            cursor.execute(
                """SELECT id_recuperacion, codigo_hash, intentos FROM recuperaciones
                   WHERE id_cliente = %s AND usado = 0 AND expira > %s
                   ORDER BY id_recuperacion DESC LIMIT 1
                   FOR UPDATE""",
                (cliente["id_cliente"], datetime.now()),
            )
            recuperacion = cursor.fetchone()
        if recuperacion is None:
            raise CodigoInvalido("El código no es válido o ya venció. Pide uno nuevo.")

        correcto = hmac.compare_digest(
            recuperacion["codigo_hash"], _hash_codigo(cliente["id_cliente"], codigo)
        )
        if not correcto:
            intentos = recuperacion["intentos"] + 1
            # Al llegar al máximo, el código deja de servir
            cursor.execute(
                "UPDATE recuperaciones SET intentos = %s, usado = %s WHERE id_recuperacion = %s",
                (intentos, int(intentos >= MAX_INTENTOS), recuperacion["id_recuperacion"]),
            )
            restantes = MAX_INTENTOS - intentos
        else:
            cursor.execute(
                "UPDATE clientes SET contrasena = %s WHERE id_cliente = %s",
                (hashear_contrasena(contrasena_nueva), cliente["id_cliente"]),
            )
            cursor.execute(
                "UPDATE recuperaciones SET usado = 1 WHERE id_recuperacion = %s",
                (recuperacion["id_recuperacion"],),
            )
            # Por seguridad se cierran todas sus sesiones abiertas
            cursor.execute("DELETE FROM sesiones WHERE id_cliente = %s", (cliente["id_cliente"],))
            return

    # Fuera de la transacción: el intento fallido ya quedó guardado
    if restantes > 0:
        raise CodigoInvalido(f"El código es incorrecto. Te quedan {restantes} intento(s).")
    raise CodigoInvalido("Demasiados intentos con ese código. Pide uno nuevo.")
