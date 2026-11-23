from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencias import cliente_actual
from app.schemas.resena import ResenaEntrada
from app.services import resena_service

router = APIRouter(prefix="/api/resenas", tags=["reseñas"])

# "producto" o "marca": las dos funcionan igual
Tipo = Literal["producto", "marca"]

NO_ENCONTRADO = {"producto": "Producto no encontrado.", "marca": "Marca no encontrada."}


def _o_404(tipo, funcion, *args):
    try:
        return funcion(*args)
    except resena_service.ObjetivoNoEncontrado:
        raise HTTPException(status_code=404, detail=NO_ENCONTRADO[tipo])


@router.get("/mias")
def mis_resenas(cliente=Depends(cliente_actual)):
    # Todas las reseñas del cliente con su estado (pendiente, aprobada o rechazada)
    return {"ok": True, "data": resena_service.mias(cliente["id_cliente"])}


@router.get("/{tipo}/{id_objetivo}")
def listar(
    tipo: Tipo,
    id_objetivo: int,
    limite: int = Query(default=10, ge=1, le=50),
    pagina: int = Query(default=1, ge=1, le=10000),
):
    # Público: solo las reseñas aprobadas, con el promedio y el desglose por estrellas
    datos = _o_404(tipo, resena_service.listar_publicas, tipo, id_objetivo, limite, pagina)
    return {"ok": True, "data": datos}


@router.get("/{tipo}/{id_objetivo}/mia")
def ver_mia(tipo: Tipo, id_objetivo: int, cliente=Depends(cliente_actual)):
    # Mi reseña de este producto/marca (null si todavía no escribo una)
    return {"ok": True, "data": resena_service.mia(tipo, cliente["id_cliente"], id_objetivo)}


@router.put("/{tipo}/{id_objetivo}/mia")
def guardar(tipo: Tipo, id_objetivo: int, datos: ResenaEntrada, cliente=Depends(cliente_actual)):
    # Crea mi reseña o la edita. Queda pendiente hasta que un administrador la apruebe.
    resena = _o_404(tipo, resena_service.guardar, tipo, cliente["id_cliente"], id_objetivo, datos)
    return {"ok": True, "data": resena}


@router.delete("/{tipo}/{id_objetivo}/mia")
def borrar(tipo: Tipo, id_objetivo: int, cliente=Depends(cliente_actual)):
    try:
        resena_service.borrar_mia(tipo, cliente["id_cliente"], id_objetivo)
    except resena_service.ResenaNoEncontrada:
        raise HTTPException(status_code=404, detail="Todavía no tienes una reseña aquí.")
    return {"ok": True, "mensaje": "Reseña eliminada."}
