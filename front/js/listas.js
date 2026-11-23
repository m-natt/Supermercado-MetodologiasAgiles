// Listas de compras personales.
// API_BASE, money() y makeText() vienen de js/config.js; Carrito de js/carrito.js
// y Sesion de js/sesion.js
const byId = id => document.getElementById(id);
const loginBox = byId("lists-login");
const appBox = byId("lists-app");
const messageBox = byId("lists-message");
const nav = byId("lists-nav");
const navStatus = byId("lists-status");
const detail = byId("detail");
const detailEmpty = byId("detail-empty");
const nameInput = byId("list-name");
const itemsBox = byId("items");
const itemsEmpty = byId("items-empty");
const searchInput = byId("product-search");
const searchResults = byId("search-results");
const searchStatus = byId("search-status");
const cartButton = byId("add-to-cart");

const MAX_CANTIDAD = 999;
let listas = [];
let actual = null;
let cola = Promise.resolve();   // los cambios se guardan uno por uno, en orden
let searchTimer;
let searchRequest = 0;

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function mostrarLogin() {
  loginBox.hidden = false;
  appBox.hidden = true;
  messageBox.hidden = true;
}

function aviso(texto, tipo = "ok") {
  messageBox.className = `lists-message lists-message--${tipo}`;
  messageBox.textContent = texto;
  messageBox.hidden = false;
}

function enCola(tarea) {
  cola = cola.then(tarea).catch(error => {
    if (error.sinSesion) { mostrarLogin(); return; }
    aviso(error.message, "error");
  });
  return cola;
}

async function api(ruta, metodo = "GET", datos) {
  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, {
      method: metodo,
      headers: Sesion.cabeceras(datos ? { "Content-Type": "application/json" } : {}),
      body: datos ? JSON.stringify(datos) : undefined,
    });
  } catch {
    throw new Error("No hay conexión con el servidor. ¿Está encendido el backend?");
  }
  let cuerpo = null;
  try { cuerpo = await respuesta.json(); } catch { /* la respuesta no era JSON */ }
  if (respuesta.status === 401) {
    Sesion.borrar();
    const error = new Error("Tu sesión expiró. Inicia sesión de nuevo.");
    error.sinSesion = true;
    throw error;
  }
  if (!respuesta.ok || !cuerpo || cuerpo.ok !== true) {
    throw new Error((cuerpo && cuerpo.error) || `El servidor respondió con estado ${respuesta.status}.`);
  }
  return cuerpo.data;
}

// ---------- Columna de listas ----------
function pintarNav() {
  nav.replaceChildren(...listas.map(lista => {
    const li = document.createElement("li");
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "lists-nav__item";
    const elegida = actual && actual.id_lista === lista.id_lista;
    boton.classList.toggle("is-active", Boolean(elegida));
    if (elegida) boton.setAttribute("aria-current", "true");
    boton.dataset.foco = `nav-${lista.id_lista}`;
    boton.append(
      makeText("strong", "", lista.nombre),
      makeText("span", "", `${lista.comprados}/${plural(lista.productos, "producto", "productos")} · ${money(lista.total_estimado)}`)
    );
    boton.addEventListener("click", () => enCola(() => abrirLista(lista.id_lista)));
    li.append(boton);
    return li;
  }));
  navStatus.hidden = listas.length > 0;
  if (!listas.length) navStatus.textContent = "Todavía no tienes listas.";
}

async function recargarNav() {
  listas = await api("/api/listas");
  pintarNav();
}

// ---------- Detalle de la lista ----------
function botonCantidad(texto, etiqueta, foco, deshabilitado, accion) {
  const boton = makeText("button", "lists-qty__button", texto);
  boton.type = "button";
  boton.disabled = deshabilitado;
  boton.dataset.foco = foco;
  boton.setAttribute("aria-label", etiqueta);
  boton.addEventListener("click", accion);
  return boton;
}

