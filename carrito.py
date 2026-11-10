from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator

# Máximo de unidades de un mismo producto por línea del carrito
MAX_CANTIDAD = 999


# ---------- Entradas ----------

class CarritoItemEntrada(BaseModel):
    """Agregar un producto al carrito."""
    id_producto: int
    cantidad: int = Field(default=1, ge=1, le=MAX_CANTIDAD)


class CarritoItemActualizar(BaseModel):
    """Fijar la cantidad exacta de un producto que ya está en el carrito."""
    cantidad: int = Field(ge=1, le=MAX_CANTIDAD)


class CompraEntrada(BaseModel):
    """Finalizar la compra con los productos del carrito."""
    items: list[CarritoItemEntrada] = Field(min_length=1)

    @field_validator("items")
    @classmethod
    def sin_productos_repetidos(cls, items: list[CarritoItemEntrada]):
        ids = [item.id_producto for item in items]
        if len(ids) != len(set(ids)):
            raise ValueError("Hay productos repetidos; une las cantidades en una sola línea.")
        return items


# ---------- Salidas ----------

class CarritoItemSalida(BaseModel):
    id_producto: int
    nombre: str
    precio: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    unidad: str
    imagen_url: Optional[str] = None
    stock: int = Field(ge=0)
    cantidad: int = Field(ge=1)
    subtotal: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class CarritoSalida(BaseModel):
    items: list[CarritoItemSalida] = []
    total: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)


class CompraSalida(BaseModel):
    id_pedido: int
    items: list[CarritoItemSalida]
    total: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
