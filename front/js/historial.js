// Historial de pedidos, compras frecuentes y "volver a pedir".
// API_BASE, money() y makeText() vienen de js/config.js; Carrito de js/carrito.js
// y Sesion de js/sesion.js
const byId = id => document.getElementById(id);
const loginBox = byId("hist-login");
const contentBox = byId("hist-content");
const messageBox = byId("hist-message");
const freqStatus = byId("freq-status");
const freqList = byId("freq-list");
const freqCount = byId("freq-count");
const ordersStatus = byId("orders-status");
const ordersList = byId("orders-list");
const ordersCount = byId("orders-count");

const numero = n => new Intl.NumberFormat("es-MX").format(n);
const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;

function formatoFecha(valor) {
  const fecha = new Date(valor);
  if (!valor || Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(fecha);
}

function formatoDia(valor) {
  const fecha = new Date(valor);
  if (!valor || Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(fecha);
}

function capitalizar(texto) {
  const limpio = String(texto || "");
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

// ---------- Sesión y comunicación con el servidor ----------
function mostrarLogin() {
  loginBox.hidden = false;
  contentBox.hidden = true;
}

async function pedirJson(ruta) {
  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, { headers: Sesion.cabeceras() });
  } catch {
    throw new Error("No hay conexión con el servidor. ¿Está encendido el backend?");
  }
  let cuerpo = null;
  try { cuerpo = await respuesta.json(); } catch { /* la respuesta no era JSON */ }

  if (respuesta.status === 401) {
    Sesion.borrar(); // la sesión venció o no es válida
    const error = new Error("Tu sesión expiró. Inicia sesión de nuevo.");
    error.sinSesion = true;
    throw error;
  }
  if (!respuesta.ok || !cuerpo || cuerpo.ok !== true) {
    const detalle = cuerpo && typeof cuerpo.error === "string"
      ? cuerpo.error
      : `El servidor respondió con estado ${respuesta.status}.`;
    throw new Error(detalle);
  }
  return cuerpo.data;
}

// ---------- Avisos ----------
function mostrarAviso(tipo, ...partes) {
  messageBox.className = `hist-message hist-message--${tipo}`;
  messageBox.replaceChildren(...partes);
  messageBox.hidden = false;
}

function linkCarrito() {
  const enlace = makeText("a", "hist-message__link", "Ir al carrito →");
  enlace.href = "checkout.html";
  return enlace;
}

// ---------- Compras frecuentes ----------
function itemFrecuente(p) {
  const li = document.createElement("li");
  li.className = "freq-item";

  const info = document.createElement("div");
  info.className = "freq-item__info";
  info.append(makeText("strong", "freq-item__name", p.nombre));
  info.append(makeText("span", "freq-item__meta", [p.categoria, p.marca].filter(Boolean).join(" · ")));
  const detalle = `Comprado ${plural(p.veces_comprado, "vez", "veces")}` +
    (p.ultima_compra ? ` · Última: ${formatoDia(p.ultima_compra)}` : "");
  info.append(makeText("span", "freq-item__meta", detalle));
  info.append(makeText("span", "freq-item__price", `${money(p.precio)} / ${p.unidad}`));

  const disponible = Number(p.stock) > 0;
  const cantidad = Math.max(1, Math.min(Number(p.cantidad_habitual) || 1, Number(p.stock) || 1));
  const etiqueta = disponible ? `🛒 Agregar ${numero(cantidad)}` : "Agotado";
  const boton = makeText("button", "primary-button freq-item__button", etiqueta);
  boton.type = "button";
  boton.disabled = !disponible;
  let temporizador;
  boton.addEventListener("click", () => {
    const subio = Carrito.agregar(p, cantidad);
    boton.textContent = subio ? "✓ Agregado" : "Máximo disponible";
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { boton.textContent = etiqueta; }, 1400);
    if (subio) {
      mostrarAviso("ok", makeText("span", "", `✅ Agregamos ${plural(cantidad, "unidad", "unidades")} de «${p.nombre}» a tu carrito. `), linkCarrito());
    } else {
      mostrarAviso("warn", makeText("span", "", `Ya tienes en el carrito todo lo disponible de «${p.nombre}». `), linkCarrito());
    }
  });

  li.append(info, boton);
  return li;
}

async function cargarFrecuentes() {
  try {
    const productos = await pedirJson("/api/clientes/yo/frecuentes?limite=12");
    if (!Array.isArray(productos)) throw new Error("La respuesta del servidor no tiene el formato esperado.");
    freqList.replaceChildren(...productos.map(itemFrecuente));
    freqCount.textContent = plural(productos.length, "producto", "productos");
    freqStatus.hidden = productos.length > 0;
    if (productos.length === 0) {
      freqStatus.textContent = "Todavía no tienes compras frecuentes. Cuando hagas pedidos, aquí verás lo que más compras.";
    }
  } catch (error) {
    if (error.sinSesion) { mostrarLogin(); return; }
    freqStatus.hidden = false;
    freqStatus.textContent = `No pudimos cargar tus compras frecuentes. ${error.message}`;
  }
}

