// Facturación SIMULADA (factura.html?pedido=ID).
// Solo para clientes con sesión y pedidos pagados (el backend lo vuelve a revisar).
// API_BASE/money/makeText: config.js · Sesion: sesion.js

const $ = id => document.getElementById(id);
const idPedido = new URLSearchParams(location.search).get("pedido");
const PATRON_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
let facturaActual = null;

async function api(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, {
      ...opciones,
      headers: Sesion.cabeceras({ "Content-Type": "application/json", ...(opciones.headers || {}) }),
    });
  } catch {
    throw new Error("No pudimos conectar con el servidor. Verifica que el backend esté encendido.");
  }
  let resultado = null;
  try { resultado = await respuesta.json(); } catch { /* sin JSON */ }
  if (respuesta.status === 401) Sesion.borrar();
  if (!respuesta.ok || resultado?.ok !== true) {
    const error = new Error(respuesta.status === 422
      ? "Revisa tus datos fiscales: hay campos con un formato no válido."
      : (resultado?.error || `El servidor respondió con estado ${respuesta.status}.`));
    error.status = respuesta.status;
    throw error;
  }
  return resultado.data;
}

function mensaje(titulo, texto, enlace = { href: "historial.html", texto: "Ir a mis pedidos" }) {
  $("fac-layout").hidden = true;
  $("fac-message").hidden = false;
  $("fac-message-title").textContent = titulo;
  $("fac-message-text").textContent = texto;
  $("fac-message-link").href = enlace.href;
  $("fac-message-link").textContent = enlace.texto;
}

const fecha = valor => new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short" }).format(new Date(valor));

function mostrarResumen(pedido, factura) {
  $("s-pedido").textContent = `#${pedido.id_pedido}`;
  $("s-fecha").textContent = fecha(pedido.fecha);
  $("s-total").textContent = money(pedido.total);
  if (factura) {
    $("s-subtotal").textContent = money(factura.subtotal);
    $("s-iva").textContent = money(factura.iva);
  } else {
    // Vista previa: el backend hace el cálculo exacto línea por línea
    const subtotal = Math.round((Number(pedido.total) / 1.16) * 100) / 100;
    $("s-subtotal").textContent = money(subtotal);
    $("s-iva").textContent = money(Number(pedido.total) - subtotal);
  }
}

function mostrarFactura(factura) {
  facturaActual = factura;
  $("fac-title").textContent = `Factura ${factura.folio}`;
  $("fac-form").hidden = true;
  $("fac-done").hidden = false;
  $("d-folio").textContent = factura.folio;
  $("d-uuid").textContent = factura.uuid;
  $("d-fecha").textContent = fecha(factura.fecha);
  $("d-rfc").textContent = factura.rfc;
  $("d-razon").textContent = factura.razon_social;
}

function llenarSelect(select, catalogo, elegido) {
  select.replaceChildren(...Object.entries(catalogo).map(([clave, nombre]) => {
    const opcion = makeText("option", "", `${clave} - ${nombre}`);
    opcion.value = clave;
    opcion.selected = clave === elegido;
    return opcion;
  }));
}

async function mostrarFormulario() {
  const [catalogos, guardados] = await Promise.all([
    api("/api/facturas/catalogos"),
    api("/api/clientes/yo/datos-fiscales"),
  ]);
  const d = guardados || { rfc: "", razon_social: "", codigo_postal: "", regimen_fiscal: "616", uso_cfdi: "G03" };
  $("rfc").value = d.rfc;
  $("razon").value = d.razon_social;
  $("cp").value = d.codigo_postal;
  llenarSelect($("regimen"), catalogos.regimenes, d.regimen_fiscal);
  llenarSelect($("uso"), catalogos.usos_cfdi, d.uso_cfdi);
  $("fac-form").hidden = false;
}

function errorFormulario(texto) {
  $("fac-error").textContent = texto;
  $("fac-error").hidden = !texto;
}

