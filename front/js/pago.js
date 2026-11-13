// Página de pago con tarjeta SIMULADO (pago.html).
// Paga el pedido recién creado en el checkout. Al servidor solo se envían
// marca, últimos 4 dígitos y vencimiento: nunca el número completo ni el CVV.
// API_BASE/money/makeText: config.js · Sesion: sesion.js · Tarjetas/TarjetaUtil: tarjetas.js

const ULTIMO_PEDIDO_KEY = "supermercado_ultimo_pedido";
const $ = id => document.getElementById(id);

const idPedido = new URLSearchParams(location.search).get("pedido");
let pedido = null;
let tarjetaElegida = null; // tarjeta guardada seleccionada, o null = tarjeta nueva
let enviando = false;

function leerPedido() {
  try {
    const p = JSON.parse(sessionStorage.getItem(ULTIMO_PEDIDO_KEY) || "null");
    return p && String(p.id_pedido) === idPedido && p.metodo_pago === "tarjeta_linea" ? p : null;
  } catch {
    return null;
  }
}

function guardarPedido(p) {
  try { sessionStorage.setItem(ULTIMO_PEDIDO_KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
}

function irAConfirmacion() {
  location.href = `confirmacion.html?pedido=${encodeURIComponent(pedido.id_pedido)}`;
}

function mostrarError(texto) {
  $("pay-error").textContent = texto;
  $("pay-error").hidden = !texto;
}

// Vista previa: tarjeta guardada elegida, o lo que se va escribiendo
function actualizarVista() {
  const datos = tarjetaElegida || {
    marca: TARJETAS_PRUEBA[TarjetaUtil.soloDigitos($("number").value)]?.marca || "TARJETA",
    ultimos4: TarjetaUtil.soloDigitos($("number").value).slice(-4).padStart(4, "•"),
    titular: $("name").value || "NOMBRE DEL TITULAR",
    vence: $("expiry").value || "MM/AA",
  };
  $("card-preview").replaceChildren(dibujarTarjeta({ ...datos, predeterminada: false }));
  $("new-card-fields").hidden = Boolean(tarjetaElegida);
}

function opcion(valor, titulo, detalle, marcada) {
  const label = document.createElement("label");
  label.className = "payment-option";
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "saved_card";
  radio.value = valor;
  radio.checked = marcada;
  radio.addEventListener("change", () => {
    tarjetaElegida = Tarjetas.leer().find(t => t.id === valor) || null;
    mostrarError("");
    actualizarVista();
  });
  const texto = document.createElement("span");
  texto.append(makeText("strong", "", titulo), makeText("small", "", detalle));
  label.append(radio, makeText("span", "payment-option__icon", valor === "nueva" ? "➕" : "💳"), texto);
  return label;
}

function pintarGuardadas() {
  const lista = Tarjetas.leer();
  $("saved-section").hidden = lista.length === 0;
  if (!lista.length) return;
  tarjetaElegida = Tarjetas.predeterminada();
  $("saved-options").replaceChildren(
    ...lista.map(t => opcion(t.id, `${t.marca} •••• ${t.ultimos4}`,
      `${t.titular} · vence ${t.vence}${t.predeterminada ? " · predeterminada" : ""}`,
      t.id === tarjetaElegida?.id)),
    opcion("nueva", "Usar otra tarjeta", "Escribe los datos de una tarjeta de prueba", !tarjetaElegida),
  );
}

async function pagar(event) {
  event.preventDefault();
  if (enviando) return;
  mostrarError("");

  if (!/^\d{3,4}$/.test($("cvv").value)) return mostrarError("El CVV debe tener 3 o 4 dígitos.");

  let datos;
  if (tarjetaElegida) {
    if (!TarjetaUtil.vigente(tarjetaElegida.vence)) return mostrarError("Esa tarjeta está vencida. Elige otra.");
    datos = { marca: tarjetaElegida.marca, ultimos4: tarjetaElegida.ultimos4, vence: tarjetaElegida.vence };
  } else {
    const nueva = { titular: $("name").value, numero: $("number").value, vence: $("expiry").value };
    const error = TarjetaUtil.validar(nueva);
    if (error) return mostrarError(error);
    if ($("save-card").checked) Tarjetas.agregar(nueva, false);
    const { marca, ultimos4, vence } = TarjetaUtil.resumen(nueva);
    datos = { marca, ultimos4, vence };
  }

  enviando = true;
  $("pay-button").disabled = true;
  $("pay-button").textContent = "Procesando…";
  try {
    const response = await fetch(`${API_BASE}/api/pedidos/${encodeURIComponent(pedido.id_pedido)}/pago-tarjeta`, {
      method: "POST",
      headers: Sesion.cabeceras({ "Content-Type": "application/json" }),
      body: JSON.stringify(datos),
    });
    let result = null;
    try { result = await response.json(); } catch { /* sin JSON */ }
    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.error || `El servidor respondió con estado ${response.status}.`);
    }

    const pago = result.data;
    pedido.pago = { estado: pago.estado, folio: pago.folio, tarjeta: pago.tarjeta };
    guardarPedido(pedido);
    if (pago.estado === "aprobado") return irAConfirmacion();
    mostrarError(`Pago rechazado (simulación) con ${pago.tarjeta}. Prueba con otra tarjeta.`);
  } catch (error) {
    mostrarError(error instanceof TypeError
      ? "No pudimos conectar con el servidor. Verifica que el backend esté encendido."
      : error.message);
  } finally {
    // El CVV se borra siempre después de intentar pagar
    $("cvv").value = "";
    enviando = false;
    $("pay-button").disabled = false;
    $("pay-button").textContent = `Pagar ${money(pedido.total)}`;
  }
}

pedido = leerPedido();
if (!pedido) {
  $("pay-missing").hidden = false;
} else if (pedido.pago?.estado === "aprobado") {
  irAConfirmacion(); // ya estaba pagado
} else {
  $("pay-layout").hidden = false;
  $("pay-order").textContent = `#${String(pedido.id_pedido).padStart(6, "0")}`;
  $("pay-total").textContent = money(pedido.total);
  $("pay-button").textContent = `Pagar ${money(pedido.total)}`;
  $("pay-later").href = `confirmacion.html?pedido=${encodeURIComponent(pedido.id_pedido)}`;

  $("number").addEventListener("input", e => { e.target.value = TarjetaUtil.formatearNumero(e.target.value); actualizarVista(); });
  $("expiry").addEventListener("input", e => { e.target.value = TarjetaUtil.formatearVence(e.target.value); actualizarVista(); });
  $("name").addEventListener("input", actualizarVista);
  $("cvv").addEventListener("input", e => { e.target.value = TarjetaUtil.soloDigitos(e.target.value).slice(0, 4); });
  $("pay-form").addEventListener("submit", pagar);

  pintarGuardadas();
  actualizarVista();
}
