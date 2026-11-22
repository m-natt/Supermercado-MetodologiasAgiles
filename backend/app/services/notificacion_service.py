from app.database import consultar


def notificaciones_del_cliente(id_cliente, limite=30):
    """Avisos de cambios de estado de los pedidos del cliente autenticado."""
    return consultar(
        """SELECT id_notificacion, id_pedido, estado, mensaje, fecha
           FROM notificaciones_pedido
           WHERE id_cliente = %s
           ORDER BY fecha DESC, id_notificacion DESC
           LIMIT %s""",
        (id_cliente, limite),
    )
