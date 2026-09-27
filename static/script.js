/*
 * script.js
 *
 * Vanilla JS frontend for the Inventory Management Dashboard.
 *
 * - READ: every section (Overview, All Products, Low Stock, Out of Stock,
 *   In Stock) is populated by calling a Flask REST endpoint with fetch()
 *   and rendering the JSON response into the DOM.
 * - WRITE: Add Product (POST), Edit Product (PUT), and Delete Product
 *   (DELETE) all go through the same /api/products endpoints.
 * - SORT: every table (all four product sections) has its own sort
 *   dropdown covering every column, ascending and descending. Sorting
 *   runs entirely client-side against the data already fetched.
 * - SEARCH: only on All Products, also client-side.
 *
 * Nothing here is hardcoded product data - it all comes from the API.
 */

// One config entry per product-list section: where its data comes from,
// which DOM elements belong to it, and what to show when it's empty.
const SECTION_CONFIG = {
    "all-products": {
        endpoint: "/api/products",
        tableId: "all-products-table",
        sortId: "all-products-sort",
        searchId: "search-input",
        emptyMessage: "No products found.",
    },
    "low-stock": {
        endpoint: "/api/products/low-stock",
        tableId: "low-stock-table",
        sortId: "low-stock-sort",
        searchId: null,
        emptyMessage: "No low-stock products found.",
    },
    "out-of-stock": {
        endpoint: "/api/products/out-of-stock",
        tableId: "out-of-stock-table",
        sortId: "out-of-stock-sort",
        searchId: null,
        emptyMessage: "No products are currently out of stock.",
    },
    "in-stock": {
        endpoint: "/api/products/in-stock",
        tableId: "in-stock-table",
        sortId: "in-stock-sort",
        searchId: null,
        emptyMessage: "No in-stock products found.",
    },
};

// Last API response for each section, kept so search/sort can run
// client-side without re-fetching.
const sectionCache = {
    "all-products": [],
    "low-stock": [],
    "out-of-stock": [],
    "in-stock": [],
};

// Lookup of every product seen so far, keyed by id, across whichever
// sections have been loaded. Used to pre-fill the edit form without an
// extra API call.
let productById = {};

// Which sidebar section is currently visible - used to know what to
// refresh after a create/update/delete.
let currentSection = "overview";

const TABLE_COLUMNS = [
    "Product", "Category", "Date Added", "Price", "Quantity", "Supplier",
    "Status", "Actions",
];

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------

function setupNavigation() {
    const buttons = document.querySelectorAll(".nav-btn");

    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            buttons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            const sectionId = btn.dataset.section;
            currentSection = sectionId;
            showSection(sectionId);
            loadSection(sectionId);
        });
    });
}

function showSection(sectionId) {
    document.querySelectorAll(".view").forEach((view) => {
        view.classList.toggle("active", view.id === sectionId);
    });
}

function loadSection(sectionId) {
    if (sectionId === "overview") {
        fetchSummary();
    } else {
        fetchSection(sectionId);
    }
}

function refreshCurrentSection() {
    loadSection(currentSection);
    // Summary counts (total/low/out/in) can change after any write, so
    // keep Overview's numbers correct even if the user isn't looking at
    // it right now - cheap to refetch and avoids stale counts later.
    if (currentSection !== "overview") {
        fetchSummary();
    }
}

// ---------------------------------------------------------------------
// Loading / error / empty state helpers
// ---------------------------------------------------------------------

function showLoading(containerEl, message = "Loading inventory data...") {
    containerEl.innerHTML = `<div class="state-message">${message}</div>`;
}

function showError(containerEl, message) {
    containerEl.innerHTML = `
        <div class="state-message error">
            Unable to load inventory data.<br>
            Please make sure the Flask server and PostgreSQL database are running.
            <br><small>${escapeHtml(message)}</small>
        </div>`;
}

function showEmpty(containerEl, message) {
    containerEl.innerHTML = `<div class="state-message">${message}</div>`;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

// ---------------------------------------------------------------------
// Fetch functions (READ)
// ---------------------------------------------------------------------

async function fetchSummary() {
    const cardsEl = document.getElementById("summary-cards");
    const barEl = document.getElementById("breakdown-bar");
    const legendEl = document.getElementById("breakdown-legend");

    showLoading(cardsEl, "Loading summary...");
    barEl.innerHTML = "";
    legendEl.innerHTML = "";

    try {
        const response = await fetch("/api/products/summary");
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const data = await response.json();
        renderSummary(data);
    } catch (error) {
        showError(cardsEl, error.message);
    }
}

async function fetchSection(sectionId) {
    const config = SECTION_CONFIG[sectionId];
    const containerEl = document.getElementById(config.tableId);
    showLoading(containerEl);

    try {
        const response = await fetch(config.endpoint);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const data = await response.json();
        sectionCache[sectionId] = data;
        cacheProducts(data);
        applySectionView(sectionId);
    } catch (error) {
        showError(containerEl, error.message);
    }
}

function cacheProducts(products) {
    products.forEach((p) => {
        productById[p.id] = p;
    });
}

async function createProduct(payload) {
    const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || `Server responded with ${response.status}`);
    }
    return data;
}

