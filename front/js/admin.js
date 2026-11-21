// Panel de administración. Requiere sesión con rol "administrador".
// API_BASE, money() y makeText() vienen de js/config.js; Sesion de js/sesion.js
const $ = id => document.getElementById(id);
const ETIQUETA = {
  confirmado: "Confirmado", preparando: "Preparando", en_camino: "En camino",
  entregado: "Entregado", cancelado: "Cancelado",
};
const ESTADOS_FINALES = ["entregado", "cancelado"];

let yo = null;            // el administrador que inició sesión
let productos = [];
let categorias = [];
let marcas = [];
let editandoId = null;    // null = producto nuevo
let temporizador;

// ---------- Comunicación con el servidor ----------
async function api(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, { ...opciones, headers: Sesion.cabeceras(opciones.headers) });
  } catch {
    throw new Error("No hay conexión con el servidor. ¿Está encendido el backend?");
  }
  let cuerpo = null;
  try { cuerpo = await respuesta.json(); } catch { /* no era JSON */ }
  if (!respuesta.ok || !cuerpo || cuerpo.ok !== true) {
    throw new Error(cuerpo && typeof cuerpo.error === "string" ? cuerpo.error : `Error ${respuesta.status} del servidor.`);
  }
  return cuerpo.data;
}

const conJson = (metodo, datos) => ({
  method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos),
});

// ---------- Utilidades de interfaz ----------
function mensaje(texto, tipo = "ok") {
  const caja = $("adm-message");
  clearTimeout(temporizador);
  caja.textContent = texto;
  caja.className = `inv-message inv-message--${tipo}`;
  caja.hidden = false;
  if (tipo === "ok") temporizador = setTimeout(() => { caja.hidden = true; }, 5000);
}

const fallo = e => mensaje(e.message, "error");
const fecha = valor => (valor ? new Date(valor).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—");
const badge = (texto, clase) => makeText("span", `inv-badge ${clase}`, texto);

function celda(contenido, clase) {
  const td = document.createElement("td");
  if (clase) td.className = clase;
  td.append(contenido);
  return td;
}

function textoDoble(principal, secundario) {
  const caja = document.createElement("div");
  caja.append(makeText("strong", "inv-name", principal), makeText("span", "inv-meta", secundario));
  return caja;
}

function boton(texto, clase, alClick) {
  const b = makeText("button", `inv-btn ${clase || ""}`, texto);
  b.type = "button";
  b.addEventListener("click", alClick);
  return b;
}

function vaciar(tbody, columnas, texto) {
  tbody.replaceChildren();
  const fila = tbody.insertRow();
  const c = fila.insertCell();
  c.colSpan = columnas;
  c.className = "inv-status";
  c.textContent = texto;
}

function selector(opciones, actual, etiquetas = {}) {
  const sel = document.createElement("select");
  sel.className = "adm-select";
  for (const valor of opciones) {
    const op = new Option(etiquetas[valor] || valor, valor);
    op.selected = valor === actual;
    sel.add(op);
  }
  return sel;
}

// ---------- Pestañas ----------
const CARGADORES = { resumen: cargarResumen, productos: cargarProductos, pedidos: cargarPedidos, usuarios: cargarUsuarios };

function mostrarPestana(nombre) {
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === nombre)));
  document.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.id !== `tab-${nombre}`; });
  CARGADORES[nombre]().catch(fallo);
}

// ---------- Resumen ----------
function tarjeta(etiqueta, valor, clase = "") {
  const t = document.createElement("article");
  t.className = `inv-card ${clase}`;
  t.append(makeText("span", "inv-card__label", etiqueta), makeText("strong", "inv-card__value", valor));
  return t;
}

async function cargarResumen() {
  const r = await api("/api/admin/resumen");
  const n = new Intl.NumberFormat("es-MX");
  $("adm-cards").replaceChildren(
    tarjeta("Ventas (sin cancelados)", money(r.ventas)),
    tarjeta("Pedidos", n.format(r.pedidos)),
    tarjeta("Clientes registrados", n.format(r.clientes)),
    tarjeta(`Stock bajo (de ${n.format(r.productos_activos)} productos)`, n.format(r.productos_stock_bajo), "inv-card--bajo"),
  );

  $("adm-estados").replaceChildren(...Object.entries(r.pedidos_por_estado).map(([estado, total]) => {
    const li = document.createElement("li");
    li.append(badge(ETIQUETA[estado] || estado, `adm-badge--${estado}`), makeText("strong", "", n.format(total)));
    return li;
  }));

  $("adm-top").replaceChildren(...(r.mas_vendidos.length ? r.mas_vendidos.map(p => {
    const li = document.createElement("li");
    li.append(makeText("span", "", p.nombre), makeText("strong", "", n.format(Number(p.vendidas))));
    return li;
  }) : [makeText("li", "", "Aún no hay ventas.")]));

  const cuerpo = $("adm-ultimos");
  if (!r.ultimos_pedidos.length) return vaciar(cuerpo, 4, "Aún no hay pedidos.");
  cuerpo.replaceChildren(...r.ultimos_pedidos.map(p => {
    const fila = document.createElement("tr");
    fila.append(
      celda(textoDoble(`#${p.id_pedido}`, fecha(p.fecha))),
      celda(p.cliente),
      celda(money(p.total)),
      celda(badge(ETIQUETA[p.estado] || p.estado, `adm-badge--${p.estado}`)),
    );
    return fila;
  }));
}