function filaItem(item) {
  const li = document.createElement("li");
  li.className = "lists-item";
  li.classList.toggle("is-done", item.comprado);

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = item.comprado;
  check.dataset.foco = `check-${item.id_producto}`;
  check.setAttribute("aria-label", `Marcar ${item.nombre} como comprado`);
  check.addEventListener("change", () => enCola(() => cambiarItem(item.id_producto, { comprado: check.checked })));

  const info = document.createElement("div");
  info.className = "lists-item__info";
  info.append(makeText("strong", "", item.nombre));
  info.append(makeText("span", "", `${money(item.precio)} / ${item.unidad}`));
  if (!item.activo) info.append(makeText("span", "lists-item__warn", "Ya no está a la venta"));
  else if (Number(item.stock) <= 0) info.append(makeText("span", "lists-item__warn", "Agotado"));
  else if (item.cantidad > Number(item.stock)) info.append(makeText("span", "lists-item__warn", `Solo hay ${item.stock} disponibles`));

  const cantidad = document.createElement("div");
  cantidad.className = "lists-qty";
  cantidad.append(
    botonCantidad("−", `Quitar una unidad de ${item.nombre}`, `menos-${item.id_producto}`, item.cantidad <= 1,
      () => enCola(() => sumarCantidad(item.id_producto, -1))),
    makeText("span", "lists-qty__value", String(item.cantidad)),
    botonCantidad("+", `Agregar una unidad de ${item.nombre}`, `mas-${item.id_producto}`, item.cantidad >= MAX_CANTIDAD,
      () => enCola(() => sumarCantidad(item.id_producto, 1)))
  );

  const quitar = makeText("button", "lists-item__remove", "×");
  quitar.type = "button";
  quitar.setAttribute("aria-label", `Quitar ${item.nombre} de la lista`);
  quitar.addEventListener("click", () => enCola(async () => {
    aplicar(await api(`/api/listas/${actual.id_lista}/items/${item.id_producto}`, "DELETE"));
    await recargarNav();
  }));

  li.append(check, info, cantidad, quitar);
  return li;
}

function pintarDetalle() {
  detail.hidden = !actual;
  detailEmpty.hidden = Boolean(actual);
  if (!actual) return;

  const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.foco : null;
  if (document.activeElement !== nameInput) nameInput.value = actual.nombre;
  itemsBox.replaceChildren(...actual.items.map(filaItem));
  itemsEmpty.hidden = actual.items.length > 0;

  const pendientes = actual.items.filter(i => !i.comprado);
  byId("list-progress").textContent = actual.items.length
    ? `${actual.comprados} de ${plural(actual.items.length, "producto comprado", "productos comprados")}`
    : "";
  byId("list-total").textContent = `Pendiente: ${money(actual.total_estimado)}`;
  cartButton.disabled = pendientes.length === 0;

  // Conserva el foco del teclado después de redibujar
  if (foco) {
    const elemento = document.querySelector(`[data-foco="${foco}"]`);
    if (elemento) elemento.focus();
  }
}

function aplicar(lista) {
  actual = lista;
  pintarDetalle();
}

async function abrirLista(id) {
  messageBox.hidden = true;
  actual = await api(`/api/listas/${id}`);
  history.replaceState(null, "", `listas.html?lista=${encodeURIComponent(id)}`);
  limpiarBusqueda();
  nameInput.value = actual.nombre;
  pintarNav();
  pintarDetalle();
}

async function cambiarItem(idProducto, cambios) {
  aplicar(await api(`/api/listas/${actual.id_lista}/items/${idProducto}`, "PUT", cambios));
  await recargarNav();
}

async function sumarCantidad(idProducto, cambio) {
  const item = actual.items.find(i => i.id_producto === idProducto);
  if (!item) return;
  const cantidad = Math.min(MAX_CANTIDAD, Math.max(1, item.cantidad + cambio));
  if (cantidad !== item.cantidad) await cambiarItem(idProducto, { cantidad });
}

// ---------- Buscar productos ----------
function limpiarBusqueda() {
  clearTimeout(searchTimer);
  searchRequest += 1;
  searchInput.value = "";
  searchResults.replaceChildren();
  searchResults.hidden = true;
  searchStatus.hidden = true;
}

function resultado(producto) {
  const li = document.createElement("li");
  const info = document.createElement("div");
  info.append(makeText("strong", "", producto.nombre));
  info.append(makeText("span", "", `${money(producto.precio)} / ${producto.unidad}`));
  const boton = makeText("button", "secondary-button", "+ Agregar");
  boton.type = "button";
  boton.setAttribute("aria-label", `Agregar ${producto.nombre} a la lista`);
  boton.addEventListener("click", () => enCola(async () => {
    aplicar(await api(`/api/listas/${actual.id_lista}/items`, "POST", {
      id_producto: producto.id_producto, cantidad: 1,
    }));
    await recargarNav();
    boton.textContent = "✓ Agregado";
    setTimeout(() => { boton.textContent = "+ Agregar"; }, 1200);
  }));
  li.append(info, boton);
  return li;
}

