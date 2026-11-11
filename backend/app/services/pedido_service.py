from datetime import datetime, timedelta
from decimal import Decimal

from app.database import transaccion

# Reglas de envío (js/checkout.js muestra las mismas; si cambian aquí, cámbialas allá)
COSTO_ENVIO = Decimal("49.00")
ENVIO_GRATIS_DESDE = Decimal("500.00")
DIAS_ENTREGA = 2

# Los pedidos sin cuenta crean un cliente "invitado". Esta contraseña no es un
# hash válido, así que esa cuenta no puede iniciar sesión hasta que se registre.
CONTRASENA_INVITADO = "!"

CENTAVOS = Decimal("0.01")


class PedidoInvalido(Exception):
    """El pedido no se puede crear (producto inexistente, sin stock, etc.)."""


def calcular_envio(subtotal):
    return Decimal("0.00") if subtotal >= ENVIO_GRATIS_DESDE else COSTO_ENVIO


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

        subtotal = sum((linea["subtotal"] for linea in lineas), Decimal("0.00"))
        costo_envio = calcular_envio(subtotal)
        total = subtotal + costo_envio

        if cliente_sesion:
            id_cliente = cliente_sesion["id_cliente"]
        else:
            id_cliente = _obtener_o_crear_cliente(cursor, datos.cliente)

        d = datos.direccion
        cursor.execute(
            """INSERT INTO direcciones (id_cliente, calle, colonia, ciudad, codigo_postal, referencias)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (id_cliente, d.calle, d.colonia, d.ciudad, d.codigo_postal, d.referencias),
        )
        id_direccion = cursor.lastrowid

        fecha = datetime.now().replace(microsecond=0)
        fecha_entrega = fecha + timedelta(days=DIAS_ENTREGA)
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
        "metodo_pago": datos.metodo_pago,
        "cliente": {
            "nombre": datos.cliente.nombre,
            "apellidos": datos.cliente.apellidos,
            # Con sesión, el pedido es de la cuenta aunque se escriba otro correo
            "correo": cliente_sesion["correo"] if cliente_sesion else datos.cliente.correo,
        },
        "direccion": d.model_dump(),
        "items": lineas,
        "subtotal": subtotal,
        "costo_envio": costo_envio,
        "total": total,
    }
