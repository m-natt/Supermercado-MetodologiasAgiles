// Tarjetas de PRUEBA (entorno de demostración: no hay cobros reales).
// Lo usan tarjetas.html (mis tarjetas) y pago.html (pagar un pedido).
//
// Seguridad: el número completo y el CVV NUNCA se guardan ni se envían al
// servidor. De cada tarjeta solo se guarda: marca, últimos 4 dígitos,
// titular y vencimiento. Sesion viene de js/sesion.js.

// Únicas tarjetas que acepta la simulación (así nadie escribe una real)
const TARJETAS_PRUEBA = {
  "4242424242424242": { marca: "VISA", resultado: "Aprobada" },
  "5555555555554444": { marca: "MASTERCARD", resultado: "Aprobada" },
  "4000000000000002": { marca: "VISA", resultado: "Rechazada" },
};

const TarjetaUtil = {
  soloDigitos: valor => String(valor || "").replace(/\D/g, ""),

  formatearNumero(valor) {
    return TarjetaUtil.soloDigitos(valor).slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  },

  formatearVence(valor) {
    const d = TarjetaUtil.soloDigitos(valor).slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  },

  luhn(digitos) {
    let suma = 0;
    let doble = false;
    for (let i = digitos.length - 1; i >= 0; i--) {
      let x = Number(digitos[i]);
      if (doble) { x *= 2; if (x > 9) x -= 9; }
      suma += x;
      doble = !doble;
    }
    return suma % 10 === 0;
  },

  vigente(vence) {
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(vence)) return false;
    const [mes, anio] = vence.split("/").map(Number);
    const hoy = new Date();
    const anioActual = hoy.getFullYear() % 100;
    return anio > anioActual || (anio === anioActual && mes >= hoy.getMonth() + 1);
  },

  // Devuelve un mensaje de error, o "" si la tarjeta de prueba es válida
  validar({ titular, numero, vence }) {
    const digitos = TarjetaUtil.soloDigitos(numero);
    if (String(titular || "").trim().length < 3) return "Escribe el nombre del titular.";
    if (digitos.length !== 16 || !TarjetaUtil.luhn(digitos)) return "El número de tarjeta no es válido.";
    if (!TARJETAS_PRUEBA[digitos]) return "Solo se aceptan tarjetas de prueba (por ejemplo 4242 4242 4242 4242). No uses tarjetas reales.";
    if (!TarjetaUtil.vigente(vence)) return "Revisa la fecha de vencimiento (MM/AA) y que no esté vencida.";
    return "";
  },

  // Convierte el número completo en los datos seguros que sí se guardan
  resumen({ titular, numero, vence }) {
    const digitos = TarjetaUtil.soloDigitos(numero);
    return {
      marca: TARJETAS_PRUEBA[digitos]?.marca || "TARJETA",
      ultimos4: digitos.slice(-4),
      titular: String(titular).trim().slice(0, 60),
      vence,
    };
  },
};

// Tarjetas guardadas en este navegador, una lista por cuenta (o "invitado")
const Tarjetas = (() => {
  const clave = () => "supermercado_tarjetas_" + (Sesion.leer()?.cliente?.correo || "invitado");

  // Acepta también datos viejos (que guardaban el número completo) y los limpia
  function normalizar(t) {
    if (!t || typeof t !== "object") return null;
    const ultimos4 = t.ultimos4 || TarjetaUtil.soloDigitos(t.numero).slice(-4);
    if (!/^\d{4}$/.test(ultimos4)) return null;
    return {
      id: String(t.id || Date.now().toString(36)),
      marca: t.marca || TARJETAS_PRUEBA[TarjetaUtil.soloDigitos(t.numero)]?.marca || "TARJETA",
      ultimos4,
      titular: String(t.titular || "").slice(0, 60),
      vence: String(t.vence || ""),
      predeterminada: Boolean(t.predeterminada),
    };
  }

  function guardar(lista) {
    try {
      localStorage.setItem(clave(), JSON.stringify(lista));
      return true;
    } catch {
      return false;
    }
  }

  function leer() {
    let datos;
    try {
      datos = JSON.parse(localStorage.getItem(clave()) || "[]");
    } catch {
      return [];
    }
    if (!Array.isArray(datos)) return [];
    const lista = datos.map(normalizar).filter(Boolean);
    // Si había números completos guardados (versión anterior), se borran ya
    if (datos.some(t => t && "numero" in t)) guardar(lista);
    return lista;
  }

  function agregar(tarjeta, predeterminada) {
    const lista = leer();
    const nueva = TarjetaUtil.resumen(tarjeta);
    const repetida = lista.some(t =>
      t.marca === nueva.marca && t.ultimos4 === nueva.ultimos4 && t.vence === nueva.vence);
    if (repetida) return "duplicada";
    const esPredeterminada = predeterminada || lista.length === 0;
    if (esPredeterminada) lista.forEach(t => { t.predeterminada = false; });
    lista.push({ id: Date.now().toString(36), ...nueva, predeterminada: esPredeterminada });
    return guardar(lista) ? "ok" : "error";
  }

  function quitar(id) {
    const lista = leer().filter(t => t.id !== id);
    if (lista.length && !lista.some(t => t.predeterminada)) lista[0].predeterminada = true;
    guardar(lista);
  }

  function hacerPredeterminada(id) {
    guardar(leer().map(t => ({ ...t, predeterminada: t.id === id })));
  }

  const predeterminada = () => leer().find(t => t.predeterminada) || null;

  return { leer, agregar, quitar, hacerPredeterminada, predeterminada };
})();

// Dibuja una tarjeta (solo muestra los últimos 4 dígitos). makeText() de config.js
function dibujarTarjeta(t) {
  const card = document.createElement("div");
  card.className = "tcard";
  const top = document.createElement("div");
  top.className = "tcard__top";
  top.append(makeText("span", "tcard__brand", t.marca));
  if (t.predeterminada) top.append(makeText("span", "tcard__badge", "Predeterminada"));
  const bottom = document.createElement("div");
  bottom.className = "tcard__bot";
  const titular = document.createElement("div");
  titular.append(makeText("small", "", "TITULAR"), makeText("span", "", (t.titular || "—").toUpperCase()));
  const vence = document.createElement("div");
  vence.append(makeText("small", "", "VENCE"), makeText("span", "", t.vence || "MM/AA"));
  bottom.append(titular, vence);
  card.append(top, makeText("div", "tcard__num", `•••• •••• •••• ${t.ultimos4 || "••••"}`), bottom);
  return card;
}