async function updateProduct(id, payload) {
    const response = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || `Server responded with ${response.status}`);
    }
    return data;
}

async function deleteProductById(id) {
    const response = await fetch(`/api/products/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || `Server responded with ${response.status}`);
    }
    return data;
}

async function handleDeleteClick(id) {
    const product = productById[id];
    const label = product ? product.name : `product #${id}`;

    const confirmed = window.confirm(`Delete "${label}"? This cannot be undone.`);
    if (!confirmed) {
        return;
    }

    try {
        await deleteProductById(id);
        delete productById[id];
        refreshCurrentSection();
    } catch (error) {
        window.alert(`Could not delete product: ${error.message}`);
    }
}

// ---------------------------------------------------------------------
// Render functions
// ---------------------------------------------------------------------

function renderSummary(summary) {
    const cardsEl = document.getElementById("summary-cards");
    const barEl = document.getElementById("breakdown-bar");
    const legendEl = document.getElementById("breakdown-legend");

    const total = Number(summary.total_products) || 0;
    const totalQty = Number(summary.total_quantity) || 0;
    const inStock = Number(summary.in_stock) || 0;
    const lowStock = Number(summary.low_stock) || 0;
    const outOfStock = Number(summary.out_of_stock) || 0;

    cardsEl.innerHTML = `
        <div class="summary-card">
            <div class="card-label">Total Products</div>
            <div class="card-value">${total}</div>
        </div>
        <div class="summary-card">
            <div class="card-label">Total Inventory</div>
            <div class="card-value">${totalQty}</div>
        </div>
        <div class="summary-card low-stock">
            <div class="card-label">Low Stock</div>
            <div class="card-value">${lowStock}</div>
        </div>
        <div class="summary-card out-of-stock">
            <div class="card-label">Out of Stock</div>
            <div class="card-value">${outOfStock}</div>
        </div>
        <div class="summary-card in-stock">
            <div class="card-label">In Stock</div>
            <div class="card-value">${inStock}</div>
        </div>
    `;

    // Visual breakdown bar (no chart library, just proportional widths)
    const safeTotal = total > 0 ? total : 1;
    const inPct = (inStock / safeTotal) * 100;
    const lowPct = (lowStock / safeTotal) * 100;
    const outPct = (outOfStock / safeTotal) * 100;

    barEl.innerHTML = `
        <div class="segment in-stock" style="width:${inPct}%"></div>
        <div class="segment low-stock" style="width:${lowPct}%"></div>
        <div class="segment out-of-stock" style="width:${outPct}%"></div>
    `;

    legendEl.innerHTML = `
        <div class="legend-item"><span class="legend-dot in-stock"></span>In Stock (${inStock})</div>
        <div class="legend-item"><span class="legend-dot low-stock"></span>Low Stock (${lowStock})</div>
        <div class="legend-item"><span class="legend-dot out-of-stock"></span>Out of Stock (${outOfStock})</div>
    `;
}

function formatPrice(value) {
    const num = Number(value) || 0;
    return num.toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    });
}

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function statusToClass(status) {
    if (status === "Low Stock") return "low-stock";
    if (status === "Out of Stock") return "out-of-stock";
    return "in-stock";
}

