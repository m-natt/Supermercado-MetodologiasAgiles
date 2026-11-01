from fastapi import APIRouter, HTTPException

from app.schemas.marca import MarcaEntrada
from app.services import marca_service

router = APIRouter(prefix="/api/marcas", tags=["marcas"])


def _buscar_o_404(id_marca):
    marca = marca_service.obtener(id_marca)
    if marca is None:
        raise HTTPException(status_code=404, detail="Marca no encontrada.")
    return marca


@router.get("")
def listar():
    return {"ok": True, "data": marca_service.listar()}


@router.get("/{id_marca}")
def obtener(id_marca: int):
    return {"ok": True, "data": _buscar_o_404(id_marca)}


@router.post("", status_code=201)
def crear(datos: MarcaEntrada):
    return {"ok": True, "data": marca_service.crear(datos)}


@router.put("/{id_marca}")
def actualizar(id_marca: int, datos: MarcaEntrada):
    _buscar_o_404(id_marca)
    return {"ok": True, "data": marca_service.actualizar(id_marca, datos)}


@router.delete("/{id_marca}")
def eliminar(id_marca: int):
    # Si tiene productos, MySQL lanza IntegrityError y main.py responde 409
    _buscar_o_404(id_marca)
    marca_service.eliminar(id_marca)
    return {"ok": True, "mensaje": "Marca eliminada."}
