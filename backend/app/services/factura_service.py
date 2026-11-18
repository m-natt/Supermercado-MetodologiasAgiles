"""Facturas SIMULADAS: no son CFDI reales ni tienen validez fiscal.

Reglas:
- Solo clientes con cuenta (sesión iniciada) y solo sus propios pedidos.
- Solo pedidos PAGADOS (pago aprobado).
- Una factura por pedido.
- IVA 16% a todo. Los precios de la tienda ya incluyen el IVA: la factura
  solo lo desglosa (base = importe / 1.16).
"""
import uuid
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from app.database import consultar, transaccion

TASA_IVA = Decimal("0.16")
CENTAVOS = Decimal("0.01")

# Emisor ficticio (RFC inventado y marcado como simulación)
EMISOR = {
    "rfc": "SIMU000101SIM",
    "nombre": "SUPERMERCADO BONITO :3 (SIMULACION)",
    "regimen_fiscal": "601",
    "lugar_expedicion": "64000",
}

# Forma de pago del SAT según el método de pago de la tienda
FORMAS_PAGO = {
    "efectivo": ("01", "Efectivo"),
    "transferencia": ("03", "Transferencia electrónica de fondos"),
    "tarjeta": ("04", "Tarjeta de crédito"),
    "tarjeta_linea": ("04", "Tarjeta de crédito"),
}


class FacturaNoEncontrada(Exception):
    pass


class FacturaInvalida(Exception):
    pass


def _redondear(valor):
    return Decimal(valor).quantize(CENTAVOS, rounding=ROUND_HALF_UP)


def _desglosar(importe_con_iva):
    """Separa un importe que ya incluye IVA en (base, iva)."""
    importe = _redondear(importe_con_iva)
    base = _redondear(importe / (1 + TASA_IVA))
    return base, importe - base


def _pedido_del_cliente(cursor, id_cliente, id_pedido, bloquear=False):
    cursor.execute(
        f"""SELECT p.id_pedido, p.id_cliente, p.fecha, p.total, p.costo_envio,
                   (SELECT pg.estado FROM pagos pg WHERE pg.id_pedido = p.id_pedido
                    ORDER BY pg.id_pago DESC LIMIT 1) AS pago_estado,
                   (SELECT pg.metodo FROM pagos pg WHERE pg.id_pedido = p.id_pedido
                    ORDER BY pg.id_pago DESC LIMIT 1) AS metodo_pago
            FROM pedidos p
            WHERE p.id_pedido = %s AND p.id_cliente = %s
            {"FOR UPDATE" if bloquear else ""}""",
        (id_pedido, id_cliente),
    )
    pedido = cursor.fetchone()
    if pedido is None:
        # Igual si no existe o es de otro cliente: no se revelan pedidos ajenos
        raise FacturaNoEncontrada()
    return pedido


def _conceptos(cursor, pedido):
    """Productos del pedido (y el envío) con su IVA desglosado."""
    cursor.execute(
        """SELECT d.cantidad, d.precio_unitario, pr.nombre, pr.unidad
           FROM detalle_pedido d
           JOIN productos pr ON pr.id_producto = d.id_producto
           WHERE d.id_pedido = %s
           ORDER BY d.id_detalle""",
        (pedido["id_pedido"],),
    )
    conceptos = []
    for fila in cursor.fetchall():
        cantidad = Decimal(fila["cantidad"])
        base, iva = _desglosar(Decimal(fila["precio_unitario"]) * cantidad)
        conceptos.append({
            "descripcion": fila["nombre"],
            "unidad": fila["unidad"],
            "clave_unidad": "KGM" if fila["unidad"].lower() == "kg" else "H87",
            "clave_prod_serv": "01010101",
            # 2.000 -> 2 (pero 1.250 kg se queda igual)
            "cantidad": Decimal(int(cantidad)) if cantidad == cantidad.to_integral() else cantidad,
            "valor_unitario": (base / cantidad).quantize(Decimal("0.000001")),
            "importe": base,
            "iva": iva,
        })
    if Decimal(pedido["costo_envio"]) > 0:
        base, iva = _desglosar(pedido["costo_envio"])
        conceptos.append({
            "descripcion": "Servicio de envío a domicilio",
            "unidad": "Servicio",
            "clave_unidad": "E48",
            "clave_prod_serv": "78102203",
            "cantidad": Decimal(1),
            "valor_unitario": base.quantize(Decimal("0.000001")),
            "importe": base,
            "iva": iva,
        })
    return conceptos


