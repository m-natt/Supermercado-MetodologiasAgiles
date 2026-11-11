from fastapi import APIRouter, Depends, HTTPException

from app.dependencias import cliente_opcional
from app.schemas.pedido import PedidoEntrada
from app.services import pedido_service

router = APIRouter(prefix="/api/pedidos", tags=["pedidos"])


@router.post("", status_code=201)
def crear(datos: PedidoEntrada, cliente=Depends(cliente_opcional)):
    # Valida stock y precios, guarda el pedido y descuenta el inventario
    # en una sola transacción. Con sesión iniciada, el pedido queda en esa cuenta.
    try:
        pedido = pedido_service.crear(datos, cliente)
    except pedido_service.PedidoInvalido as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"ok": True, "data": pedido}
