// Página de checkout: muestra el carrito, pide datos y crea el pedido.
// API_BASE, money() y makeText() vienen de js/config.js; Carrito de js/carrito.js

// Misma regla que backend/app/services/pedido_service.py (el backend manda).
// El costo de envío depende de la zona: se consulta en /api/cobertura.
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

// Zona del código postal escrito: null mientras no se sabe
// o { cubierto, ciudad, costo_envio, tiempo_estimado_min }
let zona = null;

// Direcciones guardadas del cliente autenticado (E6-18)
let savedAddresses = [];
let selectedAddressId = null;
let editingAddressId = null;

// Devuelve el costo de envío, o null si todavía no se conoce
function shippingFor(subtotal) {
  if (subtotal >= ENVIO_GRATIS_DESDE) return 0;
  return zona?.cubierto ? Number(zona.costo_envio) : null;
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
  shippingLabel.textContent = shipping === null ? "Por calcular" : shipping === 0 ? "Gratis" : money(shipping);
  totalLabel.textContent = money(subtotal + (shipping ?? 0));
  const free = shipping === 0
    ? "🎉 Tu pedido tiene envío gratis."
    : `Agrega ${money(ENVIO_GRATIS_DESDE - subtotal)} más para obtener envío gratis.`;
  shippingHint.textContent = zona?.cubierto
    ? `🚚 Entrega en ${zona.ciudad}${zona.tiempo_estimado_min ? ` en aprox. ${zona.tiempo_estimado_min} min` : ""}. ${free}`
    : shipping === 0 ? free : `Escribe tu código postal para calcular el envío. ${free}`;

  if (focusKey) {
    const target = cartList.querySelector(`[data-focus="${focusKey}"]`);
    if (target && !target.disabled) target.focus();
  }
}

function setSending(value) {
  sending = value;
  submitButton.disabled = value;
  submitButton.textContent = value ? "Enviando pedido…" : "Confirmar pedido";
  form.querySelectorAll("input").forEach(input => {
    // El correo sigue bloqueado si hay sesión iniciada
    input.readOnly = value || (input.name === "correo" && sessionApplied);
  });
  render();
}

function buildPayload() {
  const data = new FormData(form);
  const text = name => String(data.get(name) ?? "").trim();
  const optional = name => text(name) || null;

  const payload = {
    cliente: {
      nombre: text("nombre"),
      apellidos: optional("apellidos"),
      correo: text("correo"),
      telefono: text("telefono"),
    },
    metodo_pago: text("metodo_pago"),
    items: Carrito.leer().map(i => ({ id_producto: i.id_producto, cantidad: i.cantidad })),
  };

  if (selectedAddressId) {
    payload.id_direccion = selectedAddressId;
  } else {
    payload.direccion = {
      calle: text("calle"),
      colonia: text("colonia"),
      ciudad: text("ciudad"),
      codigo_postal: text("codigo_postal"),
      referencias: optional("referencias"),
    };
  }

  return payload;
}

const savedPanel = document.getElementById("saved-addresses-panel");
const savedList = document.getElementById("saved-addresses-list");
const savedError = document.getElementById("saved-addresses-error");
const newAddressButton = document.getElementById("new-address-button");
const saveAddressButton = document.getElementById("save-address-button");
const cancelEditAddressButton = document.getElementById("cancel-edit-address-button");
const addressMode = document.getElementById("address-mode");

function addressText(address) {
  return [
    address.calle,
    address.colonia,
    address.ciudad,
    `C.P. ${address.codigo_postal}`,
  ].filter(Boolean).join(", ");
}

function showSavedError(message = "") {
  savedError.textContent = message;
  savedError.hidden = !message;
}

function setAddressFieldsReadOnly(value) {
  ["calle", "colonia", "ciudad", "codigo_postal", "referencias"]
    .forEach(name => { form.elements[name].readOnly = value; });
}

function fillAddressForm(address) {
  form.elements.calle.value = address?.calle || "";
  form.elements.colonia.value = address?.colonia || "";
  form.elements.ciudad.value = address?.ciudad || "";
  form.elements.codigo_postal.value = address?.codigo_postal || "";
  form.elements.referencias.value = address?.referencias || "";
  setAddressFieldsReadOnly(Boolean(address));
  cpRequest++;
  if (address?.codigo_postal) checkCoverage();
}

function setNewAddressMode(clear = true) {
  selectedAddressId = null;
  editingAddressId = null;
  addressMode.textContent = "Nueva dirección";
  saveAddressButton.hidden = true;
  cancelEditAddressButton.hidden = true;
  if (clear) fillAddressForm(null);
  renderSavedAddresses();
  render();
}

