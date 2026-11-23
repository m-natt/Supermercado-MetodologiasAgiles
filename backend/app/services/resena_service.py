from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from app.database import consultar, transaccion

# Las dos clases de reseña comparten la misma estructura. Estos nombres de tabla y
# columna son fijos (nunca vienen del usuario), por eso es seguro ponerlos en el SQL.
OBJETIVOS = {
    "producto": {
        "tabla": "resenas_producto",
        "columna": "id_producto",
        "origen": "productos",
        # ¿Este cliente compró (y no canceló) este producto?
        "compra": """SELECT 1 AS ok
                     FROM detalle_pedido d JOIN pedidos p ON p.id_pedido = d.id_pedido
                     WHERE p.id_cliente = %s AND d.id_producto = %s AND p.estado <> 'cancelado'
                     LIMIT 1""",
    },
    "marca": {
        "tabla": "resenas_marca",
        "columna": "id_marca",
        "origen": "marcas",
        # ¿Este cliente compró (y no canceló) algo de esta marca?
        "compra": """SELECT 1 AS ok
                     FROM detalle_pedido d
                     JOIN pedidos p ON p.id_pedido = d.id_pedido
                     JOIN productos pr ON pr.id_producto = d.id_producto
                     WHERE p.id_cliente = %s AND pr.id_marca = %s AND p.estado <> 'cancelado'
                     LIMIT 1""",
    },
}


class ObjetivoNoEncontrado(Exception):
    """El producto o la marca no existe."""


class ResenaNoEncontrada(Exception):
    pass


def _ahora():
    return datetime.now().replace(microsecond=0)


def _existe(tipo, id_objetivo):
    cfg = OBJETIVOS[tipo]
    filas = consultar(
        f"SELECT 1 AS ok FROM {cfg['origen']} WHERE {cfg['columna']} = %s", (id_objetivo,)
    )
    return bool(filas)


def _compro(tipo, id_cliente, id_objetivo):
    return bool(consultar(OBJETIVOS[tipo]["compra"], (id_cliente, id_objetivo)))


def _autor(nombre, apellidos):
    """'Alex V.': nombre y la inicial del apellido. Nunca se muestra el correo."""
    partes = (nombre or "").split()
    primero = partes[0] if partes else "Cliente"
    inicial = (apellidos or "").strip()[:1].upper()
    return f"{primero} {inicial}." if inicial else primero


