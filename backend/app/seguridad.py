"""Contraseñas, tokens de sesión y límite de intentos de inicio de sesión."""
import hashlib
import secrets
import threading
import time
from collections import defaultdict, deque

from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

# ---------- Contraseñas (Argon2 con pwdlib) ----------

_hasher = PasswordHash.recommended()

# Hash de relleno: se verifica contra él cuando el correo no existe o la cuenta
# es de invitado, para que la respuesta tarde lo mismo y no revele qué correos
# están registrados.
_HASH_RELLENO = _hasher.hash("contrasena-de-relleno")


def hashear_contrasena(contrasena):
    return _hasher.hash(contrasena)


def verificar_contrasena(contrasena, hash_guardado):
    """Devuelve (es_correcta, hash_nuevo).

    hash_nuevo no es None cuando pwdlib recomienda actualizar el hash
    (por ejemplo, si cambian los parámetros recomendados de Argon2).
    """
    if hash_guardado:
        try:
            return _hasher.verify_and_update(contrasena, hash_guardado)
        except UnknownHashError:
            pass  # cliente invitado ("!") u otro formato: nunca es válido
    _hasher.verify(contrasena, _HASH_RELLENO)
    return False, None


# ---------- Tokens de sesión ----------

DURACION_SESION_DIAS = 7


def nuevo_token():
    """Token aleatorio para el navegador y su hash para la base de datos."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token):
    # Si alguien lee la tabla sesiones, no puede usar los tokens
    return hashlib.sha256(token.encode()).hexdigest()


# ---------- Límite de intentos fallidos ----------

class LimiteIntentos:
    """Bloquea temporalmente después de varios intentos fallidos.

    Se guarda en memoria: se reinicia si se reinicia el servidor.
    """

    def __init__(self, maximo, ventana_segundos):
        self.maximo = maximo
        self.ventana = ventana_segundos
        self._fallos = defaultdict(deque)
        self._lock = threading.Lock()

    def _limpiar(self, clave, ahora):
        fallos = self._fallos[clave]
        while fallos and ahora - fallos[0] > self.ventana:
            fallos.popleft()
        if not fallos:
            del self._fallos[clave]
        return fallos

    def bloqueado(self, clave):
        with self._lock:
            return len(self._limpiar(clave, time.monotonic())) >= self.maximo

    def registrar_fallo(self, clave):
        with self._lock:
            ahora = time.monotonic()
            self._limpiar(clave, ahora)
            self._fallos[clave].append(ahora)

    def reiniciar(self, clave):
        with self._lock:
            self._fallos.pop(clave, None)


# 5 fallos por correo o 20 por IP en 15 minutos
intentos_por_correo = LimiteIntentos(maximo=5, ventana_segundos=15 * 60)
intentos_por_ip = LimiteIntentos(maximo=20, ventana_segundos=15 * 60)
