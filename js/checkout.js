// Página de checkout: muestra el carrito, pide datos y crea el pedido.
// API_BASE, money() y makeText() vienen de js/config.js; Carrito de js/carrito.js

// Mismas reglas que backend/app/services/pedido_service.py (el backend manda)
const COSTO_ENVIO = 49;
const ENVIO_GRATIS_DESDE = 500;
const ULTIMO_PEDIDO_KEY = "supermercado_ultimo_pedido";

const form = document.getElementById("checkout-form");
const emptyBox = document.getElementById("checkout-empty");
const cartList = document.getElementById("cart-list");
const cartUnits = document.getElementById("cart-units");
const productsLabel = document.getElementById("summary-products-label");
const subtotalLabel = document.getElementById("summary-subtotal");
const shippingLabel = document.getElementById("summary-shipping");
const totalLabel = document.getElementById("summary-total");
const shippingHint = document.getElementById("shipping-hint");
const errorBox = document.getElementById("checkout-error");
const submitButton = document.getElementById("submit-order");

let sending = false;

function shippingFor(subtotal) {
  return subtotal >= ENVIO_GRATIS_DESDE ? 0 : COSTO_ENVIO;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function iconButton(label, text, onClick, focusKey) {
  const button = makeText("button", "qty-button", text);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.dataset.focus = focusKey;
  button.addEventListener("click", onClick);
  return button;
}

function cartRow(item) {
  const row = document.createElement("li");
  row.className = "cart-item";

  const thumb = document.createElement("div");
  thumb.className = "cart-item__thumb";
  if (item.imagen_url) {
    const image = document.createElement("img");
    image.src = item.imagen_url;
    image.alt = "";
    image.onerror = () => { image.replaceWith(makeText("span", "", "🛍️")); };
    thumb.append(image);
  } else {
    thumb.append(makeText("span", "", "🛍️"));
  }

  const info = document.createElement("div");
  info.className = "cart-item__info";
  info.append(makeText("p", "cart-item__name", item.nombre));
  info.append(makeText("p", "cart-item__price", `${money(item.precio)} / ${item.unidad}`));

  const qty = document.createElement("div");
  qty.className = "qty";
  const id = item.id_producto;
  const max = Carrito.limite(item);
  const minus = iconButton(`Quitar una unidad de ${item.nombre}`, "−",
    () => update(id, item.cantidad - 1), `minus-${id}`);
  minus.disabled = item.cantidad <= 1 || sending;
  const plus = iconButton(`Agregar una unidad de ${item.nombre}`, "+",
    () => update(id, item.cantidad + 1), `plus-${id}`);
  plus.disabled = item.cantidad >= max || sending;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = String(max);
  input.value = String(item.cantidad);
  input.className = "qty-input";
  input.disabled = sending;
  input.setAttribute("aria-label", `Cantidad de ${item.nombre}`);
  input.addEventListener("change", () => update(id, Number(input.value)));
  qty.append(minus, input, plus);

  const total = makeText("p", "cart-item__total", money(item.precio * item.cantidad));

  const remove = makeText("button", "remove-button", "Quitar");
  remove.type = "button";
  remove.disabled = sending;
  remove.setAttribute("aria-label", `Quitar ${item.nombre} del carrito`);
  remove.addEventListener("click", () => {
    Carrito.quitar(id);
    render();
  });

  row.append(thumb, info, qty, total, remove);
  return row;
}

function update(id, cantidad) {
  Carrito.cambiarCantidad(id, cantidad);
  render();
}

function render() {
  // Al redibujar se pierde el foco; se devuelve al mismo botón
  const focusKey = document.activeElement?.dataset?.focus;

  const items = Carrito.leer();
  const empty = items.length === 0;
  emptyBox.hidden = !empty;
  form.hidden = empty;
  if (empty) return;

  cartList.replaceChildren(...items.map(cartRow));

  const units = Carrito.unidades();
  const subtotal = Carrito.subtotal();
  const shipping = shippingFor(subtotal);
  cartUnits.textContent = `${units} ${units === 1 ? "artículo" : "artículos"}`;
  productsLabel.textContent = `Productos (${units})`;
  subtotalLabel.textContent = money(subtotal);
  shippingLabel.textContent = shipping === 0 ? "Gratis" : money(shipping);
  totalLabel.textContent = money(subtotal + shipping);
  shippingHint.textContent = shipping === 0
    ? "🎉 Tu pedido tiene envío gratis."
    : `Agrega ${money(ENVIO_GRATIS_DESDE - subtotal)} más para obtener envío gratis.`;

  if (focusKey) {
    const target = cartList.querySelector(`[data-focus="${focusKey}"]`);
    if (target && !target.disabled) target.focus();
  }
}

function setSending(value) {
  sending = value;
  submitButton.disabled = value;
  submitButton.textContent = value ? "Enviando pedido…" : "Confirmar pedido";
  form.querySelectorAll("input").forEach(input => { input.readOnly = value; });
  render();
}

function buildPayload() {
  const data = new FormData(form);
  const text = name => String(data.get(name) ?? "").trim();
  const optional = name => text(name) || null;
  return {
    cliente: {
      nombre: text("nombre"),
      apellidos: optional("apellidos"),
      correo: text("correo"),
      telefono: text("telefono"),
    },
    direccion: {
      calle: text("calle"),
      colonia: text("colonia"),
      ciudad: text("ciudad"),
      codigo_postal: text("codigo_postal"),
      referencias: optional("referencias"),
    },
    metodo_pago: text("metodo_pago"),
    items: Carrito.leer().map(i => ({ id_producto: i.id_producto, cantidad: i.cantidad })),
  };
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (sending) return;
  const payload = buildPayload();
  if (payload.items.length === 0) {
    render();
    return;
  }

  showError("");
  setSending(true);
  try {
    const response = await fetch(`${API_BASE}/api/pedidos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let result = null;
    try { result = await response.json(); } catch { /* respuesta sin JSON */ }
    if (!response.ok || result?.ok !== true || !result.data) {
      throw new Error(result?.error || `El servidor respondió con estado ${response.status}.`);
    }

    const pedido = result.data;
    try {
      sessionStorage.setItem(ULTIMO_PEDIDO_KEY, JSON.stringify(pedido));
    } catch { /* la confirmación mostrará solo el número de pedido */ }
    Carrito.vaciar();
    location.href = `confirmacion.html?pedido=${encodeURIComponent(pedido.id_pedido)}`;
  } catch (error) {
    setSending(false);
    showError(error instanceof TypeError
      ? "No pudimos conectar con el servidor. Verifica que el backend esté encendido e inténtalo de nuevo."
      : `No pudimos crear tu pedido. ${error.message}`);
    errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

// Si el carrito cambia en otra pestaña, refresca esta
window.addEventListener("storage", event => {
  if (event.key === "supermercado_carrito" && !sending) render();
});

render();
