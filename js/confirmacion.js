// Página de confirmación: muestra el pedido que checkout.js guardó al crearlo.
// money() y makeText() vienen de js/config.js

const ULTIMO_PEDIDO_KEY = "supermercado_ultimo_pedido";

const METODOS = {
  efectivo: {
    nombre: "💵 Efectivo al recibir",
    ayuda: "Paga al repartidor cuando llegue tu pedido. Si puedes, ten el monto exacto.",
  },
  tarjeta: {
    nombre: "💳 Tarjeta al recibir",
    ayuda: "El repartidor llevará una terminal para cobrarte con tarjeta al entregar.",
  },
  transferencia: {
    nombre: "🏦 Transferencia",
    ayuda: "Te contactaremos al teléfono o correo que registraste con los datos para transferir.",
  },
};

const $ = id => document.getElementById(id);

function orderNumber(id) {
  return `#${String(id).padStart(6, "0")}`;
}

function formatDate(value, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Por confirmar";
  return new Intl.DateTimeFormat("es-MX", {
    weekday: withTime ? undefined : "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function readOrder() {
  try {
    const order = JSON.parse(sessionStorage.getItem(ULTIMO_PEDIDO_KEY) || "null");
    return order && order.id_pedido ? order : null;
  } catch {
    return null;
  }
}

function itemRow(item) {
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
  info.append(makeText("p", "cart-item__price", `${item.cantidad} × ${money(item.precio)} / ${item.unidad}`));

  row.append(thumb, info, makeText("p", "cart-item__total", money(item.subtotal)));
  return row;
}

function showOrder(order) {
  const cliente = order.cliente || {};
  const d = order.direccion || {};
  const metodo = METODOS[order.metodo_pago] || { nombre: order.metodo_pago, ayuda: "" };

  document.title = `Pedido ${orderNumber(order.id_pedido)} | Supermercado Bonito :3`;
  $("confirm-title").textContent = cliente.nombre
    ? `¡Gracias, ${cliente.nombre}!`
    : "¡Gracias por tu compra!";
  $("confirm-subtitle").textContent =
    `Recibimos tu pedido el ${formatDate(order.fecha, true)} y ya lo estamos preparando. ` +
    "Guarda tu número de pedido para cualquier aclaración.";
  $("confirm-number").textContent = orderNumber(order.id_pedido);

  $("confirm-delivery").textContent = formatDate(order.fecha_entrega);
  const address = $("confirm-address");
  address.replaceChildren(
    makeText("span", "", d.calle),
    makeText("span", "", [d.colonia, d.ciudad].filter(Boolean).join(", ")),
    makeText("span", "", d.codigo_postal ? `C.P. ${d.codigo_postal}` : ""),
  );
  if (d.referencias) address.append(makeText("span", "confirm-help", `Referencias: ${d.referencias}`));

  $("confirm-method").textContent = metodo.nombre;
  $("confirm-method-help").textContent = metodo.ayuda;
  $("confirm-contact").textContent =
    [[cliente.nombre, cliente.apellidos].filter(Boolean).join(" "), cliente.correo].filter(Boolean).join(" · ");

  $("confirm-items").replaceChildren(...(order.items || []).map(itemRow));
  $("confirm-subtotal").textContent = money(order.subtotal);
  $("confirm-shipping").textContent = Number(order.costo_envio) === 0 ? "Gratis" : money(order.costo_envio);
  $("confirm-total").textContent = money(order.total);

  $("confirm").hidden = false;
}

function showMissing(idFromUrl) {
  if (idFromUrl) {
    // El pedido sí se creó, pero esta pestaña no tiene sus detalles
    $("missing-title").textContent = `Tu pedido ${orderNumber(idFromUrl)} fue registrado`;
    $("missing-text").textContent =
      "No pudimos mostrar el detalle en esta pestaña. Guarda tu número de pedido para cualquier aclaración.";
  }
  $("confirm-missing").hidden = false;
}

$("print-button").addEventListener("click", () => window.print());

const idFromUrl = new URLSearchParams(location.search).get("pedido");
const cleanId = /^\d+$/.test(idFromUrl || "") ? idFromUrl : null;
const order = readOrder();

if (order && (!cleanId || String(order.id_pedido) === cleanId)) {
  showOrder(order);
} else {
  showMissing(cleanId);
}
