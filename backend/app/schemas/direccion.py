from typing import Optional

from pydantic import Field

from app.schemas.pedido import Entrada


class DireccionBase(Entrada):
    calle: str = Field(min_length=1, max_length=150)
    colonia: str = Field(min_length=1, max_length=100)
    ciudad: str = Field(min_length=1, max_length=100)
    codigo_postal: str = Field(pattern=r"^\d{5}$")
    referencias: Optional[str] = Field(default=None, max_length=255)


class DireccionEntrada(DireccionBase):
    pass


class DireccionSalida(DireccionBase):
    id_direccion: int
