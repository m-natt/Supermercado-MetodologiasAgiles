from app.database import consultar


def buscar(codigo_postal):
    filas = consultar(
        """SELECT codigo_postal, ciudad, costo_envio, tiempo_estimado_min
           FROM zonas_cobertura
           WHERE codigo_postal = %s AND activo = 1""",
        (codigo_postal,),
    )
    return filas[0] if filas else None