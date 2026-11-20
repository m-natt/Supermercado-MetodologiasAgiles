from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencias import admin_actual
from app.services import admin_service

# Todo este router exige sesión iniciada con rol "administrador"
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(admin_actual)])


class EstadoEntrada(BaseModel):
    estado: Literal["confirmado", "preparando", "en_camino", "entregado", "cancelado"]


class RolEntrada(BaseModel):
    rol: Literal["cliente", "administrador"]


def _o_error(funcion, *args):
    try:
        return funcion(*args)
    except admin_service.NoEncontrado:
        raise HTTPException(status_code=404, detail="No encontrado.")
    except admin_service.AdminInvalido as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/resumen")
def resumen():
    return {"ok": True, "data": admin_service.resumen()}


@router.get("/pedidos")
def pedidos(estado: Optional[str] = None, limite: int = Query(default=100, ge=1, le=500)):
    if estado and estado not in admin_service.ESTADOS_PEDIDO:
        raise HTTPException(status_code=400, detail="Estado de pedido no válido.")
    return {"ok": True, "data": admin_service.listar_pedidos(estado, limite)}


@router.put("/pedidos/{id_pedido}/estado")
def cambiar_estado(id_pedido: int, datos: EstadoEntrada):
    return {"ok": True, "data": _o_error(admin_service.cambiar_estado_pedido, id_pedido, datos.estado)}


@router.get("/clientes")
def clientes():
    return {"ok": True, "data": admin_service.listar_clientes()}


@router.put("/clientes/{id_cliente}/rol")
def cambiar_rol(id_cliente: int, datos: RolEntrada, admin=Depends(admin_actual)):
    return {"ok": True, "data": _o_error(admin_service.cambiar_rol, id_cliente, datos.rol, admin["id_cliente"])}
