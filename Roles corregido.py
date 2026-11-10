"""Tienda: usuarios, roles, permisos y carrito de compras.

Une el sistema de usuarios (usuarios.html) con el de roles (Roles.py) y agrega
el carrito. Solo los roles CLIENTE y MODERADOR tienen el permiso COMPRAR, y todo
el carrito exige ese permiso.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, auto
from functools import wraps
from itertools import count


# ======================================================================
# Roles y permisos
# ======================================================================
class Permission(Enum):
    # Administrador
    VER_USUARIOS = auto()
    GESTIONAR_USUARIOS = auto()
    GESTIONAR_ROLES = auto()
    # Vendedor
    SUBIR_PRODUCTO = auto()
    MODIFICAR_PRECIO = auto()
    AGREGAR_DESCRIPCION = auto()
    ELIMINAR_PROPIO_PRODUCTO = auto()
    # Moderador
    ELIMINAR_PRODUCTO = auto()
    ELIMINAR_RESENA = auto()
    BANEAR_USUARIO = auto()
    # Cliente
    VER_PRODUCTOS = auto()
    DEJAR_RESENA = auto()
    COMPRAR = auto()


class Role(Enum):
    ADMINISTRADOR = "administrador"
    VENDEDOR = "vendedor"
    MODERADOR = "moderador"
    CLIENTE = "cliente"


P = Permission
ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.ADMINISTRADOR: frozenset({
        P.VER_USUARIOS, P.GESTIONAR_USUARIOS, P.GESTIONAR_ROLES,
    }),
    Role.VENDEDOR: frozenset({
        P.SUBIR_PRODUCTO, P.MODIFICAR_PRECIO,
        P.AGREGAR_DESCRIPCION, P.ELIMINAR_PROPIO_PRODUCTO,
    }),
    Role.MODERADOR: frozenset({
        P.VER_USUARIOS, P.ELIMINAR_PRODUCTO, P.ELIMINAR_RESENA,
        P.BANEAR_USUARIO,
        P.VER_PRODUCTOS, P.COMPRAR,  # el moderador también puede comprar
    }),
    Role.CLIENTE: frozenset({
        P.VER_PRODUCTOS, P.DEJAR_RESENA, P.COMPRAR,
    }),
}


# ======================================================================
# Errores
# ======================================================================
class StoreError(Exception):
    """Error base de la tienda."""


class PermissionDenied(StoreError):
    pass


class UserBanned(StoreError):
    pass


class NotFound(StoreError):
    pass


class OutOfStock(StoreError):
    pass


class AuthError(StoreError):
    pass


# ======================================================================
# Modelos
# ======================================================================
@dataclass
class User:
    id: int
    name: str
    username: str
    role: Role
    password_hash: str = field(default="", repr=False)
    active: bool = True
    banned: bool = False

    def has_permission(self, permission: Permission) -> bool:
        return permission in ROLE_PERMISSIONS[self.role]


@dataclass
class Product:
    id: int
    seller_id: int
    name: str
    price: float
    description: str = ""
    stock: int = 0


@dataclass
class Review:
    id: int
    product_id: int
    author_id: int
    rating: int
    comment: str


@dataclass
class CartLine:
    product: Product
    quantity: int

    @property
    def subtotal(self) -> float:
        return self.product.price * self.quantity


@dataclass
class OrderLine:
    product_id: int
    name: str
    unit_price: float
    quantity: int


@dataclass
class Order:
    id: int
    buyer_id: int
    lines: list[OrderLine]
    total: float
    created_at: datetime = field(default_factory=datetime.now)


# ======================================================================
# Contraseñas (hash con sal; nunca se guarda la contraseña en claro)
# ======================================================================
def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return f"{salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split("$")
    candidate = _hash_password(password, bytes.fromhex(salt_hex)).split("$")[1]
    return hmac.compare_digest(candidate, digest_hex)


# ======================================================================
# Decorador de permisos
# ======================================================================
def require_permission(permission: Permission):
    """Verifica que el usuario (primer argumento tras self) esté activo,
    no esté baneado y tenga el permiso indicado."""
    def decorator(func):
        @wraps(func)
        def wrapper(self, user: User, *args, **kwargs):
            if user.banned:
                raise UserBanned(f"{user.name} está baneado.")
            if not user.active:
                raise PermissionDenied(f"{user.name} está desactivado.")
            if not user.has_permission(permission):
                raise PermissionDenied(
                    f"{user.name} ({user.role.value}) no tiene el permiso "
                    f"{permission.name}."
                )
            return func(self, user, *args, **kwargs)
        return wrapper
    return decorator


_USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,40}$")


# ======================================================================
# Tienda
# ======================================================================
@dataclass
class Store:
    products: dict[int, Product] = field(default_factory=dict)
    reviews: dict[int, Review] = field(default_factory=dict)
    users: dict[int, User] = field(default_factory=dict)
    carts: dict[int, dict[int, int]] = field(default_factory=dict)  # user_id -> {product_id: cantidad}
    orders: dict[int, Order] = field(default_factory=dict)
    _product_ids: count = field(default_factory=lambda: count(1), repr=False)
    _review_ids: count = field(default_factory=lambda: count(1), repr=False)
    _user_ids: count = field(default_factory=lambda: count(1), repr=False)
    _order_ids: count = field(default_factory=lambda: count(1), repr=False)

    def __post_init__(self) -> None:
        # Igual que en usuarios.html: usuario inicial admin / Admin123!
        if not self.users:
            self._add_user("Administrador principal", "admin", "Admin123!", Role.ADMINISTRADOR)

    # --- Usuarios y sesión ---
    def _add_user(self, name: str, username: str, password: str, role: Role) -> User:
        if len(name.strip()) < 2:
            raise ValueError("Nombre demasiado corto.")
        if not _USERNAME_RE.match(username):
            raise ValueError("Usuario no válido (3-40 caracteres: letras, números . _ -).")
        if len(password) < 4:
            raise ValueError("La contraseña debe tener mínimo 4 caracteres.")
        if any(u.username.lower() == username.lower() for u in self.users.values()):
            raise ValueError("Ese usuario ya existe.")
        user = User(next(self._user_ids), name.strip(), username, role,
                    _hash_password(password))
        self.users[user.id] = user
        return user

    def register(self, name: str, username: str, password: str) -> User:
        """Registro público: siempre crea un CLIENTE."""
        return self._add_user(name, username, password, Role.CLIENTE)

    def login(self, username: str, password: str) -> User:
        user = next((u for u in self.users.values()
                     if u.username.lower() == username.strip().lower()), None)
        if user is None or not _verify_password(password, user.password_hash):
            raise AuthError("Usuario o contraseña incorrectos.")
        if user.banned:
            raise UserBanned(f"{user.name} está baneado.")
        if not user.active:
            raise AuthError("Usuario o contraseña incorrectos.")
        return user

    # --- Administrador ---
    @require_permission(Permission.GESTIONAR_USUARIOS)
    def crear_usuario(self, user: User, name: str, username: str,
                      password: str, role: Role) -> User:
        return self._add_user(name, username, password, role)

    @require_permission(Permission.GESTIONAR_USUARIOS)
    def cambiar_rol(self, user: User, target_id: int, role: Role) -> User:
        target = self._get_user(target_id)
        target.role = role
        if Permission.COMPRAR not in ROLE_PERMISSIONS[role]:
            self.carts.pop(target.id, None)  # ya no puede comprar: se descarta su carrito
        return target

    @require_permission(Permission.GESTIONAR_USUARIOS)
    def eliminar_usuario(self, user: User, target_id: int) -> None:
        if target_id == user.id:
            raise PermissionDenied("No puedes eliminar tu propia cuenta.")
        self._get_user(target_id)
        del self.users[target_id]
        self.carts.pop(target_id, None)

    @require_permission(Permission.VER_USUARIOS)
    def listar_usuarios(self, user: User) -> list[User]:
        return list(self.users.values())

    # --- Utilidades internas ---
    def _get_user(self, user_id: int) -> User:
        try:
            return self.users[user_id]
        except KeyError:
            raise NotFound(f"Usuario {user_id} no existe.") from None

    def _get_product(self, product_id: int) -> Product:
        try:
            return self.products[product_id]
        except KeyError:
            raise NotFound(f"Producto {product_id} no existe.") from None

    def _get_own_product(self, user: User, product_id: int) -> Product:
        product = self._get_product(product_id)
        if product.seller_id != user.id:
            raise PermissionDenied("Solo puedes modificar tus propios productos.")
        return product

    # --- Vendedor ---
    @require_permission(Permission.SUBIR_PRODUCTO)
    def subir_producto(self, user: User, name: str, price: float,
                       description: str = "", stock: int = 1) -> Product:
        if price <= 0:
            raise ValueError("El precio debe ser mayor a 0.")
        if stock < 0:
            raise ValueError("El stock no puede ser negativo.")
        product = Product(next(self._product_ids), user.id, name, price, description, stock)
        self.products[product.id] = product
        return product

    @require_permission(Permission.MODIFICAR_PRECIO)
    def modificar_precio(self, user: User, product_id: int, new_price: float) -> Product:
        if new_price <= 0:
            raise ValueError("El precio debe ser mayor a 0.")
        product = self._get_own_product(user, product_id)
        product.price = new_price
        return product

    @require_permission(Permission.AGREGAR_DESCRIPCION)
    def agregar_descripcion(self, user: User, product_id: int, description: str) -> Product:
        product = self._get_own_product(user, product_id)
        product.description = description
        return product

    @require_permission(Permission.ELIMINAR_PROPIO_PRODUCTO)
    def eliminar_producto_propio(self, user: User, product_id: int) -> None:
        self._get_own_product(user, product_id)
        self._remove_product(product_id)

    # --- Moderador ---
    @require_permission(Permission.ELIMINAR_PRODUCTO)
    def eliminar_producto(self, user: User, product_id: int) -> None:
        self._get_product(product_id)
        self._remove_product(product_id)

    @require_permission(Permission.ELIMINAR_RESENA)
    def eliminar_resena(self, user: User, review_id: int) -> None:
        if review_id not in self.reviews:
            raise NotFound(f"Reseña {review_id} no existe.")
        del self.reviews[review_id]

    @require_permission(Permission.BANEAR_USUARIO)
    def banear_usuario(self, user: User, target_id: int) -> User:
        target = self._get_user(target_id)
        if target.id == user.id:
            raise PermissionDenied("No puedes banearte a ti mismo.")
        if target.role in (Role.MODERADOR, Role.ADMINISTRADOR):
            raise PermissionDenied(f"No se puede banear a un {target.role.value}.")
        target.banned = True
        self.carts.pop(target.id, None)
        return target

    # --- Cliente ---
    @require_permission(Permission.VER_PRODUCTOS)
    def ver_productos(self, user: User) -> list[Product]:
        return list(self.products.values())

    @require_permission(Permission.DEJAR_RESENA)
    def dejar_resena(self, user: User, product_id: int, rating: int,
                     comment: str = "") -> Review:
        self._get_product(product_id)
        if not 1 <= rating <= 5:
            raise ValueError("La calificación debe estar entre 1 y 5.")
        review = Review(next(self._review_ids), product_id, user.id, rating, comment)
        self.reviews[review.id] = review
        return review

    # --- Carrito (solo roles con permiso COMPRAR: cliente y moderador) ---
    @require_permission(Permission.COMPRAR)
    def agregar_al_carrito(self, user: User, product_id: int, quantity: int = 1) -> list[CartLine]:
        product = self._get_product(product_id)
        if quantity < 1:
            raise ValueError("La cantidad debe ser al menos 1.")
        cart = self.carts.setdefault(user.id, {})
        new_quantity = cart.get(product_id, 0) + quantity
        if new_quantity > product.stock:
            raise OutOfStock(
                f"Solo hay {product.stock} unidad(es) de '{product.name}' en existencia."
            )
        cart[product_id] = new_quantity
        return self._cart_lines(user)

    @require_permission(Permission.COMPRAR)
    def cambiar_cantidad(self, user: User, product_id: int, quantity: int) -> list[CartLine]:
        """Fija la cantidad exacta. Con 0 el producto sale del carrito."""
        cart = self.carts.get(user.id, {})
        if product_id not in cart:
            raise NotFound(f"El producto {product_id} no está en tu carrito.")
        if quantity < 0:
            raise ValueError("La cantidad no puede ser negativa.")
        if quantity == 0:
            del cart[product_id]
        else:
            product = self._get_product(product_id)
            if quantity > product.stock:
                raise OutOfStock(
                    f"Solo hay {product.stock} unidad(es) de '{product.name}' en existencia."
                )
            cart[product_id] = quantity
        return self._cart_lines(user)

    @require_permission(Permission.COMPRAR)
    def quitar_del_carrito(self, user: User, product_id: int) -> list[CartLine]:
        cart = self.carts.get(user.id, {})
        if product_id not in cart:
            raise NotFound(f"El producto {product_id} no está en tu carrito.")
        del cart[product_id]
        return self._cart_lines(user)

    @require_permission(Permission.COMPRAR)
    def ver_carrito(self, user: User) -> list[CartLine]:
        return self._cart_lines(user)

    @require_permission(Permission.COMPRAR)
    def vaciar_carrito(self, user: User) -> None:
        self.carts.pop(user.id, None)

    @require_permission(Permission.COMPRAR)
    def finalizar_compra(self, user: User) -> Order:
        lines = self._cart_lines(user)
        if not lines:
            raise ValueError("Tu carrito está vacío.")
        # Se valida todo antes de tocar el inventario (compra atómica)
        for line in lines:
            if line.quantity > line.product.stock:
                raise OutOfStock(
                    f"Solo hay {line.product.stock} unidad(es) de "
                    f"'{line.product.name}' en existencia."
                )
        for line in lines:
            line.product.stock -= line.quantity
        order = Order(
            id=next(self._order_ids),
            buyer_id=user.id,
            lines=[OrderLine(l.product.id, l.product.name, l.product.price, l.quantity)
                   for l in lines],
            total=sum(l.subtotal for l in lines),
        )
        self.orders[order.id] = order
        self.carts.pop(user.id, None)
        return order

    @staticmethod
    def total_carrito(lines: list[CartLine]) -> float:
        return sum(l.subtotal for l in lines)

    # --- Interno ---
    def _cart_lines(self, user: User) -> list[CartLine]:
        cart = self.carts.get(user.id, {})
        return [CartLine(self.products[pid], qty)
                for pid, qty in cart.items() if pid in self.products]

    def _remove_product(self, product_id: int) -> None:
        del self.products[product_id]
        # Las reseñas de un producto eliminado ya no tienen sentido
        self.reviews = {rid: r for rid, r in self.reviews.items()
                        if r.product_id != product_id}
        # Y tampoco debe quedar en ningún carrito
        for cart in self.carts.values():
            cart.pop(product_id, None)


# ======================================================================
# Demostración
# ======================================================================
def _intentar(descripcion: str, accion):
    try:
        resultado = accion()
        print(f"✅ {descripcion} -> {resultado}")
    except (StoreError, ValueError) as e:
        print(f"⛔ {descripcion} -> {e}")


if __name__ == "__main__":
    tienda = Store()
    admin = tienda.login("admin", "Admin123!")
    vendedor = tienda.crear_usuario(admin, "Ana", "ana", "1234", Role.VENDEDOR)
    moderador = tienda.crear_usuario(admin, "Marta", "marta", "1234", Role.MODERADOR)
    cliente = tienda.register("Carlos", "carlos", "1234")

    audifonos = tienda.subir_producto(vendedor, "Audífonos", 499.0, stock=5)
    teclado = tienda.subir_producto(vendedor, "Teclado", 350.0, stock=1)
    print(f"Productos: {audifonos.name}, {teclado.name}\n")

    print("--- Quién puede comprar ---")
    _intentar("Cliente agrega 2 audífonos",
              lambda: tienda.agregar_al_carrito(cliente, audifonos.id, 2))
    _intentar("Moderador agrega 1 teclado",
              lambda: tienda.agregar_al_carrito(moderador, teclado.id))
    _intentar("Vendedor intenta agregar al carrito",
              lambda: tienda.agregar_al_carrito(vendedor, audifonos.id))
    _intentar("Administrador intenta agregar al carrito",
              lambda: tienda.agregar_al_carrito(admin, audifonos.id))

    print("\n--- Carrito del cliente ---")
    _intentar("Cliente pide más del stock",
              lambda: tienda.cambiar_cantidad(cliente, audifonos.id, 99))
    _intentar("Cliente agrega el teclado",
              lambda: tienda.agregar_al_carrito(cliente, teclado.id))
    _intentar("Cliente quita el teclado",
              lambda: tienda.quitar_del_carrito(cliente, teclado.id))
    carrito = tienda.ver_carrito(cliente)
    print(f"   Total del carrito: ${tienda.total_carrito(carrito):.2f}")

    print("\n--- Compra ---")
    _intentar("Cliente finaliza compra", lambda: tienda.finalizar_compra(cliente))
    print(f"   Stock de audífonos ahora: {audifonos.stock}")
    _intentar("Moderador finaliza compra", lambda: tienda.finalizar_compra(moderador))
    _intentar("Cliente finaliza con carrito vacío", lambda: tienda.finalizar_compra(cliente))

    print("\n--- Moderación ---")
    _intentar("Moderador banea al cliente", lambda: tienda.banear_usuario(moderador, cliente.id))
    _intentar("Cliente baneado intenta agregar al carrito",
              lambda: tienda.agregar_al_carrito(cliente, audifonos.id))
    _intentar("Cliente baneado intenta iniciar sesión",
              lambda: tienda.login("carlos", "1234"))
