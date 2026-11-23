from typing import Annotated, Optional

from pydantic import Field, StringConstraints, field_validator

from app.schemas.pedido import ClientePedido, Entrada

# Las contraseñas no se recortan: un espacio al final también cuenta.
# Máximo 128 para que nadie mande textos enormes que tarden en hashearse.
Contrasena = Annotated[str, StringConstraints(strip_whitespace=False, max_length=128)]
ContrasenaNueva = Annotated[Contrasena, StringConstraints(min_length=8)]


def _validar_contrasena(valor):
    """Misma regla para el registro y para recuperar la contraseña."""
    if not any(c.isalpha() for c in valor) or not any(c.isdigit() for c in valor):
        raise ValueError("La contraseña debe tener al menos una letra y un número.")
    return valor


class RegistroEntrada(ClientePedido):
    """Mismos datos que pide el checkout, más la contraseña."""
    contrasena: ContrasenaNueva

    @field_validator("correo")
    @classmethod
    def correo_en_minusculas(cls, correo):
        return correo.lower()

    @field_validator("contrasena")
    @classmethod
    def contrasena_segura(cls, valor):
        return _validar_contrasena(valor)


class LoginEntrada(Entrada):
    correo: str = Field(min_length=3, max_length=150)
    contrasena: Contrasena

    @field_validator("correo")
    @classmethod
    def correo_en_minusculas(cls, correo):
        return correo.lower()


# ---------- Recuperar contraseña ----------

class RecuperarEntrada(Entrada):
    correo: str = Field(min_length=3, max_length=150)

    @field_validator("correo")
    @classmethod
    def correo_en_minusculas(cls, correo):
        return correo.lower()


class ConfirmarRecuperacionEntrada(RecuperarEntrada):
    codigo: str = Field(pattern=r"^\d{6}$")
    contrasena: ContrasenaNueva

    @field_validator("contrasena")
    @classmethod
    def contrasena_segura(cls, valor):
        return _validar_contrasena(valor)


# ---------- Editar perfil ----------

class PerfilEntrada(Entrada):
    """Datos del perfil que el cliente puede editar.

    El correo no se incluye a propósito: identifica la cuenta (inicio de sesión,
    pedidos y tarjetas guardadas), así que no se puede cambiar desde aquí.
    """
    nombre: str = Field(min_length=1, max_length=100)
    apellidos: Optional[str] = Field(default=None, max_length=100)
    telefono: str = Field(min_length=10, max_length=20, pattern=r"^[0-9 +()-]+$")

    @field_validator("telefono")
    @classmethod
    def telefono_con_digitos(cls, valor):
        if sum(c.isdigit() for c in valor) < 10:
            raise ValueError("El teléfono debe tener al menos 10 dígitos.")
        return valor
