// Configuración compartida por todas las páginas. Cárgalo antes que los demás scripts.
const API_BASE = "http://localhost:8000";

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Precio no disponible";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);
}

function makeText(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value ?? "";
  return element;
}

document.addEventListener("DOMContentLoaded", () => {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
});
