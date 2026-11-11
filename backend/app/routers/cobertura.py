import re

from fastapi import APIRouter, HTTPException

from app.services import cobertura_service

router = APIRouter(prefix="/api/cobertura", tags=["cobertura"])


@router.get("/{codigo_postal}")
def verificar(codigo_postal: str):
    # 1. Revisar que sean exactamente 5 números
    if not re.fullmatch(r"\d{5}", codigo_postal):
        raise HTTPException(status_code=400, detail="El codigo postal debe tener 5 digitos.")

    # 2. Buscarlo en la base de datos
    zona = cobertura_service.buscar(codigo_postal)

    # 3. Responder
    if zona is None:
        return {"ok": True, "data": {"codigo_postal": codigo_postal, "cubierto": False}}
    return {"ok": True, "data": {**zona, "cubierto": True}}
