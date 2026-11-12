const formCobertura = document.getElementById("form-cobertura");
const inputCP = document.getElementById("input-cp");
const resultadoCP = document.getElementById("resultado-cp");

formCobertura.addEventListener("submit", async (evento) => {
  evento.preventDefault(); // evita que la página se recargue

  const cp = inputCP.value.trim();
  resultadoCP.textContent = "Consultando…";

  try {
    // Le preguntamos al backend
    const respuesta = await fetch(`${API_BASE}/api/cobertura/${encodeURIComponent(cp)}`);
    const resultado = await respuesta.json();

    // Si el CP estaba mal escrito, el backend manda error
    if (!respuesta.ok) {
      resultadoCP.textContent = "⚠️ " + resultado.error;
      return;
    }

    const zona = resultado.data;
    if (zona.cubierto) {
      resultadoCP.textContent =
        `✅ ¡Sí llegamos a ${zona.ciudad}! Envío: $${zona.costo_envio} MXN, ` +
        `aprox. ${zona.tiempo_estimado_min} minutos. (Gratis en compras desde $500)`;
    } else {
      resultadoCP.textContent = "😔 Por ahora no llegamos a ese código postal.";
    }
  } catch (error) {
    resultadoCP.textContent = "⚠️ No se pudo conectar con el servidor.";
  }
});