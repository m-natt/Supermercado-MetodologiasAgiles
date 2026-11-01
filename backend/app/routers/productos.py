from typing import Optional

from fastapi import APIRouter, HTTPException

from app.schemas.producto import ProductoEntrada
from app.services import producto_service

router = APIRouter(prefix="/api/productos", tags=["productos"])


def _buscar_o_404(id_producto):
    producto = producto_service.obtener(id_producto)
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    return producto


@router.get("")
def listar(id_categoria: Optional[int] = None, incluir_inactivos: bool = False):
    return {"ok": True, "data": producto_service.listar(id_categoria, incluir_inactivos)}


@router.get("/{id_producto}")
def obtener(id_producto: int):
    return {"ok": True, "data": _buscar_o_404(id_producto)}


@router.post("", status_code=201)
def crear(datos: ProductoEntrada):
    # Si la categoria o marca no existen, main.py responde 409
    return {"ok": True, "data": producto_service.crear(datos)}


@router.put("/{id_producto}")
def actualizar(id_producto: int, datos: ProductoEntrada):
    _buscar_o_404(id_producto)
    return {"ok": True, "data": producto_service.actualizar(id_producto, datos)}


@router.delete("/{id_producto}")
def eliminar(id_producto: int):
    _buscar_o_404(id_producto)
    producto_service.eliminar(id_producto)
    return {"ok": True, "mensaje": "Producto desactivado."}