def _meta(fila):
    """Lo que la página necesita saber de una factura."""
    return {
        "id_factura": fila["id_factura"],
        "id_pedido": fila["id_pedido"],
        "folio": f"F-{fila['id_factura']:06d}",
        "uuid": fila["uuid"],
        "fecha": fila["fecha"],
        "rfc": fila["rfc"],
        "razon_social": fila["razon_social"],
        "subtotal": fila["subtotal"],
        "iva": fila["iva"],
        "total": fila["total"],
    }


# ---------- Datos fiscales guardados ----------

def datos_fiscales(id_cliente):
    filas = consultar(
        """SELECT rfc, razon_social, regimen_fiscal, codigo_postal, uso_cfdi
           FROM datos_fiscales WHERE id_cliente = %s""",
        (id_cliente,),
    )
    return filas[0] if filas else None


# ---------- Consultar y crear ----------

def estado_de_pedido(id_cliente, id_pedido):
    """Para la página: datos del pedido y su factura (si ya tiene)."""
    with transaccion() as cursor:
        pedido = _pedido_del_cliente(cursor, id_cliente, id_pedido)
        cursor.execute("SELECT * FROM facturas WHERE id_pedido = %s", (id_pedido,))
        factura = cursor.fetchone()
    return {
        "pedido": {
            "id_pedido": pedido["id_pedido"],
            "fecha": pedido["fecha"],
            "total": pedido["total"],
            "pago_estado": pedido["pago_estado"],
            "facturable": pedido["pago_estado"] == "aprobado",
        },
        "factura": _meta(factura) if factura else None,
    }


def crear(id_cliente, id_pedido, datos):
    with transaccion() as cursor:
        pedido = _pedido_del_cliente(cursor, id_cliente, id_pedido, bloquear=True)
        if pedido["pago_estado"] != "aprobado":
            raise FacturaInvalida("Solo se pueden facturar pedidos pagados.")
        cursor.execute("SELECT id_factura FROM facturas WHERE id_pedido = %s", (id_pedido,))
        if cursor.fetchone():
            raise FacturaInvalida("Este pedido ya tiene factura.")

        conceptos = _conceptos(cursor, pedido)
        subtotal = sum((c["importe"] for c in conceptos), Decimal("0.00"))
        iva = sum((c["iva"] for c in conceptos), Decimal("0.00"))

        valores = (datos.rfc, datos.razon_social, datos.regimen_fiscal, datos.codigo_postal, datos.uso_cfdi)
        cursor.execute(
            """INSERT INTO facturas
               (id_pedido, id_cliente, uuid, fecha, rfc, razon_social, regimen_fiscal,
                codigo_postal, uso_cfdi, subtotal, iva, total)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (id_pedido, id_cliente, str(uuid.uuid4()).upper(), datetime.now().replace(microsecond=0))
            + valores + (subtotal, iva, subtotal + iva),
        )
        id_factura = cursor.lastrowid

        if datos.guardar:
            cursor.execute(
                """INSERT INTO datos_fiscales
                   (id_cliente, rfc, razon_social, regimen_fiscal, codigo_postal, uso_cfdi)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON DUPLICATE KEY UPDATE rfc = VALUES(rfc), razon_social = VALUES(razon_social),
                     regimen_fiscal = VALUES(regimen_fiscal), codigo_postal = VALUES(codigo_postal),
                     uso_cfdi = VALUES(uso_cfdi)""",
                (id_cliente,) + valores,
            )

        cursor.execute("SELECT * FROM facturas WHERE id_factura = %s", (id_factura,))
        return _meta(cursor.fetchone())


def documento(id_cliente, id_factura):
    """Todo lo necesario para generar el PDF o el XML de una factura."""
    with transaccion() as cursor:
        cursor.execute(
            "SELECT * FROM facturas WHERE id_factura = %s AND id_cliente = %s",
            (id_factura, id_cliente),
        )
        factura = cursor.fetchone()
        if factura is None:
            raise FacturaNoEncontrada()
        pedido = _pedido_del_cliente(cursor, id_cliente, factura["id_pedido"])
        conceptos = _conceptos(cursor, pedido)
    forma = FORMAS_PAGO.get(pedido["metodo_pago"], ("99", "Por definir"))
    return {
        **_meta(factura),
        "regimen_fiscal": factura["regimen_fiscal"],
        "codigo_postal": factura["codigo_postal"],
        "uso_cfdi": factura["uso_cfdi"],
        "fecha_pedido": pedido["fecha"],
        "forma_pago": forma,
        "emisor": EMISOR,
        "conceptos": conceptos,
    }