// ---------- Productos ----------
async function cargarProductos() {
  [productos, categorias, marcas] = await Promise.all([
    api("/api/productos?incluir_inactivos=true"), api("/api/categorias"), api("/api/marcas"),
  ]);
  pintarProductos();
}

const normalizar = t => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function pintarProductos() {
  const busqueda = normalizar($("prod-search").value.trim());
  const lista = productos.filter(p => normalizar(`${p.nombre} ${p.categoria} ${p.marca}`).includes(busqueda));
  const cuerpo = $("prod-body");
  if (!lista.length) return vaciar(cuerpo, 5, "No hay productos que coincidan.");
  cuerpo.replaceChildren(...lista.map(p => {
    const fila = document.createElement("tr");
    const acciones = document.createElement("div");
    acciones.className = "inv-actions";
    acciones.append(
      boton("Editar", "", () => abrirFormulario(p)),
      boton(p.activo ? "Desactivar" : "Activar", "", () => cambiarActivo(p)),
    );
    fila.append(
      celda(textoDoble(p.nombre, [p.categoria, p.marca, p.unidad].filter(Boolean).join(" · "))),
      celda(money(p.precio), "inv-num"),
      celda(String(p.stock), "inv-num"),
      celda(p.activo ? badge("Visible", "adm-badge--activo") : badge("Oculto", "adm-badge--inactivo")),
      celda(acciones),
    );
    return fila;
  }));
}

const cuerpoProducto = (p, cambios = {}) => ({
  id_categoria: p.id_categoria, id_marca: p.id_marca, nombre: p.nombre, descripcion: p.descripcion,
  precio: Number(p.precio), unidad: p.unidad, stock: p.stock, imagen_url: p.imagen_url, activo: !!p.activo,
  ...cambios,
});

async function cambiarActivo(p) {
  try {
    await api(`/api/productos/${p.id_producto}`, conJson("PUT", cuerpoProducto(p, { activo: !p.activo })));
    mensaje(`"${p.nombre}" ahora está ${p.activo ? "oculto" : "visible"} en la tienda.`);
    await cargarProductos();
  } catch (e) { fallo(e); }
}

function llenarSelect(select, lista, campoId, sinOpcion) {
  select.replaceChildren();
  if (sinOpcion) select.add(new Option(sinOpcion, ""));
  lista.forEach(x => select.add(new Option(x.nombre, x[campoId])));
}

function abrirFormulario(p = null) {
  const f = $("prod-form");
  editandoId = p ? p.id_producto : null;
  $("prod-dialog-title").textContent = p ? "Editar producto" : "Nuevo producto";
  $("prod-error").hidden = true;
  llenarSelect(f.id_categoria, categorias, "id_categoria");
  llenarSelect(f.id_marca, marcas, "id_marca", "Sin marca");
  f.reset();
  if (p) {
    f.nombre.value = p.nombre;
    f.id_categoria.value = p.id_categoria;
    f.id_marca.value = p.id_marca ?? "";
    f.precio.value = p.precio;
    f.unidad.value = p.unidad;
    f.stock.value = p.stock;
    f.imagen_url.value = p.imagen_url ?? "";
    f.descripcion.value = p.descripcion ?? "";
    f.activo.checked = !!p.activo;
  }
  $("prod-dialog").showModal();
}

async function guardarProducto(evento) {
  evento.preventDefault();
  const f = evento.target;
  const datos = {
    nombre: f.nombre.value.trim(),
    id_categoria: Number(f.id_categoria.value),
    id_marca: f.id_marca.value ? Number(f.id_marca.value) : null,
    precio: Number(f.precio.value),
    unidad: f.unidad.value.trim(),
    stock: Number(f.stock.value),
    imagen_url: f.imagen_url.value.trim() || null,
    descripcion: f.descripcion.value.trim() || null,
    activo: f.activo.checked,
  };
  try {
    if (editandoId) await api(`/api/productos/${editandoId}`, conJson("PUT", datos));
    else await api("/api/productos", conJson("POST", datos));
    $("prod-dialog").close();
    mensaje(editandoId ? "Producto actualizado." : "Producto creado.");
    await cargarProductos();
  } catch (e) {
    $("prod-error").textContent = e.message;
    $("prod-error").hidden = false;
  }
}

