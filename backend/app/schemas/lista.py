from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.resena import limpiar_texto

MAX_CANTIDAD = 999


class ListaEntrada(BaseModel):
    """Nombre de la lista, por ejemplo "Despensa de la semana"."""
    nombre: str = Field(max_length=80)

    @field_validator("nombre")
    @classmethod
    def limpiar_nombre(cls, valor):
        limpio = limpiar_texto(valor)
        if limpio is None:
            raise ValueError("El nombre no puede estar vacío.")
        return limpio


class ItemEntrada(BaseModel):
    id_producto: int = Field(gt=0)
    cantidad: int = Field(default=1, ge=1, le=MAX_CANTIDAD)


class ItemCambio(BaseModel):
    """Se manda solo lo que cambia: la cantidad, la palomita o ambas."""
    cantidad: Optional[int] = Field(default=None, ge=1, le=MAX_CANTIDAD)
    comprado: Optional[bool] = None
