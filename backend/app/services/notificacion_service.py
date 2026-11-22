from app.database import consultar, ejecutar


def notificaciones_del_cliente(id_cliente, limite=30):
    """Avisos de cambios de estado de los pedidos del cliente autenticado."""
    filas = consultar(
        """SELECT id_notificacion, id_pedido, estado, mensaje, fecha, leida
           FROM notificaciones_pedido
           WHERE id_cliente = %s
           ORDER BY fecha DESC, id_notificacion DESC
           LIMIT %s""",
        (id_cliente, limite),
    )
    for f in filas:
        f["leida"] = bool(f["leida"])
    return filas


def marcar_leidas(id_cliente):
    """Marca como leídos todos los avisos del cliente. Devuelve cuántos cambiaron."""
    conteo = consultar(
        "SELECT COUNT(*) AS n FROM notificaciones_pedido WHERE id_cliente = %s AND leida = 0",
        (id_cliente,),
    )[0]["n"]
    if conteo:
        ejecutar("UPDATE notificaciones_pedido SET leida = 1 WHERE id_cliente = %s AND leida = 0", (id_cliente,))
    return conteo
