from decimal import Decimal, ROUND_CEILING

from app.database import consultar

# Mismo tope que usa schemas/pedido.py para una línea del pedido
MAX_CANTIDAD = 999
CENTAVOS = Decimal("0.01")


def _decimal(valor):
    return Decimal(str(valor))


def _cantidad(valor):
    """Cantidad para mostrar: entero si es entero (2 en vez de 2.000)."""
    d = _decimal(valor)
    return int(d) if d == d.to_integral_value() else float(d)


def _entero(valor):
    """Cantidad entera para volver a pedir (mínimo 1)."""
    return max(1, int(_decimal(valor).to_integral_value(rounding=ROUND_CEILING)))


def pedidos_del_cliente(id_cliente, limite=20):
    """Los pedidos más recientes del cliente, cada uno con sus productos."""
    pedidos = consultar(
        """SELECT p.id_pedido, p.fecha, p.estado, p.total, p.costo_envio, p.fecha_entrega,
                  (SELECT pg.metodo FROM pagos pg
                   WHERE pg.id_pedido = p.id_pedido
                   ORDER BY pg.id_pago DESC LIMIT 1) AS metodo_pago,
                  (SELECT pg.estado FROM pagos pg
                   WHERE pg.id_pedido = p.id_pedido
                   ORDER BY pg.id_pago DESC LIMIT 1) AS pago_estado,
                  (SELECT f.id_factura FROM facturas f
                   WHERE f.id_pedido = p.id_pedido) AS id_factura
           FROM pedidos p
           WHERE p.id_cliente = %s
           ORDER BY p.fecha DESC, p.id_pedido DESC
           LIMIT %s""",
        (id_cliente, limite),
    )
    if not pedidos:
        return []

    ids = [p["id_pedido"] for p in pedidos]
    marcadores = ", ".join(["%s"] * len(ids))
    filas = consultar(
        f"""SELECT d.id_pedido, d.id_producto, pr.nombre, pr.unidad, pr.imagen_url,
                   pr.activo, d.cantidad, d.precio_unitario
            FROM detalle_pedido d
            JOIN productos pr ON pr.id_producto = d.id_producto
            WHERE d.id_pedido IN ({marcadores})
            ORDER BY d.id_detalle""",
        ids,
    )

    items_por_pedido = {}
    for f in filas:
        items_por_pedido.setdefault(f["id_pedido"], []).append({
            "id_producto": f["id_producto"],
            "nombre": f["nombre"],
            "unidad": f["unidad"],
            "imagen_url": f["imagen_url"],
            "disponible": bool(f["activo"]),
            "cantidad": _cantidad(f["cantidad"]),
            "precio_unitario": f["precio_unitario"],
            "subtotal": (_decimal(f["precio_unitario"]) * _decimal(f["cantidad"])).quantize(CENTAVOS),
        })

    resultado = []
    for p in pedidos:
        items = items_por_pedido.get(p["id_pedido"], [])
        resultado.append({
            "id_pedido": p["id_pedido"],
            "fecha": p["fecha"],
            "estado": p["estado"],
            "metodo_pago": p["metodo_pago"],
            "pago_estado": p["pago_estado"],
            "id_factura": p["id_factura"],  # None si todavía no tiene factura
            "fecha_entrega": p["fecha_entrega"],
            "costo_envio": p["costo_envio"],
            "total": p["total"],
            "unidades": sum(i["cantidad"] for i in items),
            "items": items,
        })
    return resultado


def frecuentes(id_cliente, limite=12):
    """Los productos que más ha comprado el cliente (solo los que siguen a la venta)."""
    filas = consultar(
        """SELECT pr.id_producto, pr.nombre, pr.precio, pr.unidad, pr.stock, pr.imagen_url,
                  c.nombre AS categoria, m.nombre AS marca,
                  COUNT(DISTINCT p.id_pedido) AS veces_comprado,
                  SUM(d.cantidad) AS unidades_totales,
                  MAX(p.fecha) AS ultima_compra
           FROM detalle_pedido d
           JOIN pedidos p ON p.id_pedido = d.id_pedido
           JOIN productos pr ON pr.id_producto = d.id_producto
           JOIN categorias c ON c.id_categoria = pr.id_categoria
           LEFT JOIN marcas m ON m.id_marca = pr.id_marca
           WHERE p.id_cliente = %s AND pr.activo = 1
           GROUP BY pr.id_producto, pr.nombre, pr.precio, pr.unidad, pr.stock,
                    pr.imagen_url, c.nombre, m.nombre
           ORDER BY veces_comprado DESC, unidades_totales DESC, ultima_compra DESC, pr.nombre ASC
           LIMIT %s""",
        (id_cliente, limite),
    )
    resultado = []
    for f in filas:
        veces = int(f["veces_comprado"])
        promedio = _decimal(f["unidades_totales"]) / veces
        habitual = max(1, min(MAX_CANTIDAD, int(promedio + Decimal("0.5"))))  # redondeo normal
        resultado.append({
            "id_producto": f["id_producto"],
            "nombre": f["nombre"],
            "categoria": f["categoria"],
            "marca": f["marca"],
            "unidad": f["unidad"],
            "precio": f["precio"],
            "stock": f["stock"],
            "imagen_url": f["imagen_url"],
            "disponible": f["stock"] > 0,
            "veces_comprado": veces,
            "unidades_totales": _cantidad(f["unidades_totales"]),
            "cantidad_habitual": habitual,
            "ultima_compra": f["ultima_compra"],
        })
    return resultado


def reorden_de_pedido(id_cliente, id_pedido):
    """Qué productos de un pedido anterior se pueden volver a pedir hoy.

    Revisa el stock y el precio ACTUALES. Devuelve None si el pedido no existe
    o no es de este cliente (en ambos casos igual, para no revelar pedidos ajenos).
    """
    pedido = consultar(
        "SELECT id_pedido FROM pedidos WHERE id_pedido = %s AND id_cliente = %s",
        (id_pedido, id_cliente),
    )
    if not pedido:
        return None

    filas = consultar(
        """SELECT d.id_producto, d.cantidad, pr.nombre, pr.precio, pr.unidad,
                  pr.stock, pr.imagen_url, pr.activo
           FROM detalle_pedido d
           JOIN productos pr ON pr.id_producto = d.id_producto
           WHERE d.id_pedido = %s
           ORDER BY d.id_detalle""",
        (id_pedido,),
    )

    agregados = []
    omitidos = []
    for f in filas:
        if not f["activo"]:
            omitidos.append({"id_producto": f["id_producto"], "nombre": f["nombre"],
                             "motivo": "Ya no está disponible."})
            continue
        if f["stock"] <= 0:
            omitidos.append({"id_producto": f["id_producto"], "nombre": f["nombre"],
                             "motivo": "Está agotado por ahora."})
            continue
        pedida = _entero(f["cantidad"])
        cantidad = min(pedida, f["stock"], MAX_CANTIDAD)
        agregados.append({
            "id_producto": f["id_producto"],
            "nombre": f["nombre"],
            "unidad": f["unidad"],
            "imagen_url": f["imagen_url"],
            "precio": f["precio"],  # precio de hoy, no el de aquella compra
            "stock": f["stock"],
            "cantidad": cantidad,
            "cantidad_original": pedida,
            "ajustada": cantidad < pedida,
        })
    return {"id_pedido": id_pedido, "agregados": agregados, "omitidos": omitidos}