// ---------- Historial de pedidos ----------
function lineaPedido(item) {
  const li = document.createElement("li");
  li.className = "hist-item";
  const nombre = makeText("span", "hist-item__name", `${numero(item.cantidad)} × ${item.nombre}`);
  if (!item.disponible) nombre.append(makeText("small", "hist-item__note", " (ya no está a la venta)"));
  li.append(nombre, makeText("span", "hist-item__total", money(item.subtotal)));
  return li;
}

function tarjetaPedido(pedido) {
  const articulo = document.createElement("article");
  articulo.className = "panel hist-order";

  const cabecera = document.createElement("div");
  cabecera.className = "hist-order__head";
  const titulo = document.createElement("div");
  titulo.append(makeText("h3", "hist-order__title", `Pedido #${pedido.id_pedido}`));
  titulo.append(makeText("span", "hist-order__date", formatoFecha(pedido.fecha)));
  cabecera.append(titulo, makeText("span", "hist-badge", capitalizar(pedido.estado)));

  const lista = document.createElement("ul");
  lista.className = "hist-items";
  lista.append(...pedido.items.map(lineaPedido));

  const pie = document.createElement("div");
  pie.className = "hist-order__foot";
  const totales = document.createElement("div");
  totales.className = "hist-order__totals";
  const envio = Number(pedido.costo_envio) > 0 ? `Envío ${money(pedido.costo_envio)}` : "Envío gratis";
  const pago = pedido.metodo_pago ? ` · Pago: ${pedido.metodo_pago}` : "";
  totales.append(makeText("span", "hist-order__meta", `${plural(pedido.unidades, "unidad", "unidades")} · ${envio}${pago}`));
  totales.append(makeText("strong", "hist-order__total", `Total ${money(pedido.total)}`));

  const boton = makeText("button", "secondary-button hist-order__button", "↻ Volver a pedir");
  boton.type = "button";
  boton.addEventListener("click", () => volverAPedir(pedido, boton));

  pie.append(totales, boton);
  articulo.append(cabecera, lista, pie);
  return articulo;
}

async function cargarPedidos() {
  try {
    const pedidos = await pedirJson("/api/clientes/yo/pedidos?limite=20");
    if (!Array.isArray(pedidos)) throw new Error("La respuesta del servidor no tiene el formato esperado.");
    ordersList.replaceChildren(...pedidos.map(tarjetaPedido));
    ordersCount.textContent = plural(pedidos.length, "pedido", "pedidos");
    ordersStatus.hidden = pedidos.length > 0;
    if (pedidos.length === 0) {
      ordersStatus.textContent = "Todavía no has hecho pedidos con esta cuenta.";
    }
  } catch (error) {
    if (error.sinSesion) { mostrarLogin(); return; }
    ordersStatus.hidden = false;
    ordersStatus.textContent = `No pudimos cargar tus pedidos. ${error.message}`;
  }
}

// ---------- Volver a pedir ----------
async function volverAPedir(pedido, boton) {
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Agregando…";
  try {
    const reorden = await pedirJson(`/api/clientes/yo/pedidos/${pedido.id_pedido}/reorden`);
    const agregados = Array.isArray(reorden.agregados) ? reorden.agregados : [];
    const omitidos = Array.isArray(reorden.omitidos) ? reorden.omitidos : [];

    agregados.forEach(item => Carrito.agregar(item, item.cantidad));

    const partes = [];
    if (agregados.length > 0) {
      partes.push(makeText("p", "hist-message__line",
        `✅ Agregamos ${plural(agregados.length, "producto", "productos")} del pedido #${pedido.id_pedido} a tu carrito.`));
    } else {
      partes.push(makeText("p", "hist-message__line",
        `No pudimos agregar nada del pedido #${pedido.id_pedido} porque ya no hay disponibilidad.`));
    }
    agregados.filter(item => item.ajustada).forEach(item => {
      partes.push(makeText("p", "hist-message__line",
        `Ajustamos «${item.nombre}» a ${numero(item.cantidad)} (antes ${numero(item.cantidad_original)}) porque es lo que hay en existencia.`));
    });
    omitidos.forEach(item => {
      partes.push(makeText("p", "hist-message__line", `No agregamos «${item.nombre}»: ${item.motivo}`));
    });
    if (agregados.length > 0) partes.push(linkCarrito());

    const hayProblemas = omitidos.length > 0 || agregados.some(item => item.ajustada);
    mostrarAviso(agregados.length === 0 ? "error" : hayProblemas ? "warn" : "ok", ...partes);
  } catch (error) {
    if (error.sinSesion) { mostrarLogin(); return; }
    mostrarAviso("error", makeText("p", "hist-message__line", error.message));
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

// ---------- Inicio ----------
if (!Sesion.leer()) {
  mostrarLogin();
} else {
  contentBox.hidden = false;
  cargarFrecuentes();
  cargarPedidos();
}
