// Inventario y alertas de bajo stock.
// API_BASE, money() y makeText() vienen de js/config.js
const THRESHOLD_KEY = "supermercado_umbral_stock";
const DEFAULT_THRESHOLD = 10; // igual que UMBRAL_DEFECTO en el backend
const MAX_STOCK = 1000000;    // igual que MAX_STOCK en el backend

const ESTADOS = {
  agotado: { texto: "Agotado", clase: "inv-badge--agotado" },
  bajo: { texto: "Stock bajo", clase: "inv-badge--bajo" },
  ok: { texto: "Normal", clase: "inv-badge--ok" },
};

const byId = id => document.getElementById(id);
const alertBox = byId("inv-alert");
const alertText = byId("inv-alert-text");
const alertButton = byId("inv-alert-button");
const sumTotal = byId("sum-total");
const sumAgotados = byId("sum-agotados");
const sumBajos = byId("sum-bajos");
const sumUnidades = byId("sum-unidades");
const countLabel = byId("inv-count");
const searchInput = byId("inv-search");
const filterSelect = byId("inv-filter");
const thresholdInput = byId("inv-threshold");
const refreshButton = byId("inv-refresh");
const messageBox = byId("inv-message");
const statusBox = byId("inv-status");
const tableBody = byId("inv-body");

let productos = [];                 // lo último que mandó el servidor
let umbral = leerUmbral();          // hasta cuántas unidades es "stock bajo"
let cargaActual = 0;                // evita que una respuesta lenta pise a una más nueva
let temporizadorUmbral;
let temporizadorMensaje;

const numero = n => new Intl.NumberFormat("es-MX").format(n);
const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;
const normalizar = texto => (texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function leerUmbral() {
  try {
    const crudo = localStorage.getItem(THRESHOLD_KEY);
    // Ojo: Number(null) es 0, por eso se revisa que haya algo guardado
    if (crudo !== null && crudo.trim() !== "") {
      const guardado = Number(crudo);
      if (Number.isInteger(guardado) && guardado >= 0 && guardado <= 100000) return guardado;
    }
  } catch { /* navegación privada: se usa el valor por defecto */ }
  return DEFAULT_THRESHOLD;
}

function guardarUmbral(valor) {
  try { localStorage.setItem(THRESHOLD_KEY, String(valor)); } catch { /* no pasa nada */ }
}

// ---------- Comunicación con el servidor ----------
async function pedirJson(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, opciones);
  } catch {
    throw new Error("No hay conexión con el servidor. ¿Está encendido el backend?");
  }
  let cuerpo = null;
  try { cuerpo = await respuesta.json(); } catch { /* la respuesta no era JSON */ }
  if (!respuesta.ok || !cuerpo || cuerpo.ok !== true) {
    const detalle = cuerpo && typeof cuerpo.error === "string"
      ? cuerpo.error
      : `El servidor respondió con estado ${respuesta.status}.`;
    throw new Error(detalle);
  }
  return cuerpo.data;
}

function conBody(metodo, datos) {
  return { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) };
}

// ---------- Mensajes ----------
function mostrarMensaje(texto, tipo = "ok") {
  clearTimeout(temporizadorMensaje);
  messageBox.textContent = texto;
  messageBox.className = `inv-message inv-message--${tipo}`;
  messageBox.hidden = false;
  if (tipo === "ok") temporizadorMensaje = setTimeout(() => { messageBox.hidden = true; }, 6000);
}

function mostrarEstado(texto) {
  statusBox.textContent = texto;
  statusBox.hidden = !texto;
}

// ---------- Resumen y alerta ----------
function pintarResumen(resumen) {
  sumTotal.textContent = numero(resumen.total);
  sumAgotados.textContent = numero(resumen.agotados);
  sumBajos.textContent = numero(resumen.bajos);
  sumUnidades.textContent = numero(resumen.unidades);

  const conAlerta = resumen.agotados + resumen.bajos;
  alertBox.hidden = false;
  if (conAlerta > 0) {
    alertBox.className = "inv-alert inv-alert--warn";
    alertText.textContent =
      `⚠️ Hay ${plural(resumen.agotados, "producto agotado", "productos agotados")} y ` +
      `${plural(resumen.bajos, "producto con stock bajo", "productos con stock bajo")} ` +
      `(${numero(umbral)} unidades o menos).`;
    alertButton.hidden = false;
  } else {
    alertBox.className = "inv-alert inv-alert--ok";
    alertText.textContent = "✅ Todo en orden: no hay productos agotados ni con stock bajo.";
    alertButton.hidden = true;
  }
}

// ---------- Tabla ----------
function visibles() {
  const texto = normalizar(searchInput.value.trim());
  const filtro = filterSelect.value;
  return productos.filter(p => {
    if (filtro === "alertas" && p.estado === "ok") return false;
    if (filtro !== "todos" && filtro !== "alertas" && p.estado !== filtro) return false;
    if (!texto) return true;
    return normalizar(`${p.nombre} ${p.categoria} ${p.marca || ""}`).includes(texto);
  });
}