def resumen(tipo, id_objetivo):
    """Promedio y cuántas reseñas hay de cada calificación (solo las aprobadas)."""
    cfg = OBJETIVOS[tipo]
    filas = consultar(
        f"""SELECT calificacion, COUNT(*) AS n
            FROM {cfg['tabla']}
            WHERE {cfg['columna']} = %s AND estado = 'aprobada'
            GROUP BY calificacion""",
        (id_objetivo,),
    )
    distribucion = {str(i): 0 for i in range(1, 6)}
    for fila in filas:
        distribucion[str(int(fila["calificacion"]))] = int(fila["n"])
    total = sum(distribucion.values())
    promedio = None
    if total:
        suma = sum(int(estrellas) * n for estrellas, n in distribucion.items())
        promedio = float((Decimal(suma) / Decimal(total)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
    return {"promedio": promedio, "total": total, "distribucion": distribucion}


def listar_publicas(tipo, id_objetivo, limite=10, pagina=1):
    """Las reseñas aprobadas de un producto o marca, las más nuevas primero."""
    if not _existe(tipo, id_objetivo):
        raise ObjetivoNoEncontrado()
    cfg = OBJETIVOS[tipo]
    filas = consultar(
        f"""SELECT r.id_resena, r.calificacion, r.titulo, r.comentario, r.compra_verificada,
                   r.fecha, c.nombre, c.apellidos
            FROM {cfg['tabla']} r
            JOIN clientes c ON c.id_cliente = r.id_cliente
            WHERE r.{cfg['columna']} = %s AND r.estado = 'aprobada'
            ORDER BY r.fecha DESC, r.id_resena DESC
            LIMIT %s OFFSET %s""",
        (id_objetivo, limite, (pagina - 1) * limite),
    )
    resenas = [
        {
            "id_resena": f["id_resena"],
            "calificacion": int(f["calificacion"]),
            "titulo": f["titulo"],
            "comentario": f["comentario"],
            "compra_verificada": bool(f["compra_verificada"]),
            "fecha": f["fecha"],
            "autor": _autor(f["nombre"], f["apellidos"]),
        }
        for f in filas
    ]
    datos_resumen = resumen(tipo, id_objetivo)
    return {
        "resumen": datos_resumen,
        "resenas": resenas,
        "pagina": pagina,
        "limite": limite,
        "hay_mas": pagina * limite < datos_resumen["total"],
    }


_COLUMNAS_PROPIAS = """id_resena, calificacion, titulo, comentario, estado, motivo_rechazo,
                       compra_verificada, fecha"""


def _propia(fila):
    if fila is None:
        return None
    return {
        "id_resena": fila["id_resena"],
        "calificacion": int(fila["calificacion"]),
        "titulo": fila["titulo"],
        "comentario": fila["comentario"],
        "estado": fila["estado"],
        "motivo_rechazo": fila["motivo_rechazo"],
        "compra_verificada": bool(fila["compra_verificada"]),
        "fecha": fila["fecha"],
    }


def mia(tipo, id_cliente, id_objetivo):
    """La reseña de este cliente (de cualquier estado) o None."""
    cfg = OBJETIVOS[tipo]
    filas = consultar(
        f"""SELECT {_COLUMNAS_PROPIAS} FROM {cfg['tabla']}
            WHERE {cfg['columna']} = %s AND id_cliente = %s""",
        (id_objetivo, id_cliente),
    )
    return _propia(filas[0]) if filas else None


def guardar(tipo, id_cliente, id_objetivo, datos):
    """Crea la reseña del cliente o la edita.

    Una reseña nueva (o editada) queda 'pendiente' hasta que un administrador la
    apruebe. Si el cliente guarda lo mismo que ya tenía, no pasa nada: así una
    reseña aprobada no vuelve a moderación por darle "guardar" sin cambiar nada.
    """
    if not _existe(tipo, id_objetivo):
        raise ObjetivoNoEncontrado()
    cfg = OBJETIVOS[tipo]
    verificada = 1 if _compro(tipo, id_cliente, id_objetivo) else 0

    with transaccion() as cursor:
        cursor.execute(
            f"""SELECT id_resena, calificacion, titulo, comentario, compra_verificada
                FROM {cfg['tabla']}
                WHERE {cfg['columna']} = %s AND id_cliente = %s FOR UPDATE""",
            (id_objetivo, id_cliente),
        )
        actual = cursor.fetchone()
        if actual is None:
            cursor.execute(
                f"""INSERT INTO {cfg['tabla']}
                    ({cfg['columna']}, id_cliente, calificacion, titulo, comentario,
                     estado, compra_verificada, fecha)
                    VALUES (%s, %s, %s, %s, %s, 'pendiente', %s, %s)""",
                (id_objetivo, id_cliente, datos.calificacion, datos.titulo, datos.comentario,
                 verificada, _ahora()),
            )
        else:
            igual = (
                int(actual["calificacion"]) == datos.calificacion
                and actual["titulo"] == datos.titulo
                and actual["comentario"] == datos.comentario
            )
            if not igual:
                cursor.execute(
                    f"""UPDATE {cfg['tabla']}
                        SET calificacion = %s, titulo = %s, comentario = %s, estado = 'pendiente',
                            motivo_rechazo = NULL, compra_verificada = %s, fecha = %s,
                            fecha_moderacion = NULL, id_moderador = NULL
                        WHERE id_resena = %s""",
                    (datos.calificacion, datos.titulo, datos.comentario, verificada, _ahora(),
                     actual["id_resena"]),
                )
            elif int(actual["compra_verificada"]) != verificada:
                cursor.execute(
                    f"UPDATE {cfg['tabla']} SET compra_verificada = %s WHERE id_resena = %s",
                    (verificada, actual["id_resena"]),
                )
    return mia(tipo, id_cliente, id_objetivo)


def borrar_mia(tipo, id_cliente, id_objetivo):
    cfg = OBJETIVOS[tipo]
    with transaccion() as cursor:
        cursor.execute(
            f"DELETE FROM {cfg['tabla']} WHERE {cfg['columna']} = %s AND id_cliente = %s",
            (id_objetivo, id_cliente),
        )
        if cursor.rowcount == 0:
            raise ResenaNoEncontrada()


def mias(id_cliente):
    """Todas las reseñas del cliente (productos y marcas), las más nuevas primero."""
    filas = consultar(
        """SELECT 'producto' AS tipo, r.id_resena, r.id_producto AS id_objetivo, p.nombre AS objetivo,
                  r.calificacion, r.titulo, r.comentario, r.estado, r.motivo_rechazo,
                  r.compra_verificada, r.fecha
           FROM resenas_producto r JOIN productos p ON p.id_producto = r.id_producto
           WHERE r.id_cliente = %s
           UNION ALL
           SELECT 'marca' AS tipo, r.id_resena, r.id_marca AS id_objetivo, m.nombre AS objetivo,
                  r.calificacion, r.titulo, r.comentario, r.estado, r.motivo_rechazo,
                  r.compra_verificada, r.fecha
           FROM resenas_marca r JOIN marcas m ON m.id_marca = r.id_marca
           WHERE r.id_cliente = %s
           ORDER BY fecha DESC""",
        (id_cliente, id_cliente),
    )
    return [
        {
            "tipo": f["tipo"],
            "id_resena": f["id_resena"],
            "id_objetivo": f["id_objetivo"],
            "objetivo": f["objetivo"],
            "calificacion": int(f["calificacion"]),
            "titulo": f["titulo"],
            "comentario": f["comentario"],
            "estado": f["estado"],
            "motivo_rechazo": f["motivo_rechazo"],
            "compra_verificada": bool(f["compra_verificada"]),
            "fecha": f["fecha"],
        }
        for f in filas
    ]
