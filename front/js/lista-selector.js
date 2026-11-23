// Ventana "Agregar a lista" que se abre desde el catálogo.
// API_BASE y makeText() vienen de js/config.js; Sesion de js/sesion.js
const ListaSelector = (() => {
  const NUEVA = "nueva";
  let dialogo, cuerpo, producto;

  async function pedir(ruta, metodo = "GET", datos) {
    let respuesta;
    try {
      respuesta = await fetch(`${API_BASE}${ruta}`, {
        method: metodo,
        headers: Sesion.cabeceras(datos ? { "Content-Type": "application/json" } : {}),
        body: datos ? JSON.stringify(datos) : undefined,
      });
    } catch {
      throw new Error("No hay conexión con el servidor.");
    }
    let json = null;
    try { json = await respuesta.json(); } catch { /* la respuesta no era JSON */ }
    if (respuesta.status === 401) {
      Sesion.borrar();
      const error = new Error("Tu sesión expiró.");
      error.sinSesion = true;
      throw error;
    }
    if (!respuesta.ok || !json || json.ok !== true) {
      throw new Error((json && json.error) || `El servidor respondió con estado ${respuesta.status}.`);
    }
    return json.data;
  }

  function crearDialogo() {
    dialogo = document.createElement("dialog");
    dialogo.className = "product-dialog list-picker";
    dialogo.setAttribute("aria-labelledby", "list-picker-title");
    const cerrar = makeText("button", "dialog-close", "×");
    cerrar.type = "button";
    cerrar.setAttribute("aria-label", "Cerrar");
    cerrar.addEventListener("click", () => dialogo.close());
    cuerpo = document.createElement("div");
    dialogo.append(cerrar, cuerpo);
    document.body.append(dialogo);
  }

  function enlace(texto, href, clase = "primary-button") {
    const a = makeText("a", clase, texto);
    a.href = href;
    return a;
  }

  function titulo() {
    const h3 = makeText("h3", "dialog-title", "Agregar a una lista");
    h3.id = "list-picker-title";
    return [h3, makeText("p", "list-picker__product", producto.nombre || "Producto")];
  }

  function pintarSinSesion() {
    cuerpo.replaceChildren(
      ...titulo(),
      makeText("p", "list-picker__text", "Inicia sesión para guardar productos en tus listas de compras."),
      enlace("Iniciar sesión", "usuarios.html")
    );
  }

  function pintarListo(lista) {
    const ver = enlace("Ver mi lista", `listas.html?lista=${encodeURIComponent(lista.id_lista)}`);
    const seguir = makeText("button", "secondary-button", "Seguir comprando");
    seguir.type = "button";
    seguir.addEventListener("click", () => dialogo.close());
    const acciones = document.createElement("div");
    acciones.className = "list-picker__actions";
    acciones.append(ver, seguir);
    cuerpo.replaceChildren(
      ...titulo(),
      makeText("p", "list-picker__ok", `✓ Agregado a «${lista.nombre}»`),
      acciones
    );
    seguir.focus();
  }

  function campo(etiqueta, control) {
    const label = document.createElement("label");
    label.className = "field";
    label.append(makeText("span", "", etiqueta), control);
    return label;
  }

  function pintarFormulario(listas) {
    const select = document.createElement("select");
    listas.forEach(l => {
      const opcion = makeText("option", "", l.nombre);
      opcion.value = String(l.id_lista);
      select.append(opcion);
    });
    const crear = makeText("option", "", "＋ Crear lista nueva");
    crear.value = NUEVA;
    select.append(crear);

    const nombre = document.createElement("input");
    nombre.maxLength = 80;
    nombre.placeholder = "Ej. Despensa de la semana";
    nombre.value = listas.length ? "" : "Despensa de la semana";
    const campoNombre = campo("Nombre de la lista", nombre);

    const cantidad = document.createElement("input");
    cantidad.type = "number";
    cantidad.min = "1";
    cantidad.max = "999";
    cantidad.step = "1";
    cantidad.value = "1";

    const error = makeText("p", "form-error", "");
    error.setAttribute("role", "alert");
    error.hidden = true;

    const guardar = makeText("button", "primary-button", "Guardar en la lista");
    guardar.type = "submit";

    const actualizarNombre = () => { campoNombre.hidden = select.value !== NUEVA; };
    select.addEventListener("change", () => {
      actualizarNombre();
      if (select.value === NUEVA) nombre.focus();
    });
    actualizarNombre();

    const form = document.createElement("form");
    form.className = "list-picker__form";
    form.noValidate = true;
    form.append(campo("Lista", select), campoNombre, campo("Cantidad", cantidad), error, guardar);

    let idCreada = null; // si falla agregar el producto, no se crea otra lista al reintentar
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const piezas = Number(cantidad.value);
      const texto = nombre.value.trim();
      error.hidden = true;
      if (!Number.isInteger(piezas) || piezas < 1 || piezas > 999) {
        error.textContent = "La cantidad debe ser un número entero entre 1 y 999.";
        error.hidden = false;
        return;
      }
      if (select.value === NUEVA && !idCreada && !texto) {
        error.textContent = "Escribe un nombre para la lista.";
        error.hidden = false;
        nombre.focus();
        return;
      }
      guardar.disabled = true;
      try {
        let idLista = select.value === NUEVA ? idCreada : Number(select.value);
        if (!idLista) {
          idCreada = (await pedir("/api/listas", "POST", { nombre: texto })).id_lista;
          idLista = idCreada;
        }
        const lista = await pedir(`/api/listas/${idLista}/items`, "POST", {
          id_producto: Number(producto.id_producto),
          cantidad: piezas,
        });
        pintarListo(lista);
      } catch (fallo) {
        if (fallo.sinSesion) { pintarSinSesion(); return; }
        error.textContent = fallo.message;
        error.hidden = false;
        guardar.disabled = false;
      }
    });

    cuerpo.replaceChildren(...titulo(), form);
  }

  async function abrir(productoElegido) {
    if (!dialogo) crearDialogo();
    producto = productoElegido;
    if (!Sesion.leer()) {
      pintarSinSesion();
      dialogo.showModal();
      return;
    }
    cuerpo.replaceChildren(...titulo(), makeText("p", "list-picker__text", "Cargando tus listas…"));
    dialogo.showModal();
    const elegido = producto;
    try {
      const listas = await pedir("/api/listas");
      if (elegido === producto) pintarFormulario(listas);
    } catch (fallo) {
      if (elegido !== producto) return;
      if (fallo.sinSesion) { pintarSinSesion(); return; }
      cuerpo.replaceChildren(...titulo(), makeText("p", "form-error", `No pudimos cargar tus listas. ${fallo.message}`));
    }
  }

  return { abrir };
})();
