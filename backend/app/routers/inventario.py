from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencias import admin_actual

from app.schemas.inventario import AjusteEntrada, StockEntrada
from app.services import inventario_service

router = APIRouter(prefix="/api/inventario", tags=["inventario"], dependencies=[Depends(admin_actual)])


def _o_error(funcion, *args):
    try:
        return funcion(*args)
    except inventario_service.ProductoNoEncontrado:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    except inventario_service.AjusteInvalido as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("")
def inventario(
    umbral: int = Query(default=inventario_service.UMBRAL_DEFECTO, ge=0, le=100000),
    incluir_inactivos: bool = False,
):
    # Todo el inventario, lo más urgente primero.
    # umbral = hasta cuántas unidades se considera "stock bajo".
    return {"ok": True, "data": inventario_service.listar(umbral, incluir_inactivos)}


@router.get("/alertas")
def alertas(umbral: int = Query(default=inventario_service.UMBRAL_DEFECTO, ge=0, le=100000)):
    # Solo los productos agotados o con stock bajo
    return {"ok": True, "data": inventario_service.alertas(umbral)}


@router.post("/{id_producto}/ajuste")
def ajustar(
    id_producto: int,
    datos: AjusteEntrada,
    umbral: int = Query(default=inventario_service.UMBRAL_DEFECTO, ge=0, le=100000),
):
    # {"cantidad": 20} suma 20 unidades; {"cantidad": -3} resta 3
    return {"ok": True, "data": _o_error(inventario_service.ajustar, id_producto, datos.cantidad, umbral)}


@router.put("/{id_producto}/stock")
def fijar(
    id_producto: int,
    datos: StockEntrada,
    umbral: int = Query(default=inventario_service.UMBRAL_DEFECTO, ge=0, le=100000),
):
    # {"stock": 50} deja las existencias en 50
    return {"ok": True, "data": _o_error(inventario_service.fijar, id_producto, datos.stock, umbral)}
