"""Facturas SIMULADAS. Todo exige sesión de cliente: los invitados no facturan."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.dependencias import cliente_actual
from app.schemas.factura import REGIMENES_FISCALES, USOS_CFDI, DatosFiscalesEntrada
from app.services import factura_documentos, factura_service

router = APIRouter(tags=["facturas"])


def _no_encontrada():
    return HTTPException(status_code=404, detail="No encontramos esa factura o pedido.")


@router.get("/api/facturas/catalogos")
def catalogos():
    # Para llenar los <select> de la página
    return {"ok": True, "data": {"regimenes": REGIMENES_FISCALES, "usos_cfdi": USOS_CFDI}}


@router.get("/api/clientes/yo/datos-fiscales")
def mis_datos_fiscales(cliente=Depends(cliente_actual)):
    return {"ok": True, "data": factura_service.datos_fiscales(cliente["id_cliente"])}


@router.get("/api/pedidos/{id_pedido}/factura")
def factura_del_pedido(id_pedido: int, cliente=Depends(cliente_actual)):
    try:
        return {"ok": True, "data": factura_service.estado_de_pedido(cliente["id_cliente"], id_pedido)}
    except factura_service.FacturaNoEncontrada:
        raise _no_encontrada()


@router.post("/api/pedidos/{id_pedido}/factura", status_code=201)
def facturar(id_pedido: int, datos: DatosFiscalesEntrada, cliente=Depends(cliente_actual)):
    try:
        factura = factura_service.crear(cliente["id_cliente"], id_pedido, datos)
    except factura_service.FacturaNoEncontrada:
        raise _no_encontrada()
    except factura_service.FacturaInvalida as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"ok": True, "data": factura}


def _descarga(id_factura, cliente, tipo):
    try:
        datos = factura_service.documento(cliente["id_cliente"], id_factura)
    except factura_service.FacturaNoEncontrada:
        raise _no_encontrada()
    if tipo == "pdf":
        contenido, media = factura_documentos.generar_pdf(datos), "application/pdf"
    else:
        contenido, media = factura_documentos.generar_xml(datos), "application/xml"
    nombre = f"factura-{datos['folio']}-simulacion.{tipo}"
    return Response(
        content=contenido,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.get("/api/facturas/{id_factura}/pdf")
def descargar_pdf(id_factura: int, cliente=Depends(cliente_actual)):
    return _descarga(id_factura, cliente, "pdf")


@router.get("/api/facturas/{id_factura}/xml")
def descargar_xml(id_factura: int, cliente=Depends(cliente_actual)):
    return _descarga(id_factura, cliente, "xml")
