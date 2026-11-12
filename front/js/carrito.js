// Carrito guardado en el navegador (localStorage).
// Solo guarda lo necesario para mostrarlo; al confirmar el pedido el backend
// vuelve a revisar precios y stock con la base de datos.
const Carrito = (() => {
  const KEY = "supermercado_carrito";
  const MAX_CANTIDAD = 999;

  function limite(item) {
    const stock = Number(item.stock);
    return Number.isFinite(stock) && stock > 0 ? Math.min(stock, MAX_CANTIDAD) : MAX_CANTIDAD;
  }

  function esValido(item) {
    return item && Number.isInteger(item.id_producto) && Number.isInteger(item.cantidad) && item.cantidad > 0;
  }

  function leer() {
    try {
      const datos = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(datos) ? datos.filter(esValido) : [];
    } catch {
      return [];
    }
  }

  function guardar(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      // Navegación privada o almacenamiento lleno: el carrito no se conserva
    }
    actualizarContador();
  }

  function agregar(producto, cantidad = 1) {
    const items = leer();
    const id = Number(producto.id_producto);
    let item = items.find(i => i.id_producto === id);
    if (!item) {
      item = {
        id_producto: id,
        nombre: producto.nombre || "Producto",
        precio: Number(producto.precio) || 0,
        unidad: producto.unidad || "unidad",
        imagen_url: producto.imagen_url || "",
        stock: Number(producto.stock) || 0,
        cantidad: 0,
      };
      items.push(item);
    } else {
      // Refresca precio y stock por si cambiaron desde que se agregó
      item.precio = Number(producto.precio) || item.precio;
      item.stock = Number(producto.stock) || item.stock;
    }
    const antes = item.cantidad;
    item.cantidad = Math.min(item.cantidad + cantidad, limite(item));
    guardar(items);
    return item.cantidad > antes; // false si ya estaba al máximo
  }

  function cambiarCantidad(id, cantidad) {
    const items = leer();
    const item = items.find(i => i.id_producto === id);
    if (!item) return;
    item.cantidad = Math.max(1, Math.min(Math.trunc(cantidad) || 1, limite(item)));
    guardar(items);
  }

  function quitar(id) {
    guardar(leer().filter(i => i.id_producto !== id));
  }

  function vaciar() {
    guardar([]);
  }

  function unidades() {
    return leer().reduce((suma, i) => suma + i.cantidad, 0);
  }

  function subtotal() {
    return leer().reduce((suma, i) => suma + i.precio * i.cantidad, 0);
  }

  function actualizarContador() {
    const total = unidades();
    document.querySelectorAll("[data-cart-count]").forEach(el => {
      el.textContent = total > 99 ? "99+" : String(total);
      el.hidden = total === 0;
    });
  }

  // Si el carrito cambia en otra pestaña, actualiza el contador aquí
  window.addEventListener("storage", e => { if (e.key === KEY) actualizarContador(); });
  document.addEventListener("DOMContentLoaded", actualizarContador);

  return { leer, agregar, cambiarCantidad, quitar, vaciar, unidades, subtotal, limite, MAX_CANTIDAD };
})();
