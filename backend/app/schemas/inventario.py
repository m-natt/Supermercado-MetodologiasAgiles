from pydantic import BaseModel, Field, field_validator

# Tope de existencias por producto (la columna stock es INT)
MAX_STOCK = 1_000_000


class AjusteEntrada(BaseModel):
    """Sumar o restar existencias. Positivo = entra mercancía, negativo = sale."""
    cantidad: int = Field(ge=-MAX_STOCK, le=MAX_STOCK)

    @field_validator("cantidad")
    @classmethod
    def distinta_de_cero(cls, cantidad: int):
        if cantidad == 0:
            raise ValueError("La cantidad no puede ser 0.")
        return cantidad


class StockEntrada(BaseModel):
    """Fijar las existencias exactas (por ejemplo, después de contar el almacén)."""
    stock: int = Field(ge=0, le=MAX_STOCK)
