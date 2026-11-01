from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class ProductoEntrada(BaseModel):
    id_categoria: int
    id_marca: Optional[int] = None
    nombre: str = Field(min_length=1, max_length=150)
    descripcion: Optional[str] = None
    precio: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    unidad: str = Field(min_length=1, max_length=20)
    stock: int = Field(ge=0)
    imagen_url: Optional[str] = Field(default=None, max_length=255)
    activo: bool = True
