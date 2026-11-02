/*
 * E6-8 - Vista del catálogo
 * Consume el endpoint existente GET /api/productos del backend FastAPI.
 * Si el backend corre en otra dirección, cambia API_BASE.
 */
const API_BASE = "http://localhost:8000";

const grid = document.getElementById("product-grid");
const statusBox = document.getElementById("catalog-status");
const countLabel = document.getElementById("product-count");
const dialog = document.getElementById("product-dialog");
const dialogContent = document.getElementById("dialog-content");

document.getElementById("year").textContent = new Date().getFullYear();
document.getElementById("dialog-close").addEventListener("click", () => dialog.close());

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Precio no disponible";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);
}

function showStatus(message, type = "loading") {
  statusBox.className = `status ${type === "error" ? "error" : ""}`;
  statusBox.replaceChildren();
  if (type === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    statusBox.append(spinner);
  } else if (type === "empty") {
    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.textContent = "🧺";
    statusBox.append(icon);
  }
  const text = document.createElement("span");
  text.textContent = message;
  statusBox.append(text);
  statusBox.hidden = false;
}

function makeText(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value ?? "";
  return element;
}

function openDetails(product) {
  dialogContent.replaceChildren();
  const image = document.createElement("img");
  image.className = "dialog-image";
  image.alt = product.nombre || "Producto";
  image.src = product.imagen_url || "";
  image.hidden = !product.imagen_url;
  image.onerror = () => { image.hidden = true; };
  dialogContent.append(image);
  dialogContent.append(makeText("p", "product-category", product.categoria || "Producto"));
  dialogContent.append(makeText("h3", "dialog-title", product.nombre || "Producto sin nombre"));
  dialogContent.append(makeText("p", "dialog-description", product.descripcion || "No hay descripción disponible."));
  dialogContent.append(makeText("p", "price", money(product.precio)));
  dialogContent.append(makeText("p", "unit", `Unidad: ${product.unidad || "No especificada"}`));
  dialogContent.append(makeText("p", "stock", Number(product.stock) > 0 ? `Disponible · ${product.stock} en existencia` : "Agotado"));
  dialog.showModal();
}

function productCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";

  const imageWrap = document.createElement("div");
  imageWrap.className = "product-image-wrap";
  if (product.imagen_url) {
    const image = document.createElement("img");
    image.className = "product-image";
    image.src = product.imagen_url;
    image.alt = product.nombre || "Producto";
    image.loading = "lazy";
    image.onerror = () => {
      image.remove();
      imageWrap.append(makeText("span", "image-placeholder", "🛍️"));
    };
    imageWrap.append(image);
  } else {
    imageWrap.append(makeText("span", "image-placeholder", "🛍️"));
  }

  const info = document.createElement("div");
  info.className = "product-info";
  info.append(makeText("span", "product-category", product.categoria || "Supermercado"));
  info.append(makeText("h3", "product-name", product.nombre || "Producto sin nombre"));
  info.append(makeText("p", "product-description", product.descripcion || "Producto disponible en nuestro catálogo."));

  const bottom = document.createElement("div");
  bottom.className = "product-bottom";
  bottom.append(makeText("span", "price", money(product.precio)));
  bottom.append(makeText("span", "unit", `/ ${product.unidad || "unidad"}`));
  info.append(bottom);

  const available = Number(product.stock) > 0;
  const stock = makeText("span", `stock${available ? "" : " out"}`, available ? `Disponible · ${product.stock}` : "Agotado");
  info.append(stock);

  const button = makeText("button", "detail-button", "Ver detalles");
  button.type = "button";
  button.addEventListener("click", () => openDetails(product));
  info.append(button);

  card.append(imageWrap, info);
  return card;
}

async function loadCatalog() {
  showStatus("Cargando catálogo…");
  countLabel.textContent = "Consultando…";
  try {
    const response = await fetch(`${API_BASE}/api/productos`);
    if (!response.ok) throw new Error(`El servidor respondió con estado ${response.status}.`);
    const result = await response.json();
    if (result.ok !== true || !Array.isArray(result.data)) {
      throw new Error("La respuesta del servidor no tiene el formato esperado.");
    }

    const products = result.data;
    grid.replaceChildren();
    statusBox.hidden = true;
    countLabel.textContent = `${products.length} ${products.length === 1 ? "producto" : "productos"}`;

    if (products.length === 0) {
      showStatus("Todavía no hay productos para mostrar.", "empty");
      return;
    }
    products.forEach(product => grid.append(productCard(product)));
  } catch (error) {
    grid.replaceChildren();
    countLabel.textContent = "Catálogo no disponible";
    showStatus(
      `No pudimos cargar los productos. ${error.message} Verifica que el backend esté encendido y que API_BASE sea correcto.`,
      "error"
    );
  }
}

loadCatalog();
