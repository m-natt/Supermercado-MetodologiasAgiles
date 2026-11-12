from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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
    # Si se manda id_direccion se usa una dirección guardada del cliente.
    # Si no se manda, direccion contiene una dirección nueva que se guardará.
    id_direccion: Optional[int] = Field(default=None, gt=0)
    direccion: Optional[DireccionPedido] = None
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

    @model_validator(mode="after")
    def validar_direccion(self):
        if self.id_direccion is None and self.direccion is None:
            raise ValueError("Debes seleccionar una dirección o capturar una nueva.")
        return self
