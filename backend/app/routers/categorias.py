from fastapi import APIRouter, HTTPException

from app.schemas.categoria import CategoriaEntrada
from app.services import categoria_service

router = APIRouter(prefix="/api/categorias", tags=["categorias"])


def _buscar_o_404(id_categoria):
    categoria = categoria_service.obtener(id_categoria)
    if categoria is None:
        raise HTTPException(status_code=404, detail="Categoria no encontrada.")
    return categoria


@router.get("")
def listar():
    return {"ok": True, "data": categoria_service.listar()}


@router.get("/{id_categoria}")
def obtener(id_categoria: int):
    return {"ok": True, "data": _buscar_o_404(id_categoria)}


@router.post("", status_code=201)
def crear(datos: CategoriaEntrada):
    return {"ok": True, "data": categoria_service.crear(datos)}


@router.put("/{id_categoria}")
def actualizar(id_categoria: int, datos: CategoriaEntrada):
    _buscar_o_404(id_categoria)
    return {"ok": True, "data": categoria_service.actualizar(id_categoria, datos)}


@router.delete("/{id_categoria}")
def eliminar(id_categoria: int):
    # Si tiene productos, MySQL lanza IntegrityError y main.py responde 409
    _buscar_o_404(id_categoria)
    categoria_service.eliminar(id_categoria)
    return {"ok": True, "mensaje": "Categoria eliminada."}