function celdaAcciones(p) {
  const celda = document.createElement("td");
  const grupo = document.createElement("div");
  grupo.className = "inv-actions";

  const entrada = document.createElement("input");
  entrada.type = "number";
  entrada.min = "0";
  entrada.max = String(MAX_STOCK);
  entrada.step = "1";
  entrada.inputMode = "numeric";
  entrada.placeholder = "Cant.";
  entrada.className = "inv-qty";
  entrada.setAttribute("aria-label", `Cantidad para ${p.nombre}`);
  grupo.append(entrada);

  const botones = [
    ["+ Agregar", "inv-btn inv-btn--add", "agregar"],
    ["− Quitar", "inv-btn", "quitar"],
    ["Fijar", "inv-btn", "fijar"],
  ].map(([texto, clase, tipo]) => {
    const boton = makeText("button", clase, texto);
    boton.type = "button";
    boton.addEventListener("click", () => aplicarCambio(p, entrada, tipo, botones));
    return boton;
  });
  grupo.append(...botones);

  // Enter en la casilla = agregar
  entrada.addEventListener("keydown", evento => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      aplicarCambio(p, entrada, "agregar", botones);
    }
  });

  celda.append(grupo);
  return celda;
}

function filaProducto(p) {
  const fila = document.createElement("tr");
  fila.className = `inv-row inv-row--${p.estado}`;

  const producto = document.createElement("td");
  producto.append(makeText("strong", "inv-name", p.nombre));
  producto.append(makeText("span", "inv-meta", [p.categoria, p.marca].filter(Boolean).join(" · ")));

  const stock = document.createElement("td");
  stock.className = "inv-num";
  stock.append(makeText("strong", "inv-stock", numero(p.stock)));
  stock.append(makeText("span", "inv-meta", p.unidad));

  const estado = document.createElement("td");
  const info = ESTADOS[p.estado] || ESTADOS.ok;
  estado.append(makeText("span", `inv-badge ${info.clase}`, info.texto));

  fila.append(producto, stock, estado, celdaAcciones(p));
  return fila;
}

function pintarTabla() {
  const lista = visibles();
  countLabel.textContent = lista.length === productos.length
    ? plural(productos.length, "producto", "productos")
    : `${numero(lista.length)} de ${numero(productos.length)}`;

  tableBody.replaceChildren(...lista.map(filaProducto));
  if (productos.length === 0) {
    mostrarEstado("Todavía no hay productos en el inventario.");
  } else if (lista.length === 0) {
    mostrarEstado("Ningún producto coincide con la búsqueda o el filtro.");
  } else {
    mostrarEstado("");
  }
}

// ---------- Cargar y cambiar ----------
async function cargar({ primera = false } = {}) {
  const esta = ++cargaActual;
  if (primera) mostrarEstado("Cargando inventario…");
  refreshButton.disabled = true;
  try {
    const datos = await pedirJson(`/api/inventario?umbral=${umbral}`);
    if (esta !== cargaActual) return; // llegó una consulta más nueva
    if (!Array.isArray(datos.productos) || !datos.resumen) {
      throw new Error("La respuesta del servidor no tiene el formato esperado.");
    }
    productos = datos.productos;
    pintarResumen(datos.resumen);
    pintarTabla();
  } catch (error) {
    if (esta !== cargaActual) return;
    mostrarMensaje(`No pudimos cargar el inventario. ${error.message}`, "error");
    if (productos.length === 0) mostrarEstado("No se pudo cargar el inventario. Pulsa «Actualizar» para reintentar.");
  } finally {
    if (esta === cargaActual) refreshButton.disabled = false;
  }
}

async function aplicarCambio(p, entrada, tipo, botones) {
  const texto = entrada.value.trim();
  const cantidad = Number(texto);
  const minimo = tipo === "fijar" ? 0 : 1;
  if (texto === "" || !Number.isInteger(cantidad) || cantidad < minimo || cantidad > MAX_STOCK) {
    mostrarMensaje(
      tipo === "fijar"
        ? "Escribe el stock final como número entero (0 o más)."
        : "Escribe una cantidad entera mayor que 0.",
      "error"
    );
    entrada.focus();
    return;
  }

  botones.forEach(b => { b.disabled = true; });
  try {
    const resultado = tipo === "fijar"
      ? await pedirJson(`/api/inventario/${p.id_producto}/stock?umbral=${umbral}`, conBody("PUT", { stock: cantidad }))
      : await pedirJson(
          `/api/inventario/${p.id_producto}/ajuste?umbral=${umbral}`,
          conBody("POST", { cantidad: tipo === "agregar" ? cantidad : -cantidad })
        );
    mostrarMensaje(`${p.nombre}: de ${numero(resultado.stock_anterior)} a ${numero(resultado.stock)} ${p.unidad}.`, "ok");
    await cargar(); // vuelve a pedir todo para que el resumen y las alertas se actualicen
  } catch (error) {
    mostrarMensaje(error.message, "error");
    botones.forEach(b => { b.disabled = false; });
  }
}

// ---------- Eventos ----------
searchInput.addEventListener("input", pintarTabla);
filterSelect.addEventListener("change", pintarTabla);
refreshButton.addEventListener("click", () => cargar());
alertButton.addEventListener("click", () => {
  filterSelect.value = "alertas";
  searchInput.value = "";
  pintarTabla();
});

thresholdInput.value = String(umbral);
thresholdInput.addEventListener("input", () => {
  clearTimeout(temporizadorUmbral);
  // Espera un momento después de teclear para no consultar en cada tecla
  temporizadorUmbral = setTimeout(() => {
    const valor = Number(thresholdInput.value);
    if (thresholdInput.value.trim() === "" || !Number.isInteger(valor) || valor < 0 || valor > 100000) {
      mostrarMensaje("El límite de stock bajo debe ser un número entero entre 0 y 100,000.", "error");
      return;
    }
    umbral = valor;
    guardarUmbral(valor);
    cargar();
  }, 500);
});

cargar({ primera: true });
