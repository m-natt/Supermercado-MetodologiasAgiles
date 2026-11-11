from fastapi import APIRouter, HTTPException

from app.schemas.pedido import PedidoEntrada
from app.services import pedido_service

router = APIRouter(prefix="/api/pedidos", tags=["pedidos"])


@router.post("", status_code=201)
def crear(datos: PedidoEntrada):
    # Valida stock y precios, guarda el pedido y descuenta el inventario
    # en una sola transacción.
    try:
        pedido = pedido_service.crear(datos)
    except pedido_service.PedidoInvalido as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"ok": True, "data": pedido}
