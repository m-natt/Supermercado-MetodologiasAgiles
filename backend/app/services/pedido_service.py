from datetime import datetime, timedelta
from decimal import Decimal

from app.database import transaccion

# El costo y el tiempo de envío salen de la tabla zonas_cobertura (según el
# código postal). Arriba de este monto el envío es gratis.
# (js/checkout.js muestra la misma regla; si cambia aquí, cámbiala allá)
ENVIO_GRATIS_DESDE = Decimal("500.00")

# Los pedidos sin cuenta crean un cliente "invitado". Esta contraseña no es un
# hash válido, así que esa cuenta no puede iniciar sesión hasta que se registre.
CONTRASENA_INVITADO = "!"

CENTAVOS = Decimal("0.01")


class PedidoInvalido(Exception):
    """El pedido no se puede crear (producto inexistente, sin stock, etc.)."""


def calcular_envio(subtotal, costo_zona):
    return Decimal("0.00") if subtotal >= ENVIO_GRATIS_DESDE else Decimal(costo_zona)


def _zona_de_entrega(cursor, codigo_postal):
    cursor.execute(
        """SELECT ciudad, costo_envio, tiempo_estimado_min
           FROM zonas_cobertura
           WHERE codigo_postal = %s AND activo = 1""",
        (codigo_postal,),
    )
    zona = cursor.fetchone()
    if zona is None:
        raise PedidoInvalido(
            f"Por ahora no tenemos entrega en el código postal {codigo_postal}. "
            "Revisa la cobertura en la página principal."
        )
    return zona


def _bloquear_productos(cursor, ids):
    # FOR UPDATE bloquea las filas hasta el commit: dos compras simultáneas
    # no pueden vender el mismo stock. Se ordenan por id para evitar deadlocks.
    marcadores = ", ".join(["%s"] * len(ids))
    cursor.execute(
        f"""SELECT id_producto, nombre, precio, unidad, stock, imagen_url, activo
            FROM productos
            WHERE id_producto IN ({marcadores})
            ORDER BY id_producto
            FOR UPDATE""",
        sorted(ids),
    )
    return {p["id_producto"]: p for p in cursor.fetchall()}


def _armar_lineas(items, productos):
    lineas = []
    for item in items:
        producto = productos.get(item.id_producto)
        if producto is None or not producto["activo"]:
            raise PedidoInvalido(
                f"Uno de los productos de tu carrito (id {item.id_producto}) ya no está disponible."
            )
        if producto["stock"] < item.cantidad:
            raise PedidoInvalido(
                f'Solo quedan {producto["stock"]} de "{producto["nombre"]}". '
                "Ajusta la cantidad en tu carrito."
            )
        # El precio siempre sale de la base de datos, nunca del navegador
        precio = Decimal(producto["precio"])
        lineas.append({
            "id_producto": producto["id_producto"],
            "nombre": producto["nombre"],
            "unidad": producto["unidad"],
            "imagen_url": producto["imagen_url"],
            "precio": precio,
            "cantidad": item.cantidad,
            "subtotal": (precio * item.cantidad).quantize(CENTAVOS),
        })
    return lineas


def _obtener_o_crear_cliente(cursor, cliente):
    """Cliente para una compra SIN sesión iniciada."""
    cursor.execute("SELECT id_cliente, contrasena FROM clientes WHERE correo = %s", (cliente.correo,))
    fila = cursor.fetchone()
    if fila:
        if fila["contrasena"] != CONTRASENA_INVITADO:
            # Es una cuenta registrada: sin sesión, nadie puede comprar a su nombre
            raise PedidoInvalido("Ya existe una cuenta con ese correo. Inicia sesión para comprar con ella.")
        # Invitado que ya había comprado: no se modifican sus datos
        return fila["id_cliente"]
    cursor.execute(
        """INSERT INTO clientes (nombre, apellidos, correo, telefono, contrasena)
           VALUES (%s, %s, %s, %s, %s)""",
        (cliente.nombre, cliente.apellidos, cliente.correo, cliente.telefono, CONTRASENA_INVITADO),
    )
    return cursor.lastrowid