async function buscar(texto) {
  const estaBusqueda = ++searchRequest;
  searchStatus.textContent = "Buscando…";
  searchStatus.hidden = false;
  try {
    const productos = await api(`/api/productos?q=${encodeURIComponent(texto)}`);
    if (estaBusqueda !== searchRequest) return;
    searchResults.replaceChildren(...productos.slice(0, 8).map(resultado));
    searchResults.hidden = productos.length === 0;
    searchStatus.hidden = productos.length > 0;
    if (!productos.length) searchStatus.textContent = "No encontramos productos con esa búsqueda.";
  } catch (error) {
    if (estaBusqueda !== searchRequest) return;
    if (error.sinSesion) { mostrarLogin(); return; }
    searchResults.hidden = true;
    searchStatus.textContent = error.message;
  }
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const texto = searchInput.value.trim();
  if (!texto) {
    searchRequest += 1;
    searchResults.replaceChildren();
    searchResults.hidden = true;
    searchStatus.hidden = true;
    return;
  }
  searchTimer = setTimeout(() => buscar(texto), 300);
});

// ---------- Formularios y acciones ----------
byId("new-list-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = byId("new-list-name");
  const nombre = input.value.trim();
  if (!nombre) {
    aviso("Escribe un nombre para la lista.", "error");
    input.focus();
    return;
  }
  enCola(async () => {
    const lista = await api("/api/listas", "POST", { nombre });
    input.value = "";
    await recargarNav();
    await abrirLista(lista.id_lista);
    aviso(`Creamos «${lista.nombre}». Ahora agrega tus productos.`);
    searchInput.focus();
  });
});

byId("rename-form").addEventListener("submit", event => {
  event.preventDefault();
  const nombre = nameInput.value.trim();
  if (!nombre) {
    aviso("El nombre de la lista no puede estar vacío.", "error");
    nameInput.value = actual.nombre;
    return;
  }
  enCola(async () => {
    aplicar(await api(`/api/listas/${actual.id_lista}`, "PUT", { nombre }));
    nameInput.value = actual.nombre;
    await recargarNav();
    aviso("Nombre actualizado.");
  });
});

byId("delete-list").addEventListener("click", () => {
  if (!actual || !window.confirm(`¿Eliminar la lista «${actual.nombre}»? No se puede deshacer.`)) return;
  enCola(async () => {
    const nombre = actual.nombre;
    await api(`/api/listas/${actual.id_lista}`, "DELETE");
    actual = null;
    history.replaceState(null, "", "listas.html");
    limpiarBusqueda();
    await recargarNav();
    pintarDetalle();
    aviso(`Eliminamos «${nombre}».`);
  });
});

cartButton.addEventListener("click", () => enCola(async () => {
  // Vuelve a consultar para usar precios y existencias actuales
  actual = await api(`/api/listas/${actual.id_lista}`);
  pintarDetalle();
  let agregados = 0;
  const omitidos = [];
  actual.items.filter(i => !i.comprado).forEach(item => {
    if (!item.activo || Number(item.stock) <= 0 || !Carrito.agregar(item, item.cantidad)) {
      omitidos.push(item.nombre);
    } else {
      agregados += 1;
    }
  });
  if (agregados && omitidos.length) {
    aviso(`Agregamos ${plural(agregados, "producto", "productos")}. Sin disponibilidad: ${omitidos.join(", ")}.`, "warn");
  } else if (agregados) {
    aviso(`Agregamos ${plural(agregados, "producto", "productos")} a tu carrito.`);
  } else {
    aviso("No pudimos agregar productos porque no hay más disponibilidad.", "error");
  }
}));

// ---------- Inicio ----------
if (!Sesion.leer()) {
  mostrarLogin();
} else {
  appBox.hidden = false;
  enCola(async () => {
    await recargarNav();
    const pedida = Number(new URLSearchParams(location.search).get("lista"));
    const inicial = listas.find(l => l.id_lista === pedida) || listas[0];
    if (inicial) await abrirLista(inicial.id_lista);
  });
}
