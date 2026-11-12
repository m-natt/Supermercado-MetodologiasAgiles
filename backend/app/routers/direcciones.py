from fastapi import APIRouter, Depends, HTTPException

from app.dependencias import cliente_actual
from app.schemas.direccion import DireccionEntrada
from app.services import direccion_service

router = APIRouter(prefix="/api/clientes/direcciones", tags=["direcciones"])


def _cliente_id(cliente):
    return cliente["id_cliente"]


@router.get("")
def listar(cliente=Depends(cliente_actual)):
    return {"ok": True, "data": direccion_service.listar(_cliente_id(cliente))}


@router.post("", status_code=201)
def crear(datos: DireccionEntrada, cliente=Depends(cliente_actual)):
    id_direccion = direccion_service.crear(_cliente_id(cliente), datos)
    direccion = direccion_service.obtener(_cliente_id(cliente), id_direccion)
    return {"ok": True, "data": direccion}


@router.put("/{id_direccion}")
def actualizar(
    id_direccion: int,
    datos: DireccionEntrada,
    cliente=Depends(cliente_actual),
):
    id_cliente = _cliente_id(cliente)
    if direccion_service.obtener(id_cliente, id_direccion) is None:
        raise HTTPException(status_code=404, detail="La dirección no existe.")
    direccion_service.actualizar(id_cliente, id_direccion, datos)
    return {
        "ok": True,
        "data": direccion_service.obtener(id_cliente, id_direccion),
    }


@router.delete("/{id_direccion}")
def eliminar(id_direccion: int, cliente=Depends(cliente_actual)):
    id_cliente = _cliente_id(cliente)
    if direccion_service.obtener(id_cliente, id_direccion) is None:
        raise HTTPException(status_code=404, detail="La dirección no existe.")
    direccion_service.eliminar(id_cliente, id_direccion)
    return {"ok": True, "mensaje": "Dirección eliminada."}
