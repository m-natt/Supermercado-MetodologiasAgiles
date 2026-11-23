from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencias import admin_actual
from app.schemas.resena import EstadoResenaEntrada
from app.services import moderacion_service, resena_service

# Todo este router exige sesión iniciada con rol "administrador"
router = APIRouter(prefix="/api/admin/resenas", tags=["moderación"], dependencies=[Depends(admin_actual)])

Tipo = Literal["producto", "marca"]


@router.get("/resumen")
def resumen():
    # Cuántas reseñas hay en cada estado (y cuántas esperan moderación)
    return {"ok": True, "data": moderacion_service.resumen()}


@router.get("")
def listar(
    tipo: Tipo = "producto",
    estado: Literal["pendiente", "aprobada", "rechazada", "todas"] = "pendiente",
    limite: int = Query(default=100, ge=1, le=300),
):
    return {"ok": True, "data": moderacion_service.listar(tipo, estado, limite)}


@router.put("/{tipo}/{id_resena}/estado")
def cambiar_estado(tipo: Tipo, id_resena: int, datos: EstadoResenaEntrada, admin=Depends(admin_actual)):
    # {"estado": "aprobada"}  o  {"estado": "rechazada", "motivo": "Lenguaje ofensivo"}
    try:
        resena = moderacion_service.cambiar_estado(
            tipo, id_resena, datos.estado, datos.motivo, admin["id_cliente"]
        )
    except resena_service.ResenaNoEncontrada:
        raise HTTPException(status_code=404, detail="Reseña no encontrada.")
    return {"ok": True, "data": resena}


@router.delete("/{tipo}/{id_resena}")
def eliminar(tipo: Tipo, id_resena: int):
    try:
        moderacion_service.eliminar(tipo, id_resena)
    except resena_service.ResenaNoEncontrada:
        raise HTTPException(status_code=404, detail="Reseña no encontrada.")
    return {"ok": True, "mensaje": "Reseña eliminada."}
