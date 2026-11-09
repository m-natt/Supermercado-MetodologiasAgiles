const API_BASE = "http://localhost:8000";

const grid = document.getElementById("product-grid");
const statusBox = document.getElementById("catalog-status");
const countLabel = document.getElementById("product-count");
const dialog = document.getElementById("product-dialog");
const dialogContent = document.getElementById("dialog-content");
const categoryList = document.getElementById("category-list");
const brandSelect = document.getElementById("filter-brand");
const minInput = document.getElementById("filter-min");
const maxInput = document.getElementById("filter-max");
const clearButton = document.getElementById("filter-clear");
const filtersForm = document.getElementById("filters");
const filterError = document.getElementById("filter-error");

// Filtros activos. Un valor vacío ("") significa "sin filtro".
const filters = { categoria: "", marca: "", min: "", max: "" };
let requestId = 0; // evita que una respuesta lenta pise a una más reciente

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

function hasActiveFilters() {
  return Object.values(filters).some(value => value !== "");
}

function buildQuery() {
  const params = new URLSearchParams();
  if (filters.categoria !== "") params.set("id_categoria", filters.categoria);
  if (filters.marca !== "") params.set("id_marca", filters.marca);
  if (filters.min !== "") params.set("precio_min", filters.min);
  if (filters.max !== "") params.set("precio_max", filters.max);
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function loadCatalog() {
  const thisRequest = ++requestId;
  showStatus("Cargando catálogo…");
  countLabel.textContent = "Consultando…";
  try {
    const response = await fetch(`${API_BASE}/api/productos${buildQuery()}`);
    if (!response.ok) throw new Error(`El servidor respondió con estado ${response.status}.`);
    const result = await response.json();
    if (thisRequest !== requestId) return; // llegó una petición más nueva, ignorar esta
    if (result.ok !== true || !Array.isArray(result.data)) {
      throw new Error("La respuesta del servidor no tiene el formato esperado.");
    }

    const products = result.data;
    grid.replaceChildren();
    statusBox.hidden = true;
    countLabel.textContent = `${products.length} ${products.length === 1 ? "producto" : "productos"}`;

    if (products.length === 0) {
      showStatus(
        hasActiveFilters()
          ? "No encontramos productos con esos filtros. Prueba cambiándolos o limpiándolos."
          : "Todavía no hay productos para mostrar.",
        "empty"
      );
      return;
    }
    products.forEach(product => grid.append(productCard(product)));
  } catch (error) {
    if (thisRequest !== requestId) return;
    grid.replaceChildren();
    countLabel.textContent = "Catálogo no disponible";
    showStatus(
      `No pudimos cargar los productos. ${error.message} Verifica que el backend esté encendido y que API_BASE sea correcto.`,
      "error"
    );
  }
}

/* ===== Categorías (inciso 11) ===== */
const CATEGORY_ICONS = [
  ["fruta", "🍎"], ["verdura", "🥬"], ["lacteo", "🥛"], ["carne", "🥩"], ["pollo", "🍗"],
  ["pescado", "🐟"], ["marisco", "🦐"], ["panaderia", "🥖"], ["pan", "🍞"], ["bebida", "🥤"],
  ["jugo", "🧃"], ["botana", "🍿"], ["snack", "🍿"], ["dulce", "🍬"], ["galleta", "🍪"],
  ["limpieza", "🧴"], ["higiene", "🧼"], ["congelado", "🧊"], ["cereal", "🥣"],
  ["mascota", "🐾"], ["huevo", "🥚"], ["cerveza", "🍺"], ["licor", "🍷"], ["abarrote", "🧺"],
];

function categoryIcon(name) {
  const clean = (name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const match = CATEGORY_ICONS.find(([word]) => clean.includes(word));
  return match ? match[1] : "🛒";
}

function markSelectedCategory() {
  categoryList.querySelectorAll(".category-chip").forEach(chip => {
    chip.setAttribute("aria-pressed", String(chip.dataset.id === filters.categoria));
  });
}

function categoryChip(id, label) {
  const chip = makeText("button", "category-chip", label);
  chip.type = "button";
  chip.dataset.id = String(id);
  chip.setAttribute("aria-pressed", String(String(id) === filters.categoria));
  chip.addEventListener("click", () => {
    if (filters.categoria === String(id)) return; // ya está seleccionada
    filters.categoria = String(id);
    markSelectedCategory();
    loadCatalog();
  });
  return chip;
}

async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE}/api/categorias`);
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.ok !== true || !Array.isArray(result.data)) throw new Error();
    categoryList.replaceChildren(categoryChip("", "🛒 Todas"));
    result.data.forEach(cat => {
      categoryList.append(categoryChip(cat.id_categoria, `${categoryIcon(cat.nombre)} ${cat.nombre}`));
    });
  } catch (error) {
    // Si falla, el catálogo sigue funcionando con el botón "Todas"
  }
}

/* ===== Filtros por marca y precio (inciso 10) ===== */
async function loadBrands() {
  try {
    const response = await fetch(`${API_BASE}/api/marcas`);
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.ok !== true || !Array.isArray(result.data)) throw new Error();
    result.data.forEach(marca => {
      const option = document.createElement("option");
      option.value = String(marca.id_marca);
      option.textContent = marca.nombre;
      brandSelect.append(option);
    });
  } catch (error) {
    // Si falla, el select solo muestra "Todas las marcas"
  }
}

function showFilterError(message) {
  filterError.textContent = message;
  filterError.hidden = !message;
}

// Valida los precios; devuelve true si se puede consultar
function applyPriceFilters() {
  const min = minInput.value.trim();
  const max = maxInput.value.trim();
  const minNumber = Number(min);
  const maxNumber = Number(max);

  if ((min !== "" && (!Number.isFinite(minNumber) || minNumber < 0)) ||
      (max !== "" && (!Number.isFinite(maxNumber) || maxNumber < 0))) {
    showFilterError("Los precios deben ser números mayores o iguales a 0.");
    return false;
  }
  if (min !== "" && max !== "" && minNumber > maxNumber) {
    showFilterError("El precio mínimo no puede ser mayor que el máximo.");
    return false;
  }
  showFilterError("");
  filters.min = min;
  filters.max = max;
  return true;
}

let priceTimer;
function onPriceChange() {
  clearTimeout(priceTimer);
  // Espera un momento después de teclear para no consultar en cada tecla
  priceTimer = setTimeout(() => {
    if (applyPriceFilters()) loadCatalog();
  }, 400);
}

brandSelect.addEventListener("change", () => {
  filters.marca = brandSelect.value;
  loadCatalog();
});
minInput.addEventListener("input", onPriceChange);
maxInput.addEventListener("input", onPriceChange);
filtersForm.addEventListener("submit", event => event.preventDefault());

clearButton.addEventListener("click", () => {
  clearTimeout(priceTimer);
  filters.categoria = filters.marca = filters.min = filters.max = "";
  brandSelect.value = "";
  minInput.value = "";
  maxInput.value = "";
  showFilterError("");
  markSelectedCategory();
  loadCatalog();
});

loadCategories();
loadBrands();
loadCatalog();