$("rfc").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/\s/g, ""); });
$("cp").addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 5); });

$("fac-form").addEventListener("submit", async evento => {
  evento.preventDefault();
  const datos = {
    rfc: $("rfc").value.trim().toUpperCase(),
    razon_social: $("razon").value.trim(),
    codigo_postal: $("cp").value.trim(),
    regimen_fiscal: $("regimen").value,
    uso_cfdi: $("uso").value,
    guardar: $("guardar").checked,
  };
  if (!PATRON_RFC.test(datos.rfc)) return errorFormulario("El RFC no tiene un formato válido (12 o 13 caracteres).");
  if (!datos.razon_social) return errorFormulario("Escribe tu nombre o razón social.");
  if (!/^\d{5}$/.test(datos.codigo_postal)) return errorFormulario("El código postal fiscal debe tener 5 dígitos.");

  errorFormulario("");
  $("fac-submit").disabled = true;
  $("fac-submit").textContent = "Generando…";
  try {
    const factura = await api(`/api/pedidos/${encodeURIComponent(idPedido)}/factura`, {
      method: "POST",
      body: JSON.stringify(datos),
    });
    mostrarFactura(factura);
    $("s-subtotal").textContent = money(factura.subtotal);
    $("s-iva").textContent = money(factura.iva);
  } catch (error) {
    if (error.status === 401) return mensaje("Tu sesión expiró", "Inicia sesión de nuevo para facturar.", { href: "usuarios.html", texto: "Iniciar sesión" });
    errorFormulario(error.message);
  } finally {
    $("fac-submit").disabled = false;
    $("fac-submit").textContent = "Generar factura";
  }
});

// Descarga con la sesión (por eso no basta un enlace normal)
async function descargar(tipo) {
  $("fac-download-error").hidden = true;
  try {
    const respuesta = await fetch(`${API_BASE}/api/facturas/${facturaActual.id_factura}/${tipo}`, {
      headers: Sesion.cabeceras(),
    });
    if (!respuesta.ok) throw new Error(`No pudimos descargar el ${tipo.toUpperCase()} (estado ${respuesta.status}).`);
    const archivo = await respuesta.blob();
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `factura-${facturaActual.folio}-simulacion.${tipo}`;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    $("fac-download-error").textContent = error instanceof TypeError
      ? "No pudimos conectar con el servidor." : error.message;
    $("fac-download-error").hidden = false;
  }
}

$("btn-pdf").addEventListener("click", () => descargar("pdf"));
$("btn-xml").addEventListener("click", () => descargar("xml"));

(async () => {
  if (!Sesion.leer()) {
    return mensaje("Inicia sesión para facturar", "La facturación solo está disponible para clientes con cuenta.",
      { href: "usuarios.html", texto: "Iniciar sesión" });
  }
  if (!/^\d+$/.test(idPedido || "")) {
    return mensaje("Elige un pedido", "Abre tus pedidos y da clic en \"Facturar\" en el que quieras.");
  }
  try {
    const { pedido, factura } = await api(`/api/pedidos/${idPedido}/factura`);
    mostrarResumen(pedido, factura);
    if (factura) {
      mostrarFactura(factura);
    } else if (!pedido.facturable) {
      return mensaje("Este pedido todavía no se puede facturar",
        "Solo se pueden facturar pedidos pagados. Cuando el pago esté aprobado, vuelve aquí.");
    } else {
      $("fac-title").textContent = `Facturar pedido #${pedido.id_pedido}`;
      await mostrarFormulario();
    }
    $("fac-layout").hidden = false;
  } catch (error) {
    if (error.status === 401) {
      return mensaje("Tu sesión expiró", "Inicia sesión de nuevo para facturar.", { href: "usuarios.html", texto: "Iniciar sesión" });
    }
    if (error.status === 404) return mensaje("No encontramos ese pedido", "Revisa que sea uno de tus pedidos.");
    mensaje("No pudimos cargar la factura", error.message);
  }
})();
