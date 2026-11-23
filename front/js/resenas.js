// Reseñas de productos y de marcas: leerlas, escribir la mía y ver el estado de las mías.
// API_BASE y makeText() vienen de js/config.js; Sesion de js/sesion.js
const byId = id => document.getElementById(id);
const tabs = { producto: byId("tab-producto"), marca: byId("tab-marca") };
const targetLabel = byId("rev-target-label");
const targetSelect = byId("rev-target");
const statusBox = byId("rev-status");
const contentBox = byId("rev-content");
const nameTitle = byId("rev-name");
const avgNumber = byId("rev-avg");
const avgStars = byId("rev-avg-stars");
const totalLabel = byId("rev-total");
const barsList = byId("rev-bars");
const loginBox = byId("rev-login");
const form = byId("rev-form");
const mineState = byId("rev-mine-state");
const starsInput = byId("rev-stars-input");
const titleInput = byId("rev-title");
const commentInput = byId("rev-comment");
const counter = byId("rev-counter");
const formMessage = byId("rev-form-message");
const deleteButton = byId("rev-delete");
const submitButton = byId("rev-submit");
const listStatus = byId("rev-list-status");
const list = byId("rev-list");
const moreButton = byId("rev-more");
const mineAllBox = byId("rev-mine-all");
const mineList = byId("rev-mine-list");

const TIPOS = {
  producto: { etiqueta: "Producto", ruta: "/api/productos", campoId: "id_producto" },
  marca: { etiqueta: "Marca", ruta: "/api/marcas", campoId: "id_marca" },
};
const ESTADOS = {
  pendiente: { texto: "Pendiente de aprobación", clase: "rev-badge--pendiente" },
  aprobada: { texto: "Publicada", clase: "rev-badge--aprobada" },
  rechazada: { texto: "Rechazada", clase: "rev-badge--rechazada" },
};
const AVISO_ESTADO = {
  pendiente: "Tu reseña está pendiente de aprobación. Aún no la ven otros clientes.",
  aprobada: "Tu reseña está publicada. Si la editas, volverá a revisión.",
  rechazada: "Tu reseña fue rechazada. Puedes editarla y enviarla de nuevo.",
};

let tipo = "producto";
let objetivoId = null;
let nombreObjetivo = "";
const catalogos = { producto: null, marca: null };
let calificacion = 0;
let miResena = null;
let pagina = 1;
let cargaLista = 0; // evita que una respuesta lenta pise a una más nueva
let cargaCatalogo = 0;

const numero = n => new Intl.NumberFormat("es-MX").format(n);
const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;
const estrellas = n => {
  const lleno = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return "★".repeat(lleno) + "☆".repeat(5 - lleno);
};

function formatoDia(valor) {
  const fecha = new Date(valor);
  if (!valor || Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(fecha);
}

// ---------- Comunicación con el servidor ----------
async function pedirJson(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, { ...opciones, headers: Sesion.cabeceras(opciones.headers) });
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
    const error = new Error(cuerpo && typeof cuerpo.error === "string"
      ? cuerpo.error
      : `El servidor respondió con estado ${respuesta.status}.`);
    error.status = respuesta.status;
    throw error;
  }
  return cuerpo.data;
}

const conJson = (metodo, datos) => ({
  method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos),
});

function mostrarEstado(texto) {
  statusBox.textContent = texto;
  statusBox.hidden = !texto;
}

function mostrarAvisoFormulario(texto, tipoAviso = "ok") {
  formMessage.textContent = texto;
  formMessage.className = `rev-message rev-message--${tipoAviso}`;
  formMessage.hidden = !texto;
}

// ---------- Elegir qué se reseña ----------
function guardarEnUrl() {
  try { history.replaceState(null, "", `?tipo=${tipo}&id=${objetivoId}`); } catch { /* no es obligatorio */ }
}

