from pydantic import BaseModel, Field


class CategoriaEntrada(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
