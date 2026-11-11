from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.schemas.producto import ProductoEntrada
from app.services import producto_service

router = APIRouter(prefix="/api/productos", tags=["productos"])


def _buscar_o_404(id_producto):
    producto = producto_service.obtener(id_producto)
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    return producto


@router.get("")
def listar(
    id_categoria: Optional[int] = None,
    id_marca: Optional[int] = None,
    precio_min: Optional[Decimal] = Query(default=None, ge=0),
    precio_max: Optional[Decimal] = Query(default=None, ge=0),
    incluir_inactivos: bool = False,
):
    # Filtros opcionales, se pueden combinar:
    # /api/productos?id_categoria=2&id_marca=5&precio_min=10&precio_max=50
    if precio_min is not None and precio_max is not None and precio_min > precio_max:
        raise HTTPException(
            status_code=400,
            detail="El precio minimo no puede ser mayor que el precio maximo.",
        )
    productos = producto_service.listar(
        id_categoria, incluir_inactivos, id_marca, precio_min, precio_max
    )
    return {"ok": True, "data": productos}


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
