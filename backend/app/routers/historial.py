from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencias import cliente_actual
from app.services import historial_service, notificacion_service

# Todo esto exige sesión iniciada: cada cliente solo ve sus propios pedidos
router = APIRouter(prefix="/api/clientes/yo", tags=["historial"])


@router.get("/pedidos")
def mis_pedidos(
    limite: int = Query(default=20, ge=1, le=100),
    cliente=Depends(cliente_actual),
):
    # Los pedidos más recientes primero, con sus productos
    return {"ok": True, "data": historial_service.pedidos_del_cliente(cliente["id_cliente"], limite)}


@router.get("/pedidos/{id_pedido}/reorden")
def reordenar(id_pedido: int, cliente=Depends(cliente_actual)):
    # No crea nada: solo dice qué productos de ese pedido se pueden volver a
    # pedir hoy. La página los agrega al carrito.
    reorden = historial_service.reorden_de_pedido(cliente["id_cliente"], id_pedido)
    if reorden is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    return {"ok": True, "data": reorden}


@router.get("/frecuentes")
def mis_frecuentes(
    limite: int = Query(default=12, ge=1, le=50),
    cliente=Depends(cliente_actual),
):
    # Los productos que más compra este cliente
    return {"ok": True, "data": historial_service.frecuentes(cliente["id_cliente"], limite)}


@router.get("/notificaciones")
def mis_notificaciones(
    limite: int = Query(default=30, ge=1, le=100),
    cliente=Depends(cliente_actual),
):
    # Solo se devuelven notificaciones de la cuenta autenticada.
    return {"ok": True, "data": notificacion_service.notificaciones_del_cliente(cliente["id_cliente"], limite)}


@router.put("/notificaciones/leidas")
def marcar_notificaciones_leidas(cliente=Depends(cliente_actual)):
    # La página lo llama después de mostrar los avisos nuevos
    return {"ok": True, "data": {"marcadas": notificacion_service.marcar_leidas(cliente["id_cliente"])}}
