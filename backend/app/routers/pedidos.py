from fastapi import APIRouter, Depends, HTTPException

from app.dependencias import cliente_opcional
from app.schemas.pedido import EntregaEntrada, PagoTarjetaEntrada, PedidoEntrada
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


@router.post("/{id_pedido}/pago-tarjeta")
def pagar_con_tarjeta(id_pedido: int, datos: PagoTarjetaEntrada, cliente=Depends(cliente_opcional)):
    # Pago SIMULADO: solo recibe los últimos 4 dígitos y el vencimiento.
    try:
        pago = pedido_service.pagar_con_tarjeta(id_pedido, datos, cliente)
    except pedido_service.PedidoNoEncontrado:
        raise HTTPException(status_code=404, detail="No encontramos ese pedido.")
    except pedido_service.PedidoInvalido as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"ok": True, "data": pago}


@router.put("/{id_pedido}/entrega")
def programar_entrega(id_pedido: int, datos: EntregaEntrada, cliente=Depends(cliente_opcional)):
    # El cliente elige día y franja de 2 horas. Se guarda en pedidos.fecha_entrega.
    try:
        entrega = pedido_service.programar_entrega(id_pedido, datos, cliente)
    except pedido_service.PedidoNoEncontrado:
        raise HTTPException(status_code=404, detail="No encontramos ese pedido.")
    except pedido_service.PedidoInvalido as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"ok": True, "data": entrega}