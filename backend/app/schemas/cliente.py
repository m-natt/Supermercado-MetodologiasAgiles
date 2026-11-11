from typing import Annotated

from pydantic import Field, StringConstraints, field_validator

from app.schemas.pedido import ClientePedido, Entrada

# Las contraseñas no se recortan: un espacio al final también cuenta.
# Máximo 128 para que nadie mande textos enormes que tarden en hashearse.
Contrasena = Annotated[str, StringConstraints(strip_whitespace=False, max_length=128)]


class RegistroEntrada(ClientePedido):
    """Mismos datos que pide el checkout, más la contraseña."""
    contrasena: Annotated[Contrasena, StringConstraints(min_length=8)]

    @field_validator("correo")
    @classmethod
    def correo_en_minusculas(cls, correo):
        return correo.lower()

    @field_validator("contrasena")
    @classmethod
    def contrasena_segura(cls, valor):
        if not any(c.isalpha() for c in valor) or not any(c.isdigit() for c in valor):
            raise ValueError("La contraseña debe tener al menos una letra y un número.")
        return valor


class LoginEntrada(Entrada):
    correo: str = Field(min_length=3, max_length=150)
    contrasena: Contrasena

    @field_validator("correo")
    @classmethod
    def correo_en_minusculas(cls, correo):
        return correo.lower()