function selectSavedAddress(id) {
  const address = savedAddresses.find(a => Number(a.id_direccion) === Number(id));
  if (!address) return;
  selectedAddressId = Number(id);
  editingAddressId = null;
  addressMode.textContent = "Dirección guardada";
  saveAddressButton.hidden = true;
  cancelEditAddressButton.hidden = true;
  fillAddressForm(address);
  renderSavedAddresses();
  render();
}

function renderSavedAddresses() {
  if (!savedPanel || !Sesion.leer()) {
    if (savedPanel) savedPanel.hidden = true;
    return;
  }

  savedPanel.hidden = false;
  savedList.replaceChildren();

  if (savedAddresses.length === 0) {
    savedList.append(makeText("p", "saved-addresses-note", "Todavía no tienes direcciones guardadas. Captura una nueva abajo y quedará guardada."));
    return;
  }

  savedAddresses.forEach(address => {
    const card = document.createElement("div");
    card.className = "saved-address";
    if (Number(address.id_direccion) === Number(selectedAddressId)) card.classList.add("is-selected");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "saved_address";
    radio.checked = Number(address.id_direccion) === Number(selectedAddressId);
    radio.setAttribute("aria-label", `Usar dirección ${address.calle}`);
    radio.addEventListener("change", () => selectSavedAddress(address.id_direccion));

    const textBox = document.createElement("div");
    textBox.className = "saved-address__text";
    textBox.append(
      makeText("p", "saved-address__title", address.calle),
      makeText("p", "saved-address__detail", addressText(address))
    );

    const actions = document.createElement("div");
    actions.className = "saved-address__actions";

    const useButton = makeText("button", "address-action", "Usar");
    useButton.type = "button";
    useButton.addEventListener("click", () => selectSavedAddress(address.id_direccion));

    const editButton = makeText("button", "address-action", "Editar");
    editButton.type = "button";
    editButton.addEventListener("click", () => editSavedAddress(address));

    const deleteButton = makeText("button", "address-action address-action--danger", "Eliminar");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => deleteSavedAddress(address.id_direccion));

    actions.append(useButton, editButton, deleteButton);
    card.append(radio, textBox, actions);
    savedList.append(card);
  });
}

