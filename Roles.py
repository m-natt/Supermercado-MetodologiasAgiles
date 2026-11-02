from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from functools import wraps
from itertools import count


class Permission(Enum):
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
    VENDEDOR = "vendedor"
    MODERADOR = "moderador"
    CLIENTE = "cliente"


P = Permission
ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.VENDEDOR: frozenset({
        P.SUBIR_PRODUCTO, P.MODIFICAR_PRECIO,
        P.AGREGAR_DESCRIPCION, P.ELIMINAR_PROPIO_PRODUCTO,
    }),
    Role.MODERADOR: frozenset({
        P.ELIMINAR_PRODUCTO, P.ELIMINAR_RESENA, P.BANEAR_USUARIO,
    }),
    Role.CLIENTE: frozenset({
        P.VER_PRODUCTOS, P.DEJAR_RESENA, P.COMPRAR,
    }),
}


class StoreError(Exception):
    """Error base de la tienda."""


class PermissionDenied(StoreError):
    pass


class UserBanned(StoreError):
    pass


class NotFound(StoreError):
    pass


@dataclass
class User:
    id: int
    name: str
    role: Role
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


@dataclass
class Review:
    id: int
    product_id: int
    author_id: int
    rating: int
    comment: str




def require_permission(permission: Permission):
    """Verifica que el usuario (primer argumento tras self) no esté baneado
    y tenga el permiso indicado."""
    def decorator(func):
        @wraps(func)
        def wrapper(self, user: User, *args, **kwargs):
            if user.banned:
                raise UserBanned(f"{user.name} está baneado.")
            if not user.has_permission(permission):
                raise PermissionDenied(
                    f"{user.name} ({user.role.value}) no tiene el permiso "
                    f"{permission.name}."
                )
            return func(self, user, *args, **kwargs)
        return wrapper
    return decorator


@dataclass
class Store:
    products: dict[int, Product] = field(default_factory=dict)
    reviews: dict[int, Review] = field(default_factory=dict)
    users: dict[int, User] = field(default_factory=dict)
    _product_ids: count = field(default_factory=lambda: count(1), repr=False)
    _review_ids: count = field(default_factory=lambda: count(1), repr=False)
    _user_ids: count = field(default_factory=lambda: count(1), repr=False)

    # --- Usuarios ---
    def register(self, name: str, role: Role) -> User:
        user = User(next(self._user_ids), name, role)
        self.users[user.id] = user
        return user

    # --- Utilidades internas ---
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
                       description: str = "") -> Product:
        if price <= 0:
            raise ValueError("El precio debe ser mayor a 0.")
        product = Product(next(self._product_ids), user.id, name, price, description)
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
        target = self.users.get(target_id)
        if target is None:
            raise NotFound(f"Usuario {target_id} no existe.")
        if target.role is Role.MODERADOR:
            raise PermissionDenied("No se puede banear a otro moderador.")
        target.banned = True
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

    @require_permission(Permission.COMPRAR)
    def comprar(self, user: User, product_id: int, quantity: int = 1) -> float:
        product = self._get_product(product_id)
        if quantity < 1:
            raise ValueError("La cantidad debe ser al menos 1.")
        return product.price * quantity

    # --- Interno ---
    def _remove_product(self, product_id: int) -> None:
        del self.products[product_id]
        # Las reseñas de un producto eliminado ya no tienen sentido
        self.reviews = {rid: r for rid, r in self.reviews.items()
                        if r.product_id != product_id}




def _intentar(descripcion: str, accion):
    try:
        resultado = accion()
        print(f"✅ {descripcion} -> {resultado}")
    except StoreError as e:
        print(f"⛔ {descripcion} -> {e}")


if __name__ == "__main__":
    tienda = Store()
    vendedor = tienda.register("Ana", Role.VENDEDOR)
    otro_vendedor = tienda.register("Luis", Role.VENDEDOR)
    moderador = tienda.register("Marta", Role.MODERADOR)
    cliente = tienda.register("Carlos", Role.CLIENTE)

    producto = tienda.subir_producto(vendedor, "Audífonos", 499.0)
    print(f"Producto creado: {producto}\n")

    _intentar("Vendedor agrega descripción",
              lambda: tienda.agregar_descripcion(vendedor, producto.id, "Bluetooth 5.3"))
    _intentar("Vendedor cambia precio",
              lambda: tienda.modificar_precio(vendedor, producto.id, 449.0))
    _intentar("Otro vendedor intenta cambiar precio ajeno",
              lambda: tienda.modificar_precio(otro_vendedor, producto.id, 1.0))
    _intentar("Cliente intenta subir producto",
              lambda: tienda.subir_producto(cliente, "Laptop", 9999.0))
    _intentar("Cliente ve productos",
              lambda: tienda.ver_productos(cliente))
    _intentar("Cliente deja reseña",
              lambda: tienda.dejar_resena(cliente, producto.id, 5, "Excelentes"))
    _intentar("Cliente compra 2 unidades",
              lambda: tienda.comprar(cliente, producto.id, 2))
    _intentar("Moderador elimina reseña",
              lambda: tienda.eliminar_resena(moderador, 1))
    _intentar("Moderador banea al cliente",
              lambda: tienda.banear_usuario(moderador, cliente.id))
    _intentar("Cliente baneado intenta comprar",
              lambda: tienda.comprar(cliente, producto.id))
    _intentar("Moderador elimina producto",
              lambda: tienda.eliminar_producto(moderador, producto.id))