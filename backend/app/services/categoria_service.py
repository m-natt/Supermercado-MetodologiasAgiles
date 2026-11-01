from app.database import consultar, ejecutar


def listar():
    return consultar("SELECT id_categoria, nombre FROM categorias ORDER BY nombre")


def obtener(id_categoria):
    filas = consultar(
        "SELECT id_categoria, nombre FROM categorias WHERE id_categoria = %s",
        (id_categoria,),
    )
    return filas[0] if filas else None


def crear(datos):
    nuevo_id = ejecutar("INSERT INTO categorias (nombre) VALUES (%s)", (datos.nombre,))
    return obtener(nuevo_id)


def actualizar(id_categoria, datos):
    ejecutar(
        "UPDATE categorias SET nombre = %s WHERE id_categoria = %s",
        (datos.nombre, id_categoria),
    )
    return obtener(id_categoria)


def eliminar(id_categoria):
    ejecutar("DELETE FROM categorias WHERE id_categoria = %s", (id_categoria,))
