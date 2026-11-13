// Página "Mis tarjetas" (tarjetas.html). Tarjetas y TarjetaUtil vienen de js/tarjetas.js
const $ = id => document.getElementById(id);

function pintar() {
  const sesion = Sesion.leer();
  $("owner").textContent = sesion
    ? `Tarjetas de ${sesion.cliente.nombre} (${sesion.cliente.correo}), guardadas en este navegador.`
    : "No has iniciado sesión: estas tarjetas quedan como invitado en este navegador.";

  const lista = Tarjetas.leer();
  $("empty").hidden = lista.length > 0;
  $("cards").replaceChildren(...lista.map(t => {
    const box = document.createElement("div");
    const acciones = document.createElement("div");
    acciones.className = "tcard__acts";
    if (!t.predeterminada) {
      const pred = makeText("button", "secondary-button", "Hacer predeterminada");
      pred.type = "button";
      pred.addEventListener("click", () => { Tarjetas.hacerPredeterminada(t.id); pintar(); });
      acciones.append(pred);
    }
    const borrar = makeText("button", "secondary-button", "Eliminar");
    borrar.type = "button";
    borrar.setAttribute("aria-label", `Eliminar tarjeta terminada en ${t.ultimos4}`);
    borrar.addEventListener("click", () => {
      if (confirm("¿Eliminar esta tarjeta?")) { Tarjetas.quitar(t.id); pintar(); }
    });
    acciones.append(borrar);
    box.append(dibujarTarjeta(t), acciones);
    return box;
  }));
}

function mostrarError(texto) {
  $("error").textContent = texto;
  $("error").hidden = !texto;
  if (texto) $("okmsg").hidden = true;
}

$("number").addEventListener("input", e => { e.target.value = TarjetaUtil.formatearNumero(e.target.value); });
$("expiry").addEventListener("input", e => { e.target.value = TarjetaUtil.formatearVence(e.target.value); });

$("form").addEventListener("submit", e => {
  e.preventDefault();
  const tarjeta = { titular: $("name").value, numero: $("number").value, vence: $("expiry").value };
  const error = TarjetaUtil.validar(tarjeta);
  if (error) return mostrarError(error);

  const resultado = Tarjetas.agregar(tarjeta, $("def").checked);
  if (resultado === "duplicada") return mostrarError("Esa tarjeta ya está guardada.");
  if (resultado === "error") return mostrarError("No pudimos guardar la tarjeta (¿navegación privada?).");

  mostrarError("");
  $("form").reset(); // el número completo se borra del formulario
  $("okmsg").textContent = "✓ Tarjeta guardada.";
  $("okmsg").hidden = false;
  pintar();
});

pintar();
