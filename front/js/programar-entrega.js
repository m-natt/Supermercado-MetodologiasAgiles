// Programar fecha y franja de entrega de un pedido.
// Se guarda en el backend (pedidos.fecha_entrega) con PUT /api/pedidos/{id}/entrega.
// API_BASE, money() y makeText() vienen de js/config.js; Sesion de js/sesion.js
(() => {
  const ULTIMO_PEDIDO_KEY = "supermercado_ultimo_pedido";
  // Mismas reglas que backend/app/services/pedido_service.py (si cambian allá, cámbialas aquí)
  const HORAS_ENTREGA = [8, 10, 12, 14, 16, 18];   // franjas de 2 horas, de 8:00 a 20:00
  const DURACION_FRANJA = 2;
  const DIAS_MAX = 14;
  const ANTICIPACION_MIN_MS = 60 * 60 * 1000;      // 1 hora
  const ESTADOS_PROGRAMABLES = ["confirmado", "preparando"];

  const $ = id => document.getElementById(id);
  const dos = n => String(n).padStart(2, "0");
  const hora = h => `${dos(h)}:00`;
  const franja = h => `${hora(h)} – ${hora(h + DURACION_FRANJA)}`;
  const numero = id => `#${String(id).padStart(6, "0")}`;
  const aISO = d => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
  const deISO = iso => {                 // "2026-11-20" -> Date local a medianoche
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const diaBonito = fecha => new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(fecha);

  let pedidos = [];      // pedidos que todavía se pueden programar
  let actual = null;     // el pedido seleccionado

  // ---------- Servidor ----------
  async function api(ruta, opciones = {}) {
    let respuesta;
    try {
      respuesta = await fetch(`${API_BASE}${ruta}`, { ...opciones, headers: Sesion.cabeceras(opciones.headers) });
    } catch {
      throw new Error("No hay conexión con el servidor. Verifica que el backend esté encendido.");
    }
    let cuerpo = null;
    try { cuerpo = await respuesta.json(); } catch { /* no era JSON */ }
    if (!respuesta.ok || !cuerpo || cuerpo.ok !== true) {
      const error = new Error(cuerpo && typeof cuerpo.error === "string" ? cuerpo.error : `Error ${respuesta.status} del servidor.`);
      error.status = respuesta.status;
      throw error;
    }
    return cuerpo.data;
  }

  // ---------- Pedido recién creado (lo guarda checkout.js) ----------
  function leerUltimoPedido() {
    try {
      const p = JSON.parse(sessionStorage.getItem(ULTIMO_PEDIDO_KEY) || "null");
      return p && p.id_pedido ? p : null;
    } catch { return null; }
  }

  function actualizarUltimoPedido(id, fechaEntrega) {
    const p = leerUltimoPedido();
    if (!p || p.id_pedido !== id) return;
    p.fecha_entrega = fechaEntrega;
    p.tiempo_estimado_min = null;   // ya no es una estimación: la eligió el cliente
    try { sessionStorage.setItem(ULTIMO_PEDIDO_KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
  }

  async function cargarPedidos() {
    if (Sesion.leer()) {
      try {
        const mios = await api("/api/clientes/yo/pedidos?limite=50");
        return mios.filter(p => ESTADOS_PROGRAMABLES.includes(p.estado));
      } catch (e) {
        if (e.status !== 401) throw e;
        Sesion.borrar();   // sesión vencida: se sigue como invitado
      }
    }
    // Invitado: solo puede programar el pedido que acaba de hacer en esta pestaña
    const ultimo = leerUltimoPedido();
    return ultimo ? [{ ...ultimo, estado: ultimo.estado || "confirmado" }] : [];
  }

  // ---------- Textos ----------
  function textoEntrega(valor) {
    const fecha = valor ? new Date(valor) : null;
    if (!fecha || Number.isNaN(fecha.getTime())) return "Por confirmar";
    const h = fecha.getHours();
    const esFranja = fecha.getMinutes() === 0 && HORAS_ENTREGA.includes(h);
    return `${diaBonito(fecha)}, ${esFranja ? `de ${franja(h)}` : `a las ${dos(h)}:${dos(fecha.getMinutes())}`}`;
  }

  function textoProductos(p) {
    const items = Array.isArray(p.items) ? p.items : [];
    const nombres = items.slice(0, 3).map(i => i.nombre).join(", ");
    return items.length > 3 ? `${nombres} y ${items.length - 3} más` : nombres || "Sin detalle de productos";
  }

  // ---------- Selección de pedido ----------
  function pintarSelector(idInicial) {
    const sel = $("pedido");
    sel.replaceChildren(...pedidos.map(p => {
      const op = new Option(`Pedido ${numero(p.id_pedido)} · ${money(p.total)}`, String(p.id_pedido));
      op.selected = String(p.id_pedido) === idInicial;
      return op;
    }));
    $("pedido-box").hidden = pedidos.length < 2;
    elegir(Number(sel.value));
  }

  function elegir(id) {
    actual = pedidos.find(p => p.id_pedido === id) || null;
    if (!actual) return;
    const caja = $("pedido-actual");
    caja.replaceChildren(
      makeText("strong", "", `Pedido ${numero(actual.id_pedido)}`),
      makeText("span", "", textoProductos(actual)),
      document.createElement("br"),
      makeText("span", "", `Entrega actual: ${textoEntrega(actual.fecha_entrega)}`),
    );
    if (!Sesion.leer()) {
      $("back-link").href = `confirmacion.html?pedido=${encodeURIComponent(actual.id_pedido)}`;
      $("back-link").textContent = "← Volver a mi pedido";
    }

    // Si la entrega actual cae en una franja válida, se deja marcada
    const f = actual.fecha_entrega ? new Date(actual.fecha_entrega) : null;
    const iso = f && !Number.isNaN(f.getTime()) ? aISO(f) : "";
    $("fecha").value = iso >= $("fecha").min && iso <= $("fecha").max ? iso : "";
    pintarHorarios(f && HORAS_ENTREGA.includes(f.getHours()) ? f.getHours() : null);
    mostrarError("");
    $("okmsg").hidden = true;
    pintarLista();
  }

  // ---------- Fecha y horarios ----------
  function limitesFecha() {
    const hoy = new Date();
    $("fecha").min = aISO(hoy);
    $("fecha").max = aISO(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + DIAS_MAX));
  }

  function horarioDisponible(iso, inicio) {
    const d = deISO(iso);
    d.setHours(inicio, 0, 0, 0);
    return d.getTime() - Date.now() >= ANTICIPACION_MIN_MS;
  }

  function pintarHorarios(marcar = null) {
    const iso = $("fecha").value;
    const previo = marcar ?? Number(document.querySelector('input[name="horario"]:checked')?.value);
    const cont = $("slots");
    cont.querySelectorAll(".slot").forEach(n => n.remove());

    let disponibles = 0;
    HORAS_ENTREGA.forEach(h => {
      const label = document.createElement("label");
      label.className = "slot";
      const radio = document.createElement("input");
      radio.type = "radio"; radio.name = "horario"; radio.value = String(h);
      const ok = iso ? horarioDisponible(iso, h) : false;
      radio.disabled = !ok;
      radio.checked = ok && h === previo;
      if (ok) disponibles++;
      label.append(radio, makeText("span", "", franja(h)));
      cont.append(label);
    });

    if (!iso) $("slots-nota").textContent = "Primero elige una fecha para ver los horarios.";
    else if (!disponibles) $("slots-nota").textContent = "Ya no hay horarios disponibles ese día. Prueba con otra fecha.";
    else $("slots-nota").textContent = "Los horarios tachados ya no están disponibles.";

    if (iso) {
      const dias = Math.round((deISO(iso) - deISO(aISO(new Date()))) / 86400000);
      $("anticipacion").value = dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : `En ${dias} días`;
    } else {
      $("anticipacion").value = "—";
    }
  }

  // ---------- Mensajes ----------
  function mostrarError(texto) {
    $("error").textContent = texto;
    $("error").hidden = !texto;
    if (texto) $("okmsg").hidden = true;
  }

  // ---------- Lista de próximas entregas ----------
  function pintarLista() {
    const ordenados = [...pedidos].sort((a, b) =>
      new Date(a.fecha_entrega || 8.64e15) - new Date(b.fecha_entrega || 8.64e15));
    $("lista").replaceChildren(...ordenados.map(p => {
      const li = document.createElement("li");
      li.className = "programada" + (actual && p.id_pedido === actual.id_pedido ? " programada--actual" : "");
      const texto = document.createElement("div");
      texto.append(
        makeText("strong", "", `Pedido ${numero(p.id_pedido)}`),
        makeText("small", "", `🚚 ${textoEntrega(p.fecha_entrega)} · ${textoProductos(p)}`),
      );
      li.append(texto);
      if (pedidos.length > 1 && p !== actual) {
        const cambiar = makeText("button", "secondary-button", "Cambiar");
        cambiar.type = "button";
        cambiar.setAttribute("aria-label", `Cambiar la entrega del pedido ${numero(p.id_pedido)}`);
        cambiar.addEventListener("click", () => {
          $("pedido").value = String(p.id_pedido);
          elegir(p.id_pedido);
          $("formulario").scrollIntoView({ behavior: "smooth" });
        });
        li.append(cambiar);
      }
      return li;
    }));
  }

  // ---------- Guardar ----------
  async function guardar(ev) {
    ev.preventDefault();
    if (!actual) return mostrarError("Elige un pedido.");
    const iso = $("fecha").value;
    if (!iso) return mostrarError("Elige la fecha de entrega.");
    if (iso < $("fecha").min) return mostrarError("La fecha no puede ser anterior a hoy.");
    if (iso > $("fecha").max) return mostrarError(`Solo puedes programar hasta ${DIAS_MAX} días hacia adelante.`);
    const valor = document.querySelector('input[name="horario"]:checked')?.value;
    if (!valor) return mostrarError("Elige un horario de entrega.");
    const inicio = Number(valor);
    if (!horarioDisponible(iso, inicio)) {
      pintarHorarios();
      return mostrarError("Ese horario ya no está disponible. Elige otro.");
    }

    const boton = $("guardar");
    boton.disabled = true;
    boton.textContent = "Guardando…";
    try {
      const r = await api(`/api/pedidos/${actual.id_pedido}/entrega`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: iso, hora_inicio: inicio }),
      });
      actual.fecha_entrega = r.fecha_entrega;
      actualizarUltimoPedido(actual.id_pedido, r.fecha_entrega);
      elegir(actual.id_pedido);
      $("okmsg").textContent = `✓ Entrega programada: ${textoEntrega(r.fecha_entrega)}.`;
      $("okmsg").hidden = false;
    } catch (e) {
      mostrarError(e.message);
    } finally {
      boton.disabled = false;
      boton.textContent = "Programar entrega";
    }
  }

  // ---------- Inicio ----------
  async function iniciar() {
    limitesFecha();
    $("fecha").addEventListener("change", () => { mostrarError(""); pintarHorarios(); });
    $("pedido").addEventListener("change", e => elegir(Number(e.target.value)));
    $("form").addEventListener("submit", guardar);

    try {
      pedidos = await cargarPedidos();
    } catch (e) {
      $("estado-carga").textContent = e.message;
      return;
    }
    $("estado-carga").hidden = true;

    if (!pedidos.length) {
      const conSesion = !!Sesion.leer();
      $("sin-pedidos-texto").textContent = conSesion
        ? "Solo se puede programar la entrega de pedidos confirmados o en preparación, y ahora no tienes ninguno."
        : "Haz un pedido o inicia sesión para programar la entrega de tus pedidos.";
      $("sin-pedidos-login").hidden = conSesion;
      $("sin-pedidos").hidden = false;
      return;
    }

    const idUrl = new URLSearchParams(location.search).get("pedido");
    $("formulario").hidden = false;
    $("lista-panel").hidden = false;
    pintarSelector(idUrl);
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
