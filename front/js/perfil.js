// Página "Editar mi perfil" (perfil.html).
// API_BASE viene de js/config.js y Sesion de js/sesion.js
const $ = id => document.getElementById(id);

const form = $("perfil-form");
const campos = {
  nombre: $("nombre"),
  apellidos: $("apellidos"),
  correo: $("correo"),
  telefono: $("telefono"),
};
const botonGuardar = $("perfil-guardar");
const botonCancelar = $("perfil-cancelar");

// Datos tal como están guardados en el servidor (sirve para detectar cambios y descartarlos)
let original = null;

// ---------- Avisos ----------
function mostrarError(texto) {
  $("perfil-error").textContent = texto;
  $("perfil-error").hidden = !texto;
  if (texto) $("perfil-ok").hidden = true;
}

function mostrarOk(texto) {
  $("perfil-ok").textContent = texto;
  $("perfil-ok").hidden = !texto;
  if (texto) $("perfil-error").hidden = true;
}

// ---------- Comunicación con el servidor ----------
async function api(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, {
      ...opciones,
      headers: Sesion.cabeceras({ "Content-Type": "application/json" }),
    });
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
    const error = new Error(
      respuesta.status === 422
        ? "Revisa tus datos: hay campos con un formato no válido."
        : (cuerpo && typeof cuerpo.error === "string"
            ? cuerpo.error
            : `El servidor respondió con estado ${respuesta.status}.`)
    );
    error.status = respuesta.status;
    throw error;
  }
  return cuerpo.data;
}

// ---------- Formulario ----------
function valoresActuales() {
  return {
    nombre: campos.nombre.value.trim(),
    apellidos: campos.apellidos.value.trim(),
    telefono: campos.telefono.value.trim(),
  };
}

function valoresDe(cliente) {
  return {
    nombre: (cliente.nombre || "").trim(),
    apellidos: (cliente.apellidos || "").trim(),
    telefono: (cliente.telefono || "").trim(),
  };
}

function hayCambios() {
  if (!original) return false;
  const ahora = valoresActuales();
  return Object.keys(ahora).some(clave => ahora[clave] !== original[clave]);
}

function actualizarBotones() {
  const cambios = hayCambios();
  botonGuardar.disabled = !cambios;
  botonCancelar.disabled = !cambios;
}

function pintar(cliente) {
  original = valoresDe(cliente);
  campos.nombre.value = original.nombre;
  campos.apellidos.value = original.apellidos;
  campos.correo.value = cliente.correo || "";
  campos.telefono.value = original.telefono;
  actualizarBotones();
}

// Devuelve el texto del primer problema que encuentre, o "" si todo está bien
function validar({ nombre, telefono }) {
  if (!nombre) return "Escribe tu nombre.";
  if (!/^[0-9 +()-]+$/.test(telefono)) return "El teléfono solo puede tener números, espacios y los símbolos + ( ) -";
  if (telefono.replace(/\D/g, "").length < 10) return "El teléfono debe tener al menos 10 dígitos.";
  return "";
}

function mostrarLogin() {
  $("perfil-login").hidden = false;
  $("perfil-contenido").hidden = true;
}

function mostrarFormulario() {
  $("perfil-login").hidden = true;
  $("perfil-contenido").hidden = false;
}

// ---------- Eventos ----------
// El teléfono solo acepta los caracteres permitidos
campos.telefono.addEventListener("input", e => {
  e.target.value = e.target.value.replace(/[^0-9 +()-]/g, "");
});

form.addEventListener("input", () => {
  actualizarBotones();
  mostrarOk("");
});

botonCancelar.addEventListener("click", () => {
  const sesion = Sesion.leer();
  if (sesion) pintar(sesion.cliente); // vuelve a los últimos datos guardados
  mostrarError("");
  mostrarOk("");
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  mostrarOk("");
  const datos = valoresActuales();

  const problema = validar(datos);
  if (problema) return mostrarError(problema);
  if (!hayCambios()) return mostrarError("No hiciste ningún cambio.");
  mostrarError("");

  const sesion = Sesion.leer();
  if (!sesion) return mostrarLogin();

  botonGuardar.disabled = true;
  botonGuardar.textContent = "Guardando…";
  try {
    const cliente = await api("/api/clientes/yo", {
      method: "PUT",
      body: JSON.stringify({
        nombre: datos.nombre,
        apellidos: datos.apellidos || null,
        telefono: datos.telefono,
      }),
    });
    // La sesión del navegador se actualiza para que el checkout y "Mi cuenta" muestren los datos nuevos
    Sesion.guardar({ token: sesion.token, cliente });
    pintar(cliente);
    mostrarOk("✓ Tus datos se guardaron correctamente.");
  } catch (err) {
    if (err.sinSesion) return mostrarLogin();
    mostrarError(err.message);
  } finally {
    botonGuardar.textContent = "Guardar cambios";
    actualizarBotones();
  }
});

// ---------- Inicio ----------
(async function iniciar() {
  const sesion = Sesion.leer();
  if (!sesion) return mostrarLogin();

  // Se muestran enseguida los datos guardados en el navegador...
  mostrarFormulario();
  pintar(sesion.cliente);

  // ...y se confirman con el servidor (por si cambiaron o la sesión venció)
  try {
    const cliente = await api("/api/clientes/yo");
    Sesion.guardar({ token: sesion.token, cliente });
    if (!hayCambios()) pintar(cliente); // no se pisa lo que la persona ya empezó a escribir
  } catch (err) {
    if (err.sinSesion) return mostrarLogin();
    mostrarError(err.message);
  }
})();
