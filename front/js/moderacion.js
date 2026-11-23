// Moderación de reseñas. Requiere sesión con rol "administrador".
// API_BASE y makeText() vienen de js/config.js; Sesion de js/sesion.js
const byId = id => document.getElementById(id);
const gate = byId("mod-gate");
const app = byId("mod-app");
const loading = byId("mod-loading");
const messageBox = byId("mod-message");
const typeSelect = byId("mod-tipo");
const stateSelect = byId("mod-estado");
const refreshButton = byId("mod-refresh");
const statusBox = byId("mod-status");
const listBox = byId("mod-list");

const ESTADOS = {
  pendiente: { texto: "Pendiente", clase: "rev-badge--pendiente" },
  aprobada: { texto: "Publicada", clase: "rev-badge--aprobada" },
  rechazada: { texto: "Rechazada", clase: "rev-badge--rechazada" },
};
const NOMBRES = { producto: "Producto", marca: "Marca" };
const PLURAL_ESTADO = { pendiente: "pendientes", aprobada: "publicadas", rechazada: "rechazadas", todas: "" };

let cargaActual = 0; // evita que una respuesta lenta pise a una más nueva
let temporizadorMensaje;

const numero = n => new Intl.NumberFormat("es-MX").format(n);
const estrellas = n => "★".repeat(Math.max(0, Math.min(5, Number(n) || 0))) + "☆".repeat(5 - Math.max(0, Math.min(5, Number(n) || 0)));

function formatoFecha(valor) {
  const fecha = new Date(valor);
  if (!valor || Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(fecha);
}

// ---------- Comunicación con el servidor ----------
async function api(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, { ...opciones, headers: Sesion.cabeceras(opciones.headers) });
  } catch {
    throw new Error("No hay conexión con el servidor. ¿Está encendido el backend?");
  }
  let cuerpo = null;
  try { cuerpo = await respuesta.json(); } catch { /* la respuesta no era JSON */ }
  if (!respuesta.ok || !cuerpo || cuerpo.ok !== true) {
    const error = new Error(cuerpo && typeof cuerpo.error === "string" ? cuerpo.error : `Error ${respuesta.status} del servidor.`);
    error.status = respuesta.status;
    throw error;
  }
  return cuerpo.data;
}

const conJson = (metodo, datos) => ({
  method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos),
});

function mensaje(texto, tipo = "ok") {
  clearTimeout(temporizadorMensaje);
  messageBox.textContent = texto;
  messageBox.className = `inv-message inv-message--${tipo}`;
  messageBox.hidden = false;
  if (tipo === "ok") temporizadorMensaje = setTimeout(() => { messageBox.hidden = true; }, 5000);
}

function mostrarEstado(texto) {
  statusBox.textContent = texto;
  statusBox.hidden = !texto;
}

// ---------- Resumen ----------
async function cargarResumen() {
  try {
    const datos = await api("/api/admin/resenas/resumen");
    byId("sum-pendientes").textContent = numero(datos.pendientes);
    byId("sum-pend-producto").textContent = numero(datos.producto.pendiente);
    byId("sum-pend-marca").textContent = numero(datos.marca.pendiente);
    byId("sum-aprobadas").textContent = numero(datos.producto.aprobada + datos.marca.aprobada);
  } catch {
    // Si falla el resumen, la lista sigue funcionando
  }
}

// ---------- Lista de reseñas ----------
function boton(texto, clase, alClick) {
  const b = makeText("button", clase, texto);
  b.type = "button";
  b.addEventListener("click", alClick);
  return b;
}

