import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

# Caracteres de control invisibles (se dejan los saltos de línea)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def limpiar_texto(valor):
    """Quita espacios sobrantes y caracteres invisibles. Vacío = None."""
    if valor is None:
        return None
    valor = _CONTROL.sub("", valor).strip()
    return valor or None


class ResenaEntrada(BaseModel):
    """Lo que escribe el cliente: de 1 a 5 estrellas y, si quiere, un título y un comentario."""
    calificacion: int = Field(ge=1, le=5)
    titulo: Optional[str] = Field(default=None, max_length=100)
    comentario: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("titulo", "comentario")
    @classmethod
    def limpiar_campos(cls, valor):
        return limpiar_texto(valor)


class EstadoResenaEntrada(BaseModel):
    """Decisión del moderador."""
    estado: Literal["aprobada", "rechazada", "pendiente"]
    motivo: Optional[str] = Field(default=None, max_length=255)

    @field_validator("motivo")
    @classmethod
    def limpiar_motivo(cls, valor):
        return limpiar_texto(valor)