def crear(datos, cliente_sesion=None):
    """cliente_sesion: el cliente con sesión iniciada, o None si compra como invitado."""
    with transaccion() as cursor:
        productos = _bloquear_productos(cursor, [item.id_producto for item in datos.items])
        lineas = _armar_lineas(datos.items, productos)

        if cliente_sesion:
            id_cliente = cliente_sesion["id_cliente"]

            if datos.id_direccion is not None:
                cursor.execute(
                    """SELECT id_direccion, calle, colonia, ciudad, codigo_postal, referencias
                       FROM direcciones
                       WHERE id_direccion = %s AND id_cliente = %s AND activa = 1""",
                    (datos.id_direccion, id_cliente),
                )
                direccion = cursor.fetchone()
                if direccion is None:
                    raise PedidoInvalido("La dirección seleccionada no existe.")
                id_direccion = direccion["id_direccion"]
            else:
                d = datos.direccion
                cursor.execute(
                    """INSERT INTO direcciones
                       (id_cliente, calle, colonia, ciudad, codigo_postal, referencias)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (id_cliente, d.calle, d.colonia, d.ciudad, d.codigo_postal, d.referencias),
                )
                id_direccion = cursor.lastrowid
                direccion = {
                    "id_direccion": id_direccion,
                    "calle": d.calle,
                    "colonia": d.colonia,
                    "ciudad": d.ciudad,
                    "codigo_postal": d.codigo_postal,
                    "referencias": d.referencias,
                }
        else:
            # Los invitados no pueden usar direcciones guardadas.
            if datos.id_direccion is not None:
                raise PedidoInvalido("Inicia sesión para usar una dirección guardada.")
            id_cliente = _obtener_o_crear_cliente(cursor, datos.cliente)
            d = datos.direccion
            cursor.execute(
                """INSERT INTO direcciones
                   (id_cliente, calle, colonia, ciudad, codigo_postal, referencias)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (id_cliente, d.calle, d.colonia, d.ciudad, d.codigo_postal, d.referencias),
            )
            id_direccion = cursor.lastrowid
            direccion = {
                "id_direccion": id_direccion,
                "calle": d.calle,
                "colonia": d.colonia,
                "ciudad": d.ciudad,
                "codigo_postal": d.codigo_postal,
                "referencias": d.referencias,
            }

        zona = _zona_de_entrega(cursor, direccion["codigo_postal"])
        subtotal = sum((linea["subtotal"] for linea in lineas), Decimal("0.00"))
        costo_envio = calcular_envio(subtotal, zona["costo_envio"])
        total = subtotal + costo_envio

        fecha = datetime.now().replace(microsecond=0)
        minutos = zona["tiempo_estimado_min"]
        fecha_entrega = fecha + timedelta(minutes=minutos) if minutos else None  # None = por confirmar
        cursor.execute(
            """INSERT INTO pedidos (id_cliente, id_direccion, fecha, estado, total, costo_envio, fecha_entrega)
               VALUES (%s, %s, %s, 'confirmado', %s, %s, %s)""",
            (id_cliente, id_direccion, fecha, total, costo_envio, fecha_entrega),
        )
        id_pedido = cursor.lastrowid

        cursor.executemany(
            """INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario)
               VALUES (%s, %s, %s, %s)""",
            [(id_pedido, l["id_producto"], l["cantidad"], l["precio"]) for l in lineas],
        )
        cursor.executemany(
            "UPDATE productos SET stock = stock - %s WHERE id_producto = %s",
            [(l["cantidad"], l["id_producto"]) for l in lineas],
        )
        cursor.execute(
            """INSERT INTO pagos (id_pedido, metodo, monto, estado)
               VALUES (%s, %s, %s, 'pendiente')""",
            (id_pedido, datos.metodo_pago, total),
        )

    return {
        "id_pedido": id_pedido,
        "estado": "confirmado",
        "fecha": fecha,
        "fecha_entrega": fecha_entrega,
        "tiempo_estimado_min": minutos,
        "metodo_pago": datos.metodo_pago,
        "cliente": {
            "nombre": datos.cliente.nombre,
            "apellidos": datos.cliente.apellidos,
            # Con sesión, el pedido es de la cuenta aunque se escriba otro correo
            "correo": cliente_sesion["correo"] if cliente_sesion else datos.cliente.correo,
        },
        "direccion": {
            "calle": direccion["calle"],
            "colonia": direccion["colonia"],
            "ciudad": direccion["ciudad"],
            "codigo_postal": direccion["codigo_postal"],
            "referencias": direccion["referencias"],
        },
        "items": lineas,
        "subtotal": subtotal,
        "costo_envio": costo_envio,
        "total": total,
    }


# ---------- Pago con tarjeta en línea (SIMULADO) ----------
# No hay banco ni pasarela: el resultado depende de la tarjeta de prueba.
# La que termina en 0002 (4000 0000 0000 0002) siempre se rechaza.
TERMINACION_RECHAZO_SIMULADO = "0002"


class PedidoNoEncontrado(Exception):
    pass


def _tarjeta_vencida(vence):
    mes, anio = (int(x) for x in vence.split("/"))
    hoy = datetime.now()
    return (2000 + anio, mes) < (hoy.year, hoy.month)


def pagar_con_tarjeta(id_pedido, datos, cliente_sesion=None):
    """Registra el resultado de un pago simulado en la tabla pagos."""
    with transaccion() as cursor:
        cursor.execute(
            """SELECT p.id_cliente, c.contrasena, pa.id_pago, pa.metodo, pa.estado, pa.monto
               FROM pedidos p
               JOIN clientes c ON c.id_cliente = p.id_cliente
               JOIN pagos pa ON pa.id_pedido = p.id_pedido
               WHERE p.id_pedido = %s
               FOR UPDATE""",
            (id_pedido,),
        )
        fila = cursor.fetchone()
        if fila is None:
            raise PedidoNoEncontrado()
        # El pedido de una cuenta registrada solo lo puede pagar su dueño
        es_de_cuenta = fila["contrasena"] != CONTRASENA_INVITADO
        if es_de_cuenta and (not cliente_sesion or cliente_sesion["id_cliente"] != fila["id_cliente"]):
            raise PedidoNoEncontrado()
        if fila["metodo"] != "tarjeta_linea":
            raise PedidoInvalido("Este pedido no se paga con tarjeta en línea.")
        if fila["estado"] == "aprobado":
            raise PedidoInvalido("Este pedido ya está pagado.")
        if _tarjeta_vencida(datos.vence):
            raise PedidoInvalido("La tarjeta está vencida.")

        estado = "rechazado" if datos.ultimos4 == TERMINACION_RECHAZO_SIMULADO else "aprobado"
        cursor.execute(
            "UPDATE pagos SET estado = %s, fecha = %s WHERE id_pago = %s",
            (estado, datetime.now().replace(microsecond=0), fila["id_pago"]),
        )

    return {
        "id_pedido": id_pedido,
        "estado": estado,
        "monto": fila["monto"],
        "folio": f"SIM-{fila['id_pago']:06d}",
        "tarjeta": f"{datos.marca} •••• {datos.ultimos4}",
    }
