from app.database import consultar, transaccion
from app.services.inventario_service import UMBRAL_DEFECTO

ROLES = ("cliente", "administrador")
ESTADOS_PEDIDO = ("confirmado", "preparando", "en_camino", "listo_para_recoger", "entregado", "cancelado")
ESTADOS_FINALES = ("entregado", "cancelado")
# Domicilio pasa por "en camino"; recolección pasa por "listo para recoger"
ESTADOS_POR_MODALIDAD = {
    "domicilio": ("confirmado", "preparando", "en_camino", "entregado", "cancelado"),
    "recoleccion_tienda": ("confirmado", "preparando", "listo_para_recoger", "entregado", "cancelado"),
}


class AdminInvalido(Exception):
    """La acción no se puede hacer (estado final, quitarte tu propio rol...)."""


class NoEncontrado(Exception):
    pass


def resumen():
    ventas = consultar(
        "SELECT COALESCE(SUM(total), 0) AS ventas, COUNT(*) AS pedidos "
        "FROM pedidos WHERE estado <> 'cancelado'"
    )[0]
    clientes = consultar("SELECT COUNT(*) AS n FROM clientes WHERE contrasena <> '!'")[0]["n"]
    productos = consultar(
        "SELECT COUNT(*) AS activos, COALESCE(SUM(stock <= %s), 0) AS bajo_stock "
        "FROM productos WHERE activo = 1", (UMBRAL_DEFECTO,)
    )[0]
    por_estado = {e: 0 for e in ESTADOS_PEDIDO}
    for fila in consultar("SELECT estado, COUNT(*) AS n FROM pedidos GROUP BY estado"):
        por_estado[fila["estado"]] = fila["n"]
    top = consultar(
        """SELECT pr.nombre, SUM(d.cantidad) AS vendidas
           FROM detalle_pedido d
           JOIN pedidos pe ON pe.id_pedido = d.id_pedido AND pe.estado <> 'cancelado'
           JOIN productos pr ON pr.id_producto = d.id_producto
           GROUP BY pr.id_producto, pr.nombre ORDER BY vendidas DESC LIMIT 5"""
    )
    return {
        "ventas": ventas["ventas"],
        "pedidos": ventas["pedidos"],
        "clientes": clientes,
        "productos_activos": productos["activos"],
        "productos_stock_bajo": int(productos["bajo_stock"]),
        "pedidos_por_estado": por_estado,
        "mas_vendidos": top,
        "ultimos_pedidos": listar_pedidos(limite=5),
    }


def listar_pedidos(estado=None, limite=100):
    sql = """SELECT p.id_pedido, p.fecha, p.estado, p.total, p.costo_envio, p.fecha_entrega,
                    p.modalidad_entrega, p.sucursal_recoleccion,
                    TRIM(CONCAT(c.nombre, ' ', COALESCE(c.apellidos, ''))) AS cliente, c.correo,
                    pa.metodo, pa.estado AS estado_pago
             FROM pedidos p
             JOIN clientes c ON c.id_cliente = p.id_cliente
             LEFT JOIN pagos pa ON pa.id_pedido = p.id_pedido"""
    params = []
    if estado:
        sql += " WHERE p.estado = %s"
        params.append(estado)
    sql += " ORDER BY p.fecha DESC, p.id_pedido DESC LIMIT %s"
    params.append(limite)
    return consultar(sql, params)


def cambiar_estado_pedido(id_pedido, nuevo):
    with transaccion() as cursor:
        cursor.execute(
            "SELECT id_cliente, estado, modalidad_entrega FROM pedidos WHERE id_pedido = %s FOR UPDATE",
            (id_pedido,),
        )
        fila = cursor.fetchone()
        if fila is None:
            raise NoEncontrado()
        anterior = fila["estado"]
        if anterior in ESTADOS_FINALES:
            raise AdminInvalido(f"El pedido ya está {anterior} y no se puede cambiar.")
        # Cada modalidad tiene su propio paso intermedio
        if nuevo not in ESTADOS_POR_MODALIDAD.get(fila["modalidad_entrega"], ESTADOS_PEDIDO):
            if fila["modalidad_entrega"] == "recoleccion_tienda":
                raise AdminInvalido("Un pedido para recoger en tienda no puede ir 'en camino'.")
            raise AdminInvalido("Solo los pedidos para recoger en tienda pueden estar 'listos para recoger'.")
        cursor.execute("UPDATE pedidos SET estado = %s WHERE id_pedido = %s", (nuevo, id_pedido))
        if nuevo != anterior:
            etiquetas = {
                "confirmado": "fue confirmado",
                "preparando": "está en preparación",
                "en_camino": "va en camino",
                "listo_para_recoger": "está listo para recoger en tienda",
                "entregado": "fue entregado",
                "cancelado": "fue cancelado",
            }
            mensaje = f"El pedido #{id_pedido} {etiquetas[nuevo]}."
            cursor.execute(
                """INSERT INTO notificaciones_pedido (id_cliente, id_pedido, estado, mensaje)
                   VALUES (%s, %s, %s, %s)""",
                (fila["id_cliente"], id_pedido, nuevo, mensaje),
            )
        if nuevo == "cancelado":
            # Al cancelar, la mercancía regresa al inventario
            cursor.execute(
                """UPDATE productos pr JOIN detalle_pedido d ON d.id_producto = pr.id_producto
                   SET pr.stock = pr.stock + d.cantidad WHERE d.id_pedido = %s""",
                (id_pedido,),
            )
    return {"id_pedido": id_pedido, "estado": nuevo, "estado_anterior": anterior}


def listar_clientes():
    return consultar(
        """SELECT c.id_cliente, c.nombre, c.apellidos, c.correo, c.telefono, c.rol, c.fecha_registro,
                  (SELECT COUNT(*) FROM pedidos p WHERE p.id_cliente = c.id_cliente) AS pedidos
           FROM clientes c WHERE c.contrasena <> '!' ORDER BY c.fecha_registro DESC"""
    )


def cambiar_rol(id_cliente, rol, id_admin):
    if id_cliente == id_admin:
        raise AdminInvalido("No puedes cambiar tu propio rol (te quedarías sin acceso).")
    with transaccion() as cursor:
        cursor.execute("UPDATE clientes SET rol = %s WHERE id_cliente = %s", (rol, id_cliente))
        cursor.execute("SELECT id_cliente, rol FROM clientes WHERE id_cliente = %s", (id_cliente,))
        fila = cursor.fetchone()
    if fila is None:
        raise NoEncontrado()
    return fila