// ---------- Pedidos ----------
async function cargarPedidos() {
  const estado = $("ped-filter").value;
  const pedidos = await api(`/api/admin/pedidos${estado ? `?estado=${estado}` : ""}`);
  const cuerpo = $("ped-body");
  if (!pedidos.length) return vaciar(cuerpo, 6, "No hay pedidos con ese filtro.");
  cuerpo.replaceChildren(...pedidos.map(p => {
    const sel = selector(Object.keys(ETIQUETA), p.estado, ETIQUETA);
    sel.disabled = ESTADOS_FINALES.includes(p.estado);
    sel.addEventListener("change", () => cambiarEstado(p, sel.value));
    const fila = document.createElement("tr");
    fila.append(
      celda(textoDoble(`#${p.id_pedido}`, fecha(p.fecha))),
      celda(textoDoble(p.cliente, p.correo)),
      celda(money(p.total), "inv-num"),
      celda(p.metodo ? `${p.metodo} (${p.estado_pago})` : "—"),
      celda(fecha(p.fecha_entrega)),
      celda(sel),
    );
    return fila;
  }));
}

async function cambiarEstado(pedido, nuevo) {
  const aviso = nuevo === "cancelado"
    ? `¿Cancelar el pedido #${pedido.id_pedido}? El stock regresará al inventario y no podrás revertirlo.`
    : nuevo === "entregado" ? `¿Marcar el pedido #${pedido.id_pedido} como entregado? Ya no se podrá cambiar.` : null;
  try {
    if (aviso && !confirm(aviso)) return;
    await api(`/api/admin/pedidos/${pedido.id_pedido}/estado`, conJson("PUT", { estado: nuevo }));
    mensaje(`Pedido #${pedido.id_pedido}: ${ETIQUETA[nuevo].toLowerCase()}.`);
  } catch (e) { fallo(e); }
  await cargarPedidos().catch(fallo);  // vuelve a pintar con lo que dice el servidor
}

// ---------- Usuarios ----------
async function cargarUsuarios() {
  const clientes = await api("/api/admin/clientes");
  const cuerpo = $("usr-body");
  if (!clientes.length) return vaciar(cuerpo, 4, "Aún no hay clientes registrados.");
  cuerpo.replaceChildren(...clientes.map(c => {
    const sel = selector(["cliente", "administrador"], c.rol, { cliente: "Cliente", administrador: "Administrador" });
    sel.disabled = c.id_cliente === yo.id_cliente;  // no puedes quitarte tu propio acceso
    sel.addEventListener("change", () => cambiarRol(c, sel.value));
    const fila = document.createElement("tr");
    fila.append(
      celda(textoDoble(`${c.nombre} ${c.apellidos || ""}`.trim(), `Registro: ${fecha(c.fecha_registro)}`)),
      celda(c.correo),
      celda(String(c.pedidos), "inv-num"),
      celda(sel),
    );
    return fila;
  }));
}

async function cambiarRol(cliente, rol) {
  try {
    if (rol === "administrador" && !confirm(`¿Dar acceso de administrador a ${cliente.correo}?`)) throw new Error("Cambio cancelado.");
    await api(`/api/admin/clientes/${cliente.id_cliente}/rol`, conJson("PUT", { rol }));
    mensaje(`${cliente.correo} ahora es ${rol}.`);
  } catch (e) { if (e.message !== "Cambio cancelado.") fallo(e); }
  await cargarUsuarios().catch(fallo);
}

// ---------- Inicio: solo entra un administrador ----------
function bloquear(titulo, texto) {
  $("adm-gate-title").textContent = titulo;
  $("adm-gate-text").textContent = texto;
  $("adm-gate").hidden = false;
  $("adm-status").hidden = true;
}

async function iniciar() {
  if (!Sesion.leer()) return bloquear("Inicia sesión", "Necesitas iniciar sesión con una cuenta de administrador.");
  try {
    yo = await api("/api/clientes/yo");
  } catch (e) {
    return bloquear("Sesión no válida", e.message);
  }
  if (yo.rol !== "administrador") return bloquear("Acceso restringido", "Tu cuenta no tiene permisos de administrador.");

  $("adm-status").hidden = true;
  $("adm-app").hidden = false;
  document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => mostrarPestana(b.dataset.tab)));
  $("prod-search").addEventListener("input", pintarProductos);
  $("prod-new").addEventListener("click", () => abrirFormulario());
  $("prod-cancel").addEventListener("click", () => $("prod-dialog").close());
  $("prod-form").addEventListener("submit", guardarProducto);
  $("ped-filter").addEventListener("change", () => cargarPedidos().catch(fallo));
  mostrarPestana("resumen");
}

document.addEventListener("DOMContentLoaded", iniciar);