async function cargarCatalogo(t) {
  if (catalogos[t]) return catalogos[t];
  const datos = await pedirJson(TIPOS[t].ruta);
  if (!Array.isArray(datos)) throw new Error("La respuesta del servidor no tiene el formato esperado.");
  catalogos[t] = datos
    .map(x => ({ id: x[TIPOS[t].campoId], nombre: x.nombre }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  return catalogos[t];
}

function pintarSelector(elementos) {
  targetSelect.replaceChildren(...elementos.map(x => {
    const opcion = document.createElement("option");
    opcion.value = String(x.id);
    opcion.textContent = x.nombre;
    return opcion;
  }));
  targetSelect.value = String(objetivoId);
}

async function elegirTipo(nuevoTipo, idPreferido = null) {
  const pedida = ++cargaCatalogo;
  tipo = nuevoTipo;
  Object.entries(tabs).forEach(([clave, boton]) => boton.setAttribute("aria-selected", String(clave === tipo)));
  targetLabel.textContent = TIPOS[tipo].etiqueta;
  contentBox.hidden = true;
  mostrarEstado("Cargando…");
  try {
    const elementos = await cargarCatalogo(tipo);
    if (pedida !== cargaCatalogo) return; // el cliente ya cambió de pestaña
    if (elementos.length === 0) {
      targetSelect.replaceChildren();
      mostrarEstado(`Todavía no hay ${tipo === "producto" ? "productos" : "marcas"} para reseñar.`);
      return;
    }
    const existe = elementos.some(x => String(x.id) === String(idPreferido));
    objetivoId = existe ? Number(idPreferido) : elementos[0].id;
    pintarSelector(elementos);
    await elegirObjetivo(objetivoId);
  } catch (error) {
    if (pedida !== cargaCatalogo) return;
    mostrarEstado(`No pudimos cargar la lista. ${error.message}`);
  }
}

async function elegirObjetivo(id) {
  objetivoId = Number(id);
  const elemento = (catalogos[tipo] || []).find(x => x.id === objetivoId);
  nombreObjetivo = elemento ? elemento.nombre : "";
  nameTitle.textContent = nombreObjetivo;
  guardarEnUrl();
  pagina = 1;
  mostrarEstado("");
  contentBox.hidden = false;
  mostrarAvisoFormulario("");
  await Promise.all([cargarResenas(true), cargarMia()]);
}

// ---------- Promedio y lista pública ----------
function pintarResumen(resumen) {
  const hay = resumen.total > 0;
  avgNumber.textContent = hay ? String(resumen.promedio) : "–";
  avgStars.textContent = hay ? estrellas(resumen.promedio) : "☆☆☆☆☆";
  avgStars.setAttribute("aria-label", hay ? `${resumen.promedio} de 5 estrellas` : "Sin calificaciones");
  totalLabel.textContent = hay ? plural(resumen.total, "reseña", "reseñas") : "Todavía no hay reseñas";
  barsList.replaceChildren(...[5, 4, 3, 2, 1].map(estrella => {
    const cuenta = Number(resumen.distribucion[String(estrella)]) || 0;
    const porcentaje = hay ? Math.round((cuenta / resumen.total) * 100) : 0;
    const fila = document.createElement("li");
    fila.className = "rev-bar";
    const relleno = document.createElement("div");
    relleno.className = "rev-bar__fill";
    relleno.style.width = `${porcentaje}%`;
    const pista = document.createElement("div");
    pista.className = "rev-bar__track";
    pista.append(relleno);
    fila.append(makeText("span", "rev-bar__label", `${estrella} ★`), pista, makeText("span", "rev-bar__count", numero(cuenta)));
    return fila;
  }));
}

function tarjetaResena(r) {
  const articulo = document.createElement("article");
  articulo.className = "rev-item";
  const cabecera = document.createElement("div");
  cabecera.className = "rev-item__head";
  const puntos = makeText("span", "rev-stars", estrellas(r.calificacion));
  puntos.setAttribute("aria-label", `${r.calificacion} de 5 estrellas`);
  cabecera.append(puntos);
  if (r.titulo) cabecera.append(makeText("strong", "rev-item__title", r.titulo));
  articulo.append(cabecera);
  if (r.comentario) articulo.append(makeText("p", "rev-item__text", r.comentario));
  const pie = document.createElement("div");
  pie.className = "rev-item__meta";
  pie.append(makeText("span", "", `${r.autor} · ${formatoDia(r.fecha)}`));
  if (r.compra_verificada) pie.append(makeText("span", "rev-badge rev-badge--verificada", "✓ Compra verificada"));
  articulo.append(pie);
  return articulo;
}

async function cargarResenas(reiniciar) {
  const esta = ++cargaLista;
  const pedido = { id: objetivoId, tipo, pagina: reiniciar ? 1 : pagina + 1 };
  moreButton.disabled = true;
  try {
    const datos = await pedirJson(`/api/resenas/${pedido.tipo}/${pedido.id}?limite=10&pagina=${pedido.pagina}`);
    if (esta !== cargaLista) return;
    if (!Array.isArray(datos.resenas) || !datos.resumen) throw new Error("La respuesta del servidor no tiene el formato esperado.");
    pagina = pedido.pagina;
    pintarResumen(datos.resumen);
    const nuevas = datos.resenas.map(tarjetaResena);
    if (reiniciar) list.replaceChildren(...nuevas); else list.append(...nuevas);
    listStatus.textContent = list.children.length === 0
      ? "Todavía no hay reseñas publicadas. ¡Sé la primera persona en opinar!"
      : "";
    moreButton.hidden = !datos.hay_mas;
  } catch (error) {
    if (esta !== cargaLista) return;
    listStatus.textContent = `No pudimos cargar las reseñas. ${error.message}`;
    moreButton.hidden = true;
  } finally {
    if (esta === cargaLista) moreButton.disabled = false;
  }
}

// ---------- Mi reseña ----------
function marcarEstrellas(valor) {
  calificacion = valor;
  Array.from(starsInput.children).forEach((boton, indice) => {
    const activa = indice + 1 <= valor;
    boton.className = `rev-star${activa ? " is-on" : ""}`;
    boton.setAttribute("aria-checked", String(indice + 1 === valor));
  });
}

function construirEstrellas() {
  starsInput.replaceChildren(...[1, 2, 3, 4, 5].map(valor => {
    const boton = makeText("button", "rev-star", "★");
    boton.type = "button";
    boton.setAttribute("role", "radio");
    boton.setAttribute("aria-label", `${valor} ${valor === 1 ? "estrella" : "estrellas"}`);
    boton.setAttribute("aria-checked", "false");
    boton.addEventListener("click", () => marcarEstrellas(valor));
    return boton;
  }));
}

function actualizarContador() {
  counter.textContent = `${commentInput.value.length} / 1000`;
}

function pintarFormulario() {
  const conSesion = Boolean(Sesion.leer());
  loginBox.hidden = conSesion;
  form.hidden = !conSesion;
  if (!conSesion) return;

  titleInput.value = miResena ? miResena.titulo || "" : "";
  commentInput.value = miResena ? miResena.comentario || "" : "";
  marcarEstrellas(miResena ? miResena.calificacion : 0);
  actualizarContador();
  deleteButton.hidden = !miResena;
  submitButton.textContent = miResena ? "Guardar cambios" : "Enviar reseña";

  if (miResena) {
    let texto = AVISO_ESTADO[miResena.estado] || "";
    if (miResena.estado === "rechazada" && miResena.motivo_rechazo) texto += ` Motivo: ${miResena.motivo_rechazo}`;
    mineState.textContent = texto;
    mineState.className = `rev-notice rev-notice--${miResena.estado}`;
    mineState.hidden = false;
  } else {
    mineState.hidden = true;
  }
}

async function cargarMia() {
  miResena = null;
  if (!Sesion.leer()) { pintarFormulario(); return; }
  try {
    miResena = await pedirJson(`/api/resenas/${tipo}/${objetivoId}/mia`);
  } catch (error) {
    if (!error.sinSesion) mostrarAvisoFormulario(`No pudimos cargar tu reseña. ${error.message}`, "error");
  }
  pintarFormulario();
}

async function enviar(evento) {
  evento.preventDefault();
  if (calificacion < 1) {
    mostrarAvisoFormulario("Elige una calificación de 1 a 5 estrellas.", "error");
    return;
  }
  submitButton.disabled = true;
  try {
    miResena = await pedirJson(`/api/resenas/${tipo}/${objetivoId}/mia`, conJson("PUT", {
      calificacion,
      titulo: titleInput.value,
      comentario: commentInput.value,
    }));
    pintarFormulario();
    mostrarAvisoFormulario(
      miResena.estado === "pendiente"
        ? "¡Gracias! Tu reseña se publicará cuando un administrador la apruebe."
        : "Tu reseña no tuvo cambios.",
      "ok"
    );
    cargarResenas(true);   // por si estaba publicada y volvió a revisión
    cargarMias();
  } catch (error) {
    if (error.sinSesion) { miResena = null; pintarFormulario(); }
    mostrarAvisoFormulario(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
}

async function borrar() {
  if (!confirm("¿Eliminar tu reseña? Esta acción no se puede deshacer.")) return;
  deleteButton.disabled = true;
  try {
    await pedirJson(`/api/resenas/${tipo}/${objetivoId}/mia`, { method: "DELETE" });
    miResena = null;
    pintarFormulario();
    mostrarAvisoFormulario("Tu reseña fue eliminada.", "ok");
    cargarResenas(true);
    cargarMias();
  } catch (error) {
    mostrarAvisoFormulario(error.message, "error");
  } finally {
    deleteButton.disabled = false;
  }
}

// ---------- Todas mis reseñas ----------
function filaMia(r) {
  const li = document.createElement("li");
  li.className = "rev-mine-item";
  const info = document.createElement("div");
  info.className = "rev-mine-item__info";
  info.append(makeText("strong", "", `${TIPOS[r.tipo].etiqueta}: ${r.objetivo}`));
  info.append(makeText("span", "rev-stars", estrellas(r.calificacion)));
  if (r.titulo) info.append(makeText("span", "rev-muted", r.titulo));
  if (r.estado === "rechazada" && r.motivo_rechazo) info.append(makeText("span", "rev-muted", `Motivo: ${r.motivo_rechazo}`));
  const estado = ESTADOS[r.estado] || ESTADOS.pendiente;
  const acciones = document.createElement("div");
  acciones.className = "rev-mine-item__actions";
  acciones.append(makeText("span", `rev-badge ${estado.clase}`, estado.texto));
  const ver = makeText("button", "secondary-button", "Ver / editar");
  ver.type = "button";
  ver.addEventListener("click", () => {
    elegirTipo(r.tipo, r.id_objetivo);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* no es obligatorio */ }
  });
  acciones.append(ver);
  li.append(info, acciones);
  return li;
}

async function cargarMias() {
  if (!Sesion.leer()) { mineAllBox.hidden = true; return; }
  try {
    const lista = await pedirJson("/api/resenas/mias");
    if (!Array.isArray(lista)) throw new Error();
    mineList.replaceChildren(...lista.map(filaMia));
    mineAllBox.hidden = lista.length === 0;
  } catch {
    mineAllBox.hidden = true; // si falla, el resto de la página sigue funcionando
  }
}

// ---------- Eventos e inicio ----------
tabs.producto.addEventListener("click", () => { if (tipo !== "producto") elegirTipo("producto"); });
tabs.marca.addEventListener("click", () => { if (tipo !== "marca") elegirTipo("marca"); });
targetSelect.addEventListener("change", () => elegirObjetivo(targetSelect.value));
moreButton.addEventListener("click", () => cargarResenas(false));
form.addEventListener("submit", enviar);
deleteButton.addEventListener("click", borrar);
commentInput.addEventListener("input", actualizarContador);

construirEstrellas();
const parametros = new URLSearchParams(location.search);
const tipoInicial = parametros.get("tipo") === "marca" ? "marca" : "producto";
elegirTipo(tipoInicial, parametros.get("id"));
cargarMias();