async function loadSavedAddresses() {
  if (!Sesion.leer()) {
    savedAddresses = [];
    renderSavedAddresses();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/clientes/direcciones`, {
      headers: Sesion.cabeceras(),
    });
    const result = await response.json();
    if (response.status === 401) {
      Sesion.borrar();
      applySession();
      return;
    }
    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.error || "No pudimos cargar tus direcciones.");
    }
    savedAddresses = Array.isArray(result.data) ? result.data : [];
    renderSavedAddresses();
  } catch (error) {
    showSavedError(error.message);
  }
}

function editSavedAddress(address) {
  selectedAddressId = Number(address.id_direccion);
  editingAddressId = Number(address.id_direccion);
  addressMode.textContent = "Editando dirección guardada";
  saveAddressButton.hidden = false;
  cancelEditAddressButton.hidden = false;
  fillAddressForm(address);
  setAddressFieldsReadOnly(false);
  renderSavedAddresses();
  render();
  form.elements.calle.focus();
}

async function saveEditedAddress() {
  if (!editingAddressId || !form.reportValidity()) return;

  saveAddressButton.disabled = true;
  showSavedError("");
  const data = new FormData(form);
  const payload = {
    calle: String(data.get("calle") || "").trim(),
    colonia: String(data.get("colonia") || "").trim(),
    ciudad: String(data.get("ciudad") || "").trim(),
    codigo_postal: String(data.get("codigo_postal") || "").trim(),
    referencias: String(data.get("referencias") || "").trim() || null,
  };

  try {
    const response = await fetch(`${API_BASE}/api/clientes/direcciones/${editingAddressId}`, {
      method: "PUT",
      headers: Sesion.cabeceras({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (response.status === 401) {
      Sesion.borrar();
      applySession();
      throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
    }
    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.error || "No pudimos actualizar la dirección.");
    }
    const updated = result.data;
    savedAddresses = savedAddresses.map(a =>
      Number(a.id_direccion) === Number(updated.id_direccion) ? updated : a
    );
    selectedAddressId = Number(updated.id_direccion);
    editingAddressId = null;
    addressMode.textContent = "Dirección guardada";
    saveAddressButton.hidden = true;
    cancelEditAddressButton.hidden = true;
    fillAddressForm(updated);
    renderSavedAddresses();
  } catch (error) {
    showSavedError(error.message);
  } finally {
    saveAddressButton.disabled = false;
  }
}

async function deleteSavedAddress(id) {
  if (!confirm("¿Quieres eliminar esta dirección guardada?")) return;
  showSavedError("");

  try {
    const response = await fetch(`${API_BASE}/api/clientes/direcciones/${id}`, {
      method: "DELETE",
      headers: Sesion.cabeceras(),
    });
    const result = await response.json();
    if (response.status === 401) {
      Sesion.borrar();
      applySession();
      throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
    }
    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.error || "No pudimos eliminar la dirección.");
    }

    savedAddresses = savedAddresses.filter(a => Number(a.id_direccion) !== Number(id));
    if (Number(selectedAddressId) === Number(id)) setNewAddressMode();
    else renderSavedAddresses();
  } catch (error) {
    showSavedError(error.message);
  }
}

newAddressButton?.addEventListener("click", () => setNewAddressMode());
saveAddressButton?.addEventListener("click", saveEditedAddress);
cancelEditAddressButton?.addEventListener("click", () => {
  const selected = savedAddresses.find(a => Number(a.id_direccion) === Number(selectedAddressId));
  if (selected) selectSavedAddress(selected.id_direccion);
  else setNewAddressMode();
});

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
      // Con sesión iniciada manda el token: el pedido queda en la cuenta del cliente
      headers: Sesion.cabeceras({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    let result = null;
    try { result = await response.json(); } catch { /* respuesta sin JSON */ }
    if (response.status === 401) {
      Sesion.borrar();
      applySession();
      throw new Error("Tu sesión expiró. Inicia sesión de nuevo o compra como invitado.");
    }
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

// Cobertura: al escribir el código postal se consulta si hay entrega
const cpInput = form.elements.codigo_postal;
const cpStatus = document.getElementById("cp-status");
let cpRequest = 0; // ignora respuestas viejas si el usuario sigue escribiendo

function setCpStatus(text, kind = "") {
  cpStatus.textContent = text;
  cpStatus.className = `cp-status${kind ? ` is-${kind}` : ""}`;
}

async function checkCoverage() {
  const cp = cpInput.value.trim();
  const thisRequest = ++cpRequest;
  zona = null;
  cpInput.setCustomValidity("");
  if (!/^\d{5}$/.test(cp)) {
    setCpStatus("");
    render();
    return;
  }
  setCpStatus("Revisando cobertura…");
  render();
  try {
    const response = await fetch(`${API_BASE}/api/cobertura/${encodeURIComponent(cp)}`);
    const result = await response.json();
    if (thisRequest !== cpRequest) return;
    if (!response.ok || result.ok !== true) throw new Error();
    zona = result.data;
    if (zona.cubierto) {
      setCpStatus(`✓ Sí llegamos a ${zona.ciudad}`, "ok");
    } else {
      // Bloquea el envío del formulario con este mensaje
      cpInput.setCustomValidity("Por ahora no tenemos entrega en este código postal.");
      setCpStatus("Por ahora no tenemos entrega en este código postal.", "bad");
    }
  } catch {
    if (thisRequest !== cpRequest) return;
    // Sin conexión no se bloquea: el backend lo vuelve a revisar al confirmar
    setCpStatus("No pudimos revisar la cobertura ahora.");
  }
  render();
}

cpInput.addEventListener("input", checkCoverage);

// Con sesión iniciada: rellena los datos del cliente y bloquea el correo
const sessionNote = document.getElementById("session-note");
const sessionFields = ["nombre", "apellidos", "correo", "telefono"];
let sessionApplied = false;

function applySession() {
  const sesion = Sesion.leer();
  const correo = form.elements.correo;
  sessionNote.replaceChildren();
  if (!sesion) {
    correo.readOnly = false;
    if (sessionApplied) sessionFields.forEach(name => { form.elements[name].value = ""; });
    sessionApplied = false;
    savedAddresses = [];
    selectedAddressId = null;
    editingAddressId = null;
    renderSavedAddresses();
    const link = makeText("a", "", "Inicia sesión");
    link.href = "usuarios.html";
    sessionNote.append("¿Ya tienes cuenta? ", link, " para usar tus datos guardados.");
    return;
  }
  const c = sesion.cliente;
  sessionFields.forEach(name => {
    if (!form.elements[name].value || name === "correo") form.elements[name].value = c[name] || "";
  });
  correo.readOnly = true;
  sessionApplied = true;
  loadSavedAddresses();
  const link = makeText("a", "", "¿No eres tú?");
  link.href = "usuarios.html";
  sessionNote.append(`Comprando como ${c.nombre} (${c.correo}). `, link);
}

applySession();
if (cpInput.value) checkCoverage(); // por si el navegador lo autocompletó

// Si el carrito cambia en otra pestaña, refresca esta
window.addEventListener("storage", event => {
  if (event.key === "supermercado_carrito" && !sending) render();
});

render();