function renderProducts(products, containerEl, emptyMessage) {
    if (!products || products.length === 0) {
        showEmpty(containerEl, emptyMessage);
        return;
    }

    const rows = products.map((p) => {
        const statusClass = statusToClass(p.status);
        return `
            <tr class="row-${statusClass}">
                <td>${escapeHtml(p.name)}</td>
                <td>${escapeHtml(p.category)}</td>
                <td>${formatDate(p.created_at)}</td>
                <td>${formatPrice(p.price)}</td>
                <td>${escapeHtml(p.quantity)}</td>
                <td>${escapeHtml(p.supplier)}</td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(p.status)}</span></td>
                <td class="actions-cell">
                    <button class="btn-icon edit-btn" data-id="${p.id}" title="Edit">Edit</button>
                    <button class="btn-icon delete-btn" data-id="${p.id}" title="Delete">Delete</button>
                </td>
            </tr>`;
    }).join("");

    containerEl.innerHTML = `
        <table>
            <thead>
                <tr>${TABLE_COLUMNS.map((c) => `<th>${c}</th>`).join("")}</tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    containerEl.querySelectorAll(".edit-btn").forEach((btn) => {
        btn.addEventListener("click", () => openEditModal(Number(btn.dataset.id)));
    });
    containerEl.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", () => handleDeleteClick(Number(btn.dataset.id)));
    });
}

// ---------------------------------------------------------------------
// Search + sort (client-side, per section)
// ---------------------------------------------------------------------

function applySectionView(sectionId) {
    const config = SECTION_CONFIG[sectionId];
    const containerEl = document.getElementById(config.tableId);

    let list = sectionCache[sectionId] || [];

    if (config.searchId) {
        const searchTerm = document.getElementById(config.searchId).value.trim().toLowerCase();
        if (searchTerm) {
            list = list.filter((p) =>
                p.name.toLowerCase().includes(searchTerm) ||
                p.category.toLowerCase().includes(searchTerm) ||
                p.supplier.toLowerCase().includes(searchTerm)
            );
        }
    }

    const sortValue = document.getElementById(config.sortId).value;
    const sorted = sortProducts(list, sortValue);

    renderProducts(sorted, containerEl, config.emptyMessage);
}

// Comparator for each sortable attribute. Every table column can be
// sorted ascending or descending using these same seven comparators.
const SORT_COMPARATORS = {
    name: (a, b) => a.name.localeCompare(b.name),
    category: (a, b) => a.category.localeCompare(b.category),
    price: (a, b) => Number(a.price) - Number(b.price),
    quantity: (a, b) => Number(a.quantity) - Number(b.quantity),
    supplier: (a, b) => a.supplier.localeCompare(b.supplier),
    status: (a, b) => a.status.localeCompare(b.status),
    date: (a, b) => new Date(a.created_at) - new Date(b.created_at),
};

function sortProducts(products, sortValue) {
    if (!sortValue || sortValue === "default") {
        return [...products];
    }

    const [field, direction] = sortValue.split("-");
    const compare = SORT_COMPARATORS[field];
    if (!compare) {
        return [...products];
    }

    const sorted = [...products].sort(compare);
    if (direction === "desc") {
        sorted.reverse();
    }
    return sorted;
}

function setupSortAndSearch() {
    document.querySelectorAll(".sort-select").forEach((select) => {
        select.addEventListener("change", () => applySectionView(select.dataset.section));
    });

    const searchInput = document.getElementById("search-input");
    searchInput.addEventListener("input", () => applySectionView("all-products"));
}

// ---------------------------------------------------------------------
// Add / Edit modal
// ---------------------------------------------------------------------

function getModalElements() {
    return {
        overlay: document.getElementById("product-modal"),
        title: document.getElementById("modal-title"),
        form: document.getElementById("product-form"),
        idField: document.getElementById("product-id"),
        nameField: document.getElementById("product-name"),
        categoryField: document.getElementById("product-category"),
        priceField: document.getElementById("product-price"),
        quantityField: document.getElementById("product-quantity"),
        supplierField: document.getElementById("product-supplier"),
        dateField: document.getElementById("product-date"),
        errorEl: document.getElementById("modal-error"),
    };
}

function todayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function openAddModal() {
    const el = getModalElements();
    el.title.textContent = "Add Product";
    el.idField.value = "";
    el.nameField.value = "";
    el.categoryField.value = "";
    el.priceField.value = "";
    el.quantityField.value = "";
    el.supplierField.value = "";
    el.dateField.value = todayDateString();
    hideModalError();
    el.overlay.classList.remove("hidden");
    el.nameField.focus();
}

function openEditModal(id) {
    const product = productById[id];
    if (!product) {
        window.alert("Could not find that product's details. Try refreshing the section.");
        return;
    }

    const el = getModalElements();
    el.title.textContent = "Edit Product";
    el.idField.value = product.id;
    el.nameField.value = product.name;
    el.categoryField.value = product.category;
    el.priceField.value = product.price;
    el.quantityField.value = product.quantity;
    el.supplierField.value = product.supplier;
    el.dateField.value = product.created_at ? String(product.created_at).slice(0, 10) : todayDateString();
    hideModalError();
    el.overlay.classList.remove("hidden");
    el.nameField.focus();
}

function closeModal() {
    const el = getModalElements();
    el.overlay.classList.add("hidden");
    hideModalError();
}

function showModalError(message) {
    const el = getModalElements();
    el.errorEl.textContent = message;
    el.errorEl.classList.remove("hidden");
}

function hideModalError() {
    const el = getModalElements();
    el.errorEl.textContent = "";
    el.errorEl.classList.add("hidden");
}

async function handleProductFormSubmit(event) {
    event.preventDefault();
    hideModalError();

    const el = getModalElements();
    const id = el.idField.value;

    const payload = {
        name: el.nameField.value.trim(),
        category: el.categoryField.value.trim(),
        price: el.priceField.value,
        quantity: el.quantityField.value,
        supplier: el.supplierField.value.trim(),
        created_at: el.dateField.value,
    };

    const saveBtn = document.getElementById("modal-save-btn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
        if (id) {
            const updated = await updateProduct(id, payload);
            productById[updated.id] = updated;
        } else {
            const created = await createProduct(payload);
            productById[created.id] = created;
        }
        closeModal();
        refreshCurrentSection();
    } catch (error) {
        showModalError(error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
    }
}

function setupModal() {
    document.getElementById("add-product-btn").addEventListener("click", openAddModal);
    document.getElementById("modal-cancel-btn").addEventListener("click", closeModal);
    document.getElementById("product-form").addEventListener("submit", handleProductFormSubmit);

    // Clicking the dimmed backdrop (outside the modal box) also closes it.
    document.getElementById("product-modal").addEventListener("click", (event) => {
        if (event.target.id === "product-modal") {
            closeModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeModal();
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();
    setupSortAndSearch();
    setupModal();
    fetchSummary(); // Overview is shown by default
});
