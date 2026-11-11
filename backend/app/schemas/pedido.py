from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Máximo de unidades de un mismo producto por pedido
MAX_CANTIDAD = 999


class Entrada(BaseModel):
    # Quita espacios al inicio y al final de todos los textos
    model_config = ConfigDict(str_strip_whitespace=True)


class ItemPedido(Entrada):
    id_producto: int = Field(gt=0)
    cantidad: int = Field(ge=1, le=MAX_CANTIDAD)


class ClientePedido(Entrada):
    nombre: str = Field(min_length=1, max_length=100)
    apellidos: Optional[str] = Field(default=None, max_length=100)
    correo: str = Field(max_length=150, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    telefono: str = Field(min_length=10, max_length=20, pattern=r"^[0-9 +()-]+$")


class DireccionPedido(Entrada):
    calle: str = Field(min_length=1, max_length=150)
    colonia: str = Field(min_length=1, max_length=100)
    ciudad: str = Field(min_length=1, max_length=100)
    codigo_postal: str = Field(pattern=r"^\d{5}$")
    referencias: Optional[str] = Field(default=None, max_length=255)


class PedidoEntrada(Entrada):
    cliente: ClientePedido
    direccion: DireccionPedido
    # Se paga al recibir (efectivo o tarjeta en terminal) o por transferencia.
    # Nunca se reciben datos de tarjeta en la página.
    metodo_pago: Literal["efectivo", "tarjeta", "transferencia"]
    items: list[ItemPedido] = Field(min_length=1, max_length=100)

    @field_validator("items")
    @classmethod
    def sin_productos_repetidos(cls, items: list[ItemPedido]):
        ids = [item.id_producto for item in items]
        if len(ids) != len(set(ids)):
            raise ValueError("Hay productos repetidos; une las cantidades en una sola línea.")
        return items
