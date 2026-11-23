from app.database import consultar, transaccion
from app.services.resena_service import OBJETIVOS, ResenaNoEncontrada, _ahora

ESTADOS = ("pendiente", "aprobada", "rechazada")


def _select(tipo):
    cfg = OBJETIVOS[tipo]
    return f"""SELECT r.id_resena, r.{cfg['columna']} AS id_objetivo, o.nombre AS objetivo,
                      r.calificacion, r.titulo, r.comentario, r.estado, r.compra_verificada,
                      r.motivo_rechazo, r.fecha, r.fecha_moderacion,
                      c.id_cliente, c.nombre AS autor_nombre, c.apellidos AS autor_apellidos,
                      c.correo AS autor_correo
               FROM {cfg['tabla']} r
               JOIN clientes c ON c.id_cliente = r.id_cliente
               JOIN {cfg['origen']} o ON o.{cfg['columna']} = r.{cfg['columna']}"""


def _armar(tipo, f):
    autor = " ".join(parte for parte in (f["autor_nombre"], f["autor_apellidos"]) if parte)
    return {
        "tipo": tipo,
        "id_resena": f["id_resena"],
        "id_objetivo": f["id_objetivo"],
        "objetivo": f["objetivo"],
        "calificacion": int(f["calificacion"]),
        "titulo": f["titulo"],
        "comentario": f["comentario"],
        "estado": f["estado"],
        "compra_verificada": bool(f["compra_verificada"]),
        "motivo_rechazo": f["motivo_rechazo"],
        "fecha": f["fecha"],
        "fecha_moderacion": f["fecha_moderacion"],
        "id_cliente": f["id_cliente"],
        "autor": autor,
        "correo": f["autor_correo"],
    }


def listar(tipo, estado="pendiente", limite=100):
    """Reseñas para moderar. Las pendientes salen de la más antigua a la más nueva
    (así se atienden en orden); las demás, de la más nueva a la más antigua."""
    sql = _select(tipo)
    params = []
    if estado in ESTADOS:
        sql += " WHERE r.estado = %s"
        params.append(estado)
    orden = "ASC" if estado == "pendiente" else "DESC"
    sql += f" ORDER BY r.fecha {orden}, r.id_resena {orden} LIMIT %s"
    params.append(limite)
    return [_armar(tipo, f) for f in consultar(sql, params)]


def resumen():
    """Cuántas reseñas hay en cada estado, para mostrar el aviso de pendientes."""
    datos = {}
    for tipo, cfg in OBJETIVOS.items():
        cuentas = {estado: 0 for estado in ESTADOS}
        for fila in consultar(f"SELECT estado, COUNT(*) AS n FROM {cfg['tabla']} GROUP BY estado"):
            if fila["estado"] in cuentas:
                cuentas[fila["estado"]] = int(fila["n"])
        datos[tipo] = cuentas
    datos["pendientes"] = sum(datos[tipo]["pendiente"] for tipo in OBJETIVOS)
    return datos


def _uno(tipo, id_resena):
    filas = consultar(_select(tipo) + " WHERE r.id_resena = %s", (id_resena,))
    return _armar(tipo, filas[0]) if filas else None


def cambiar_estado(tipo, id_resena, estado, motivo, id_moderador):
    """Aprueba, rechaza (con motivo opcional) o regresa a pendiente una reseña."""
    cfg = OBJETIVOS[tipo]
    with transaccion() as cursor:
        cursor.execute(
            f"SELECT id_resena FROM {cfg['tabla']} WHERE id_resena = %s FOR UPDATE", (id_resena,)
        )
        if cursor.fetchone() is None:
            raise ResenaNoEncontrada()
        pendiente = estado == "pendiente"
        cursor.execute(
            f"""UPDATE {cfg['tabla']}
                SET estado = %s, motivo_rechazo = %s, fecha_moderacion = %s, id_moderador = %s
                WHERE id_resena = %s""",
            (
                estado,
                motivo if estado == "rechazada" else None,
                None if pendiente else _ahora(),
                None if pendiente else id_moderador,
                id_resena,
            ),
        )
    return _uno(tipo, id_resena)


def eliminar(tipo, id_resena):
    cfg = OBJETIVOS[tipo]
    with transaccion() as cursor:
        cursor.execute(f"DELETE FROM {cfg['tabla']} WHERE id_resena = %s", (id_resena,))
        if cursor.rowcount == 0:
            raise ResenaNoEncontrada()
