from app.database import consultar, ejecutar


def listar():
    return consultar("SELECT id_marca, nombre FROM marcas ORDER BY nombre")


def obtener(id_marca):
    filas = consultar(
        "SELECT id_marca, nombre FROM marcas WHERE id_marca = %s",
        (id_marca,),
    )
    return filas[0] if filas else None


def crear(datos):
    nuevo_id = ejecutar("INSERT INTO marcas (nombre) VALUES (%s)", (datos.nombre,))
    return obtener(nuevo_id)


def actualizar(id_marca, datos):
    ejecutar(
        "UPDATE marcas SET nombre = %s WHERE id_marca = %s",
        (datos.nombre, id_marca),
    )
    return obtener(id_marca)


def eliminar(id_marca):
    ejecutar("DELETE FROM marcas WHERE id_marca = %s", (id_marca,))