function tarjeta(r) {
  const articulo = document.createElement("article");
  articulo.className = `panel mod-item mod-item--${r.estado}`;

  const cabecera = document.createElement("div");
  cabecera.className = "mod-item__head";
  const puntos = makeText("span", "rev-stars", estrellas(r.calificacion));
  puntos.setAttribute("aria-label", `${r.calificacion} de 5 estrellas`);
  const estado = ESTADOS[r.estado] || ESTADOS.pendiente;
  cabecera.append(puntos, makeText("strong", "mod-item__target", `${NOMBRES[r.tipo]}: ${r.objetivo}`),
    makeText("span", `rev-badge ${estado.clase}`, estado.texto));
  if (r.compra_verificada) cabecera.append(makeText("span", "rev-badge rev-badge--verificada", "✓ Compra verificada"));
  articulo.append(cabecera);

  if (r.titulo) articulo.append(makeText("strong", "mod-item__title", r.titulo));
  articulo.append(makeText("p", "mod-item__text", r.comentario || "(Sin comentario, solo calificación)"));
  articulo.append(makeText("p", "mod-item__meta", `${r.autor} · ${r.correo} · ${formatoFecha(r.fecha)}`));
  if (r.estado === "rechazada" && r.motivo_rechazo) {
    articulo.append(makeText("p", "mod-item__reason", `Motivo del rechazo: ${r.motivo_rechazo}`));
  }

  const motivo = document.createElement("input");
  motivo.className = "mod-reason";
  motivo.maxLength = 255;
  motivo.placeholder = "Motivo del rechazo (opcional)";
  motivo.setAttribute("aria-label", "Motivo del rechazo");

  const acciones = document.createElement("div");
  acciones.className = "mod-actions";
  const botones = [];
  const decidir = nuevo => () => cambiarEstado(r, nuevo, motivo.value, botones);

  if (r.estado !== "aprobada") botones.push(boton("✓ Aprobar", "inv-btn inv-btn--add", decidir("aprobada")));
  if (r.estado !== "rechazada") {
    acciones.append(motivo);
    botones.push(boton("✗ Rechazar", "inv-btn", decidir("rechazada")));
  }
  botones.push(boton("Eliminar", "inv-btn", () => eliminar(r, botones)));
  acciones.append(...botones);
  articulo.append(acciones);
  return articulo;
}

async function cargarLista() {
  const esta = ++cargaActual;
  const tipo = typeSelect.value;
  const estado = stateSelect.value;
  refreshButton.disabled = true;
  try {
    const lista = await api(`/api/admin/resenas?tipo=${tipo}&estado=${estado}`);
    if (esta !== cargaActual) return;
    if (!Array.isArray(lista)) throw new Error("La respuesta del servidor no tiene el formato esperado.");
    listBox.replaceChildren(...lista.map(tarjeta));
    mostrarEstado(lista.length === 0
      ? `No hay reseñas ${PLURAL_ESTADO[estado]} de ${tipo === "producto" ? "productos" : "marcas"}.`.replace("  ", " ")
      : "");
  } catch (error) {
    if (esta !== cargaActual) return;
    mensaje(`No pudimos cargar las reseñas. ${error.message}`, "error");
    if (listBox.children.length === 0) mostrarEstado("No se pudo cargar la lista. Pulsa «Actualizar» para reintentar.");
  } finally {
    if (esta === cargaActual) refreshButton.disabled = false;
  }
}

async function recargar() {
  await Promise.all([cargarLista(), cargarResumen()]);
}

// ---------- Decisiones ----------
async function cambiarEstado(r, estado, motivo, botones) {
  botones.forEach(b => { b.disabled = true; });
  try {
    const cuerpo = { estado };
    if (estado === "rechazada" && motivo.trim()) cuerpo.motivo = motivo.trim();
    await api(`/api/admin/resenas/${r.tipo}/${r.id_resena}/estado`, conJson("PUT", cuerpo));
    mensaje(estado === "aprobada" ? "Reseña publicada." : "Reseña rechazada.");
    await recargar();
  } catch (error) {
    mensaje(error.message, "error");
    botones.forEach(b => { b.disabled = false; });
  }
}

async function eliminar(r, botones) {
  if (!confirm("¿Eliminar esta reseña para siempre? Esta acción no se puede deshacer.")) return;
  botones.forEach(b => { b.disabled = true; });
  try {
    await api(`/api/admin/resenas/${r.tipo}/${r.id_resena}`, { method: "DELETE" });
    mensaje("Reseña eliminada.");
    await recargar();
  } catch (error) {
    mensaje(error.message, "error");
    botones.forEach(b => { b.disabled = false; });
  }
}

// ---------- Inicio: solo entra un administrador ----------
function bloquear(titulo, texto) {
  byId("mod-gate-title").textContent = titulo;
  byId("mod-gate-text").textContent = texto;
  gate.hidden = false;
  loading.hidden = true;
}

async function iniciar() {
  if (!Sesion.leer()) return bloquear("Inicia sesión", "Necesitas iniciar sesión con una cuenta de administrador.");
  let yo;
  try {
    yo = await api("/api/clientes/yo");
  } catch (error) {
    return bloquear("Sesión no válida", error.message);
  }
  if (yo.rol !== "administrador") return bloquear("Acceso restringido", "Tu cuenta no tiene permisos de administrador.");

  loading.hidden = true;
  app.hidden = false;
  typeSelect.addEventListener("change", cargarLista);
  stateSelect.addEventListener("change", cargarLista);
  refreshButton.addEventListener("click", recargar);
  await recargar();
}

document.addEventListener("DOMContentLoaded", iniciar);
