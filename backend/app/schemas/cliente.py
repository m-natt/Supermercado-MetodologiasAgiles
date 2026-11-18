from typing import Annotated

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
