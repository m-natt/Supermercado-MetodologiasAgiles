// Sesión del cliente guardada en el navegador.
// Solo se guarda el token y los datos públicos del cliente, NUNCA la contraseña.
const Sesion = (() => {
  const KEY = "supermercado_sesion";

  function leer() {
    try {
      const sesion = JSON.parse(localStorage.getItem(KEY) || "null");
      return sesion && typeof sesion.token === "string" && sesion.cliente ? sesion : null;
    } catch {
      return null;
    }
  }

  function guardar(sesion) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ token: sesion.token, cliente: sesion.cliente }));
    } catch { /* navegación privada: la sesión dura solo esta página */ }
  }

  function borrar() {
    try { localStorage.removeItem(KEY); } catch { /* nada que borrar */ }
  }

  // Cabecera para las peticiones que necesitan saber quién es el cliente
  function cabeceras(extra = {}) {
    const sesion = leer();
    return sesion ? { ...extra, Authorization: `Bearer ${sesion.token}` } : { ...extra };
  }

  return { leer, guardar, borrar, cabeceras };
})();
