/* =========================================
   CAMPUS LOST & FOUND
   Application Logic
========================================= */

"use strict";


/* =========================================
   CONFIGURATION AND STATE
========================================= */

const STORAGE_KEY = "campusLostFoundItems";
const THEME_KEY = "campusLostFoundTheme";

const CATEGORY_ICONS = {
    Electronics: "⌘",
    Accessories: "✦",
    Documents: "▤",
    Bags: "▰",
    Clothing: "◇",
    Keys: "⚿",
    Other: "▦"
};

const VIEW_TITLES = {
    all: "All Items",
    lost: "Lost Items",
    found: "Found Items",
    resolved: "Resolved"
};

const VIEW_SUBTITLES = {
    all: "Browse the latest reports from your campus.",
    lost: "Find reports from people searching for their belongings.",
    found: "Explore items reported by helpful students.",
    resolved: "Review reports that have been marked as resolved."
};

let items = loadItems();

let currentView = "all";
let currentCategory = "all";
let editingItemId = null;
let activeDetailsId = null;
let toastTimeouts = new Set();


/* =========================================
   DOM REFERENCES
========================================= */

const elements = {
    itemsGrid: document.getElementById("itemsGrid"),
    emptyState: document.getElementById("emptyState"),
    emptyTitle: document.getElementById("emptyTitle"),
    emptyDescription: document.getElementById("emptyDescription"),

    totalReports: document.getElementById("totalReports"),
    lostReports: document.getElementById("lostReports"),
    foundReports: document.getElementById("foundReports"),
    resolvedReports: document.getElementById("resolvedReports"),
    sidebarTotal: document.getElementById("sidebarTotal"),

    searchInput: document.getElementById("searchInput"),
    categoryFilter: document.getElementById("categoryFilter"),
    sortFilter: document.getElementById("sortFilter"),

    sectionTitle: document.getElementById("sectionTitle"),
    sectionSubtitle: document.getElementById("sectionSubtitle"),
    resultsCount: document.getElementById("resultsCount"),
    breadcrumbTitle: document.getElementById("breadcrumbTitle"),

    reportModal: document.getElementById("reportModal"),
    reportForm: document.getElementById("reportForm"),
    modalTitle: document.getElementById("modalTitle"),
    submitButtonText: document.getElementById("submitButtonText"),
    editItemId: document.getElementById("editItemId"),

    itemName: document.getElementById("itemName"),
    itemCategory: document.getElementById("itemCategory"),
    itemDescription: document.getElementById("itemDescription"),
    itemLocation: document.getElementById("itemLocation"),
    itemDate: document.getElementById("itemDate"),
    itemImage: document.getElementById("itemImage"),
    contactInfo: document.getElementById("contactInfo"),
    dateLabel: document.getElementById("dateLabel"),

    detailsModal: document.getElementById("detailsModal"),
    detailsTitle: document.getElementById("detailsTitle"),
    detailsContent: document.getElementById("detailsContent"),

    toastContainer: document.getElementById("toastContainer"),
    themeToggle: document.getElementById("themeToggle")
};


/* =========================================
   HELPERS
========================================= */

function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}


function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}


function safeImageURL(value) {
    const url = String(value || "").trim();

    if (!url) {
        return "";
    }

    try {
        const parsed = new URL(url);

        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.href;
        }
    } catch {
        return "";
    }

    return "";
}


function safeContactURL(value) {
    const contact = String(value || "").trim();

    if (/^https?:\/\//i.test(contact)) {
        try {
            const url = new URL(contact);

            if (url.protocol === "http:" || url.protocol === "https:") {
                return url.href;
            }
        } catch {
            return "";
        }
    }

    return "";
}


function getInitials(name) {
    const words = String(name || "Campus Student")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    return words
        .slice(0, 2)
        .map(word => word.charAt(0).toUpperCase())
        .join("") || "CL";
}


function getToday() {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function formatDate(dateString) {
    if (!dateString) {
        return "Date not available";
    }

    const date = new Date(`${dateString}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return "Date not available";
    }

    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(date);
}


function timeAgo(dateString) {
    if (!dateString) {
        return "Date unavailable";
    }

    const date = new Date(`${dateString}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }

    const today = new Date(`${getToday()}T00:00:00`);

    const difference = Math.round(
        (today.getTime() - date.getTime()) / 86400000
    );

    if (difference < 0) {
        return formatDate(dateString);
    }

    if (difference === 0) {
        return "Today";
    }

    if (difference === 1) {
        return "Yesterday";
    }

    if (difference < 7) {
        return `${difference} days ago`;
    }

    return formatDate(dateString);
}


function getTypeLabel(type) {
    return type === "found" ? "Found item" : "Lost item";
}


function getTypeBadgeClass(type) {
    return type === "found" ? "badge-found" : "badge-lost";
}


function getCategoryIcon(category) {
    return CATEGORY_ICONS[category] || CATEGORY_ICONS.Other;
}


function closeModal(overlay) {
    overlay.classList.add("hidden");
    updateBodyScroll();
}


function updateBodyScroll() {
    const anyModalOpen =
        !elements.reportModal.classList.contains("hidden") ||
        !elements.detailsModal.classList.contains("hidden");

    document.body.style.overflow = anyModalOpen ? "hidden" : "";
}


function closeAllModals() {
    closeModal(elements.reportModal);
    closeModal(elements.detailsModal);
    activeDetailsId = null;
}


/* =========================================
   LOCAL STORAGE
========================================= */

function loadItems() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (stored === null) {
            return [];
        }

        const parsed = JSON.parse(stored);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter(item => {
            return (
                item &&
                typeof item.id === "string" &&
                typeof item.name === "string" &&
                ["lost", "found"].includes(item.type) &&
                typeof item.category === "string"
            );
        });

    } catch (error) {
        console.error("Could not load saved items:", error);
        return [];
    }
}


function saveItems() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        return true;

    } catch (error) {
        console.error("Could not save items:", error);

        showToast(
            "Could not save your changes. Browser storage may be full or unavailable.",
            "error"
        );

        return false;
    }
}


/* =========================================
   DEMO DATA
========================================= */

function createDemoItems() {
    const today = new Date();

    function daysAgo(days) {
        const date = new Date(today);

        date.setDate(date.getDate() - days);

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    return [
        {
            id: createId(),
            type: "lost",
            name: "Wireless Headphones",
            category: "Electronics",
            description: "Black wireless headphones in a soft carrying case. I may have left them in the library study area.",
            location: "Central Library",
            date: daysAgo(0),
            image: "",
            contact: "",
            resolved: false,
            createdAt: Date.now() - 1000
        },
        {
            id: createId(),
            type: "found",
            name: "Student ID Card",
            category: "Documents",
            description: "Found a student ID card near the main entrance. The owner can identify the card to claim it.",
            location: "Main Entrance",
            date: daysAgo(1),
            image: "",
            contact: "",
            resolved: false,
            createdAt: Date.now() - 2000
        },
        {
            id: createId(),
            type: "lost",
            name: "Blue Backpack",
            category: "Bags",
            description: "A navy blue backpack with a small keychain attached. It contains notebooks and stationery.",
            location: "Computer Lab",
            date: daysAgo(2),
            image: "",
            contact: "",
            resolved: false,
            createdAt: Date.now() - 3000
        },
        {
            id: createId(),
            type: "found",
            name: "Set of Keys",
            category: "Keys",
            description: "A small set of keys on a metal ring. Found on a bench outside the cafeteria.",
            location: "Campus Cafeteria",
            date: daysAgo(2),
            image: "",
            contact: "",
            resolved: false,
            createdAt: Date.now() - 4000
        },
        {
            id: createId(),
            type: "lost",
            name: "Silver Wristwatch",
            category: "Accessories",
            description: "A silver-colored wristwatch with a dark face. It may have been left near the sports ground.",
            location: "Sports Ground",
            date: daysAgo(3),
            image: "",
            contact: "",
            resolved: false,
            createdAt: Date.now() - 5000
        },
        {
            id: createId(),
            type: "found",
            name: "Notebook",
            category: "Other",
            description: "A notebook with handwritten lecture notes. Found on a classroom desk after the afternoon lecture.",
            location: "Block B, Room 204",
            date: daysAgo(4),
            image: "",
            contact: "",
            resolved: true,
            createdAt: Date.now() - 6000
        }
    ];
}


function initializeData() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (stored === null) {
            const demoItems = createDemoItems();

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(demoItems)
            );

            items = demoItems;
        }

    } catch (error) {
        console.error("Could not initialize demo data:", error);
    }
}


/* =========================================
   FILTERING AND SORTING
========================================= */

function getFilteredItems() {
    const query = elements.searchInput.value
        .trim()
        .toLowerCase();

    const category = elements.categoryFilter.value;
    const sort = elements.sortFilter.value;

    let filtered = items.filter(item => {
        if (currentView === "lost" && item.type !== "lost") {
            return false;
        }

        if (currentView === "found" && item.type !== "found") {
            return false;
        }

        if (currentView === "resolved" && !item.resolved) {
            return false;
        }

        if (
            currentView !== "resolved" &&
            currentView !== "all" &&
            item.resolved
        ) {
            return false;
        }

        if (
            category !== "all" &&
            item.category !== category
        ) {
            return false;
        }

        if (
            currentCategory !== "all" &&
            item.category !== currentCategory
        ) {
            return false;
        }

        if (query) {
            const searchableText = [
                item.name,
                item.description,
                item.location,
                item.category,
                item.type
            ].join(" ").toLowerCase();

            if (!searchableText.includes(query)) {
                return false;
            }
        }

        return true;
    });

    if (sort === "newest") {
        filtered.sort((a, b) => {
            const dateDifference =
                new Date(`${b.date}T00:00:00`).getTime() -
                new Date(`${a.date}T00:00:00`).getTime();

            return dateDifference || (b.createdAt || 0) - (a.createdAt || 0);
        });

    } else if (sort === "oldest") {
        filtered.sort((a, b) => {
            const dateDifference =
                new Date(`${a.date}T00:00:00`).getTime() -
                new Date(`${b.date}T00:00:00`).getTime();

            return dateDifference || (a.createdAt || 0) - (b.createdAt || 0);
        });

    } else if (sort === "az") {
        filtered.sort((a, b) => {
            return a.name.localeCompare(b.name);
        });
    }

    return filtered;
}


/* =========================================
   STATISTICS
========================================= */

function updateStatistics() {
    const total = items.length;

    const lost = items.filter(item => {
        return item.type === "lost" && !item.resolved;
    }).length;

    const found = items.filter(item => {
        return item.type === "found" && !item.resolved;
    }).length;

    const resolved = items.filter(item => item.resolved).length;

    elements.totalReports.textContent = total;
    elements.lostReports.textContent = lost;
    elements.foundReports.textContent = found;
    elements.resolvedReports.textContent = resolved;
    elements.sidebarTotal.textContent = total;
}


/* =========================================
   ITEM CARD RENDERING
========================================= */

function getImageMarkup(item, isDetails = false) {
    const imageURL = safeImageURL(item.image);

    if (!imageURL) {
        return `
            <div class="${isDetails ? "details-image-placeholder" : "image-placeholder"}">
                <span>${escapeHTML(getCategoryIcon(item.category))}</span>
            </div>
        `;
    }

    return `
        <img
            class="${isDetails ? "" : "item-image"}"
            src="${escapeHTML(imageURL)}"
            alt="${escapeHTML(item.name)}"
            loading="lazy"
            referrerpolicy="no-referrer"
            onerror="this.replaceWith(Object.assign(document.createElement('div'), {className: '${isDetails ? "details-image-placeholder" : "image-placeholder"}', textContent: '${escapeHTML(getCategoryIcon(item.category))}'}))"
        >
    `;
}


function createItemCard(item) {
    const card = document.createElement("article");

    card.className = "item-card";

    card.innerHTML = `
        <div class="item-image-wrapper">

            ${getImageMarkup(item)}

            <span class="item-type-badge ${getTypeBadgeClass(item.type)}">
                ${escapeHTML(getTypeLabel(item.type))}
            </span>

            <span class="item-status-badge ${item.resolved ? "resolved" : ""}">
                ${item.resolved ? "✓ Resolved" : "● Active"}
            </span>

        </div>

        <div class="item-card-body">

            <div class="item-card-meta">
                <span class="category-label">
                    ${escapeHTML(item.category)}
                </span>

                <span class="item-date">
                    ${escapeHTML(timeAgo(item.date))}
                </span>
            </div>

            <h3>${escapeHTML(item.name)}</h3>

            <p class="item-description">
                ${escapeHTML(item.description)}
            </p>

            <div class="item-location">
                <span class="location-icon">⌖</span>
                <span>${escapeHTML(item.location)}</span>
            </div>

            <div class="item-card-footer">

                <div class="reporter-info">

                    <div class="reporter-avatar">
                        ${escapeHTML(getInitials(item.contact || "Campus Student"))}
                    </div>

                    <div class="reporter-text">
                        <strong>
                            ${item.contact ? "Contact available" : "Campus community"}
                        </strong>

                        <span>
                            ${escapeHTML(formatDate(item.date))}
                        </span>
                    </div>

                </div>

                <button
                    class="card-view-button"
                    data-action="details"
                    data-id="${escapeHTML(item.id)}"
                >
                    View details
                </button>

            </div>

            <div class="card-menu" style="margin-top: 12px;">

                ${
                    !item.resolved
                        ? `
                            <button
                                class="card-action"
                                data-action="resolve"
                                data-id="${escapeHTML(item.id)}"
                            >
                                ✓ Mark resolved
                            </button>
                        `
                        : `
                            <button
                                class="card-action"
                                data-action="reopen"
                                data-id="${escapeHTML(item.id)}"
                            >
                                ↺ Reopen
                            </button>
                        `
                }

                <button
                    class="card-action"
                    data-action="edit"
                    data-id="${escapeHTML(item.id)}"
                >
                    Edit
                </button>

                <button
                    class="card-action danger"
                    data-action="delete"
                    data-id="${escapeHTML(item.id)}"
                >
                    Delete
                </button>

            </div>

        </div>
    `;

    return card;
}


function renderItems() {
    const filteredItems = getFilteredItems();

    elements.itemsGrid.replaceChildren();

    filteredItems.forEach(item => {
        elements.itemsGrid.appendChild(createItemCard(item));
    });

    elements.resultsCount.textContent =
        `${filteredItems.length} ${filteredItems.length === 1 ? "item" : "items"}`;

    const hasItems = filteredItems.length > 0;

    elements.emptyState.classList.toggle("hidden", hasItems);
    elements.itemsGrid.classList.toggle("hidden", !hasItems);

    if (!hasItems) {
        if (items.length === 0) {
            elements.emptyTitle.textContent = "No reports yet";
            elements.emptyDescription.textContent =
                "Be the first to report a lost or found item on campus.";

        } else {
            elements.emptyTitle.textContent = "No items found";
            elements.emptyDescription.textContent =
                "Try another search, change your filters, or report a new item.";
        }
    }

    updateStatistics();
    updateViewLabels();
    updateNavigation();
}


/* =========================================
   VIEW LABELS AND NAVIGATION
========================================= */

function updateViewLabels() {
    let title = VIEW_TITLES[currentView] || VIEW_TITLES.all;
    let subtitle = VIEW_SUBTITLES[currentView] || VIEW_SUBTITLES.all;

    if (currentCategory !== "all") {
        title = currentCategory;
        subtitle = `Browse ${currentCategory.toLowerCase()} reports from your campus.`;
    }

    if (
        currentCategory === "all" &&
        elements.categoryFilter.value !== "all"
    ) {
        title = elements.categoryFilter.value;
        subtitle = `Browse ${elements.categoryFilter.value.toLowerCase()} reports from your campus.`;
    }

    if (elements.searchInput.value.trim()) {
        subtitle = `Search results for "${elements.searchInput.value.trim()}".`;
    }

    elements.sectionTitle.textContent = title;
    elements.sectionSubtitle.textContent = subtitle;
    elements.breadcrumbTitle.textContent = title;
}


function updateNavigation() {
    document.querySelectorAll(".nav-item").forEach(button => {
        const active =
            button.dataset.view === currentView &&
            currentCategory === "all" &&
            elements.categoryFilter.value === "all";

        button.classList.toggle("active", active);
    });

    document.querySelectorAll(".category-nav").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.category === currentCategory
        );
    });
}


/* =========================================
   REPORT MODAL
========================================= */

function openReportModal(type = "lost", item = null) {
    elements.reportForm.reset();

    editingItemId = item ? item.id : null;
    elements.editItemId.value = item ? item.id : "";

    const typeInput = elements.reportForm.querySelector(
        `input[name="type"][value="${type}"]`
    );

    if (typeInput) {
        typeInput.checked = true;
    }

    elements.modalTitle.textContent = item
        ? "Edit report"
        : "Report an item";

    elements.submitButtonText.textContent = item
        ? "Save changes"
        : "Publish report";

    if (item) {
        elements.itemName.value = item.name;
        elements.itemCategory.value = item.category;
        elements.itemDescription.value = item.description;
        elements.itemLocation.value = item.location;
        elements.itemDate.value = item.date;
        elements.itemImage.value = item.image || "";
        elements.contactInfo.value = item.contact || "";

    } else {
        elements.itemDate.value = getToday();
    }

    updateDateLabel();

    elements.detailsModal.classList.add("hidden");
    elements.reportModal.classList.remove("hidden");

    updateBodyScroll();

    setTimeout(() => {
        elements.itemName.focus();
    }, 50);
}


function updateDateLabel() {
    const typeInput = elements.reportForm.querySelector(
        'input[name="type"]:checked'
    );

    const type = typeInput ? typeInput.value : "lost";

    elements.dateLabel.textContent =
        type === "found" ? "Date found *" : "Date lost *";
}


function closeReportModal() {
    closeModal(elements.reportModal);
    editingItemId = null;
}


/* =========================================
   CREATE AND UPDATE REPORTS
========================================= */

function handleReportSubmit(event) {
    event.preventDefault();

    if (!elements.reportForm.reportValidity()) {
        return;
    }

    const name = elements.itemName.value.trim();
    const category = elements.itemCategory.value;
    const description = elements.itemDescription.value.trim();
    const location = elements.itemLocation.value.trim();
    const date = elements.itemDate.value;
    const image = elements.itemImage.value.trim();
    const contact = elements.contactInfo.value.trim();

    const typeInput = elements.reportForm.querySelector(
        'input[name="type"]:checked'
    );

    const type = typeInput ? typeInput.value : "lost";

    if (!name || !category || !description || !location || !date) {
        showToast("Please complete all required fields.", "error");
        return;
    }

    if (date > getToday()) {
        showToast("The report date cannot be in the future.", "error");
        return;
    }

    if (image && !safeImageURL(image)) {
        showToast(
            "Please enter a valid image URL beginning with http:// or https://.",
            "error"
        );

        return;
    }

    const timestamp = Date.now();

    const previousItem = editingItemId
        ? items.find(item => item.id === editingItemId)
        : null;

    const itemData = {
        id: editingItemId || createId(),
        type,
        name,
        category,
        description,
        location,
        date,
        image: safeImageURL(image),
        contact,
        resolved: previousItem ? previousItem.resolved : false,
        createdAt: previousItem
            ? previousItem.createdAt
            : timestamp,
        updatedAt: timestamp
    };

    const previousItems = items.slice();

    if (editingItemId) {
        items = items.map(item => {
            return item.id === editingItemId
                ? itemData
                : item;
        });

    } else {
        items.unshift(itemData);
    }

    if (!saveItems()) {
        items = previousItems;
        return;
    }

    closeReportModal();

    renderItems();

    showToast(
        editingItemId
            ? "Report updated successfully."
            : "Your report has been published.",
        "success"
    );

    editingItemId = null;
}


/* =========================================
   DELETE, RESOLVE, REOPEN
========================================= */

function deleteItem(id) {
    const item = items.find(entry => entry.id === id);

    if (!item) {
        return;
    }

    const confirmed = window.confirm(
        `Delete "${item.name}"? This action cannot be undone.`
    );

    if (!confirmed) {
        return;
    }

    const previousItems = items.slice();

    items = items.filter(entry => entry.id !== id);

    if (!saveItems()) {
        items = previousItems;
        return;
    }

    if (activeDetailsId === id) {
        closeModal(elements.detailsModal);
        activeDetailsId = null;
    }

    renderItems();

    showToast("Report deleted successfully.", "success");
}


function updateResolvedStatus(id, resolved) {
    const item = items.find(entry => entry.id === id);

    if (!item) {
        return;
    }

    const previousItems = items.slice();

    items = items.map(entry => {
        return entry.id === id
            ? {
                ...entry,
                resolved,
                updatedAt: Date.now()
            }
            : entry;
    });

    if (!saveItems()) {
        items = previousItems;
        return;
    }

    renderItems();

    if (activeDetailsId === id) {
        showItemDetails(id);
    }

    showToast(
        resolved
            ? "Item marked as resolved."
            : "Report reopened.",
        "success"
    );
}


/* =========================================
   ITEM DETAILS
========================================= */

function showItemDetails(id) {
    const item = items.find(entry => entry.id === id);

    if (!item) {
        showToast("This report could not be found.", "error");
        return;
    }

    activeDetailsId = id;

    const contact = item.contact || "";
    const contactURL = safeContactURL(contact);

    let contactMarkup = `
        <strong>${contact ? escapeHTML(contact) : "Not provided"}</strong>
    `;

    if (contactURL) {
        contactMarkup = `
            <strong>
                <a
                    href="${escapeHTML(contactURL)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="color: var(--primary);"
                >
                    Open contact link ↗
                </a>
            </strong>
        `;
    }

    elements.detailsTitle.textContent = item.name;

    elements.detailsContent.innerHTML = `
        <div class="details-image-wrapper">
            ${getImageMarkup(item, true)}
        </div>

        <div class="details-badges">

            <span class="item-type-badge ${getTypeBadgeClass(item.type)}"
                  style="position:static;">
                ${escapeHTML(getTypeLabel(item.type))}
            </span>

            <span class="results-count">
                ${escapeHTML(item.category)}
            </span>

            <span class="item-status-badge ${item.resolved ? "resolved" : ""}"
                  style="position:static;">
                ${item.resolved ? "✓ Resolved" : "● Active"}
            </span>

        </div>

        <h3 class="details-title">
            ${escapeHTML(item.name)}
        </h3>

        <p class="details-description">
            ${escapeHTML(item.description)}
        </p>

        <div class="details-info-grid">

            <div class="details-info">
                <span>Location</span>
                <strong>${escapeHTML(item.location)}</strong>
            </div>

            <div class="details-info">
                <span>${item.type === "found" ? "Date found" : "Date lost"}</span>
                <strong>${escapeHTML(formatDate(item.date))}</strong>
            </div>

            <div class="details-info">
                <span>Contact information</span>
                ${contactMarkup}
            </div>

            <div class="details-info">
                <span>Report status</span>
                <strong>${item.resolved ? "Resolved" : "Awaiting resolution"}</strong>
            </div>

        </div>

        <div class="details-actions">

            ${
                item.resolved
                    ? `
                        <button
                            class="secondary-button"
                            data-detail-action="reopen"
                            data-id="${escapeHTML(item.id)}"
                        >
                            ↺ Reopen report
                        </button>
                    `
                    : `
                        <button
                            class="primary-button"
                            data-detail-action="resolve"
                            data-id="${escapeHTML(item.id)}"
                        >
                            ✓ Mark as resolved
                        </button>
                    `
            }

            <button
                class="secondary-button"
                data-detail-action="edit"
                data-id="${escapeHTML(item.id)}"
            >
                Edit report
            </button>

        </div>
    `;

    elements.reportModal.classList.add("hidden");
    elements.detailsModal.classList.remove("hidden");

    updateBodyScroll();
}


function handleDetailsAction(action, id) {
    const item = items.find(entry => entry.id === id);

    if (!item) {
        return;
    }

    if (action === "resolve") {
        updateResolvedStatus(id, true);

    } else if (action === "reopen") {
        updateResolvedStatus(id, false);

    } else if (action === "edit") {
        openReportModal(item.type, item);
    }
}


/* =========================================
   TOASTS
========================================= */

function showToast(message, type = "success") {
    const toast = document.createElement("div");

    toast.className = `toast ${type}`;

    const icon = type === "error" ? "!" : "✓";

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span>${escapeHTML(message)}</span>
    `;

    elements.toastContainer.appendChild(toast);

    const timeoutId = setTimeout(() => {
        toast.remove();
        toastTimeouts.delete(timeoutId);
    }, 3200);

    toastTimeouts.add(timeoutId);
}


/* =========================================
   THEME
========================================= */

function loadTheme() {
    try {
        const savedTheme = localStorage.getItem(THEME_KEY);

        if (savedTheme === "dark") {
            document.body.classList.add("dark-mode");

        } else if (savedTheme === "light") {
            document.body.classList.remove("dark-mode");
        }

    } catch (error) {
        console.error("Could not load theme:", error);
    }
}


function toggleTheme() {
    const isDark = document.body.classList.toggle("dark-mode");

    try {
        localStorage.setItem(
            THEME_KEY,
            isDark ? "dark" : "light"
        );

    } catch (error) {
        console.error("Could not save theme:", error);
    }

    showToast(
        isDark ? "Dark mode enabled." : "Light mode enabled.",
        "success"
    );
}


/* =========================================
   FILTER RESET
========================================= */

function clearFilters() {
    currentView = "all";
    currentCategory = "all";

    elements.searchInput.value = "";
    elements.categoryFilter.value = "all";
    elements.sortFilter.value = "newest";

    renderItems();
}


/* =========================================
   EVENT LISTENERS
========================================= */

// Open report modal.

document.getElementById("reportLostBtn").addEventListener("click", () => {
    openReportModal("lost");
});

document.getElementById("reportFoundBtn").addEventListener("click", () => {
    openReportModal("found");
});

document.getElementById("sidebarReportFound").addEventListener("click", () => {
    openReportModal("found");
});

document.getElementById("emptyReportBtn").addEventListener("click", () => {
    openReportModal("lost");
});


// Close report modal.

document.getElementById("closeModalBtn").addEventListener("click", closeReportModal);

document.getElementById("cancelModalBtn").addEventListener("click", closeReportModal);


// Close details modal.

document.getElementById("closeDetailsBtn").addEventListener("click", () => {
    closeModal(elements.detailsModal);
    activeDetailsId = null;
});


// Submit the report form.

elements.reportForm.addEventListener("submit", handleReportSubmit);


// Update date label when report type changes.

elements.reportForm.querySelectorAll('input[name="type"]').forEach(input => {
    input.addEventListener("change", updateDateLabel);
});


// Search.

elements.searchInput.addEventListener("input", renderItems);


// Filters.

elements.categoryFilter.addEventListener("change", () => {
    currentCategory = "all";
    renderItems();
});

elements.sortFilter.addEventListener("change", renderItems);


// Sidebar views.

document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
        currentView = button.dataset.view;
        currentCategory = "all";

        elements.categoryFilter.value = "all";
        elements.searchInput.value = "";

        renderItems();
    });
});


// Sidebar categories.

document.querySelectorAll(".category-nav").forEach(button => {
    button.addEventListener("click", () => {
        const category = button.dataset.category;

        currentView = "all";

        currentCategory =
            currentCategory === category ? "all" : category;

        elements.categoryFilter.value = "all";
        elements.searchInput.value = "";

        renderItems();
    });
});


// Clear filters.

document.getElementById("clearFiltersBtn").addEventListener(
    "click",
    clearFilters
);


// Card actions using event delegation.

elements.itemsGrid.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");

    if (!button) {
        return;
    }

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (!id) {
        return;
    }

    if (action === "details") {
        showItemDetails(id);

    } else if (action === "edit") {
        const item = items.find(entry => entry.id === id);

        if (item) {
            openReportModal(item.type, item);
        }

    } else if (action === "delete") {
        deleteItem(id);

    } else if (action === "resolve") {
        updateResolvedStatus(id, true);

    } else if (action === "reopen") {
        updateResolvedStatus(id, false);
    }
});


// Details modal actions.

elements.detailsContent.addEventListener("click", event => {
    const button = event.target.closest("button[data-detail-action]");

    if (!button) {
        return;
    }

    handleDetailsAction(
        button.dataset.detailAction,
        button.dataset.id
    );
});


// Close modal by clicking the overlay.

elements.reportModal.addEventListener("click", event => {
    if (event.target === elements.reportModal) {
        closeReportModal();
    }
});

elements.detailsModal.addEventListener("click", event => {
    if (event.target === elements.detailsModal) {
        closeModal(elements.detailsModal);
        activeDetailsId = null;
    }
});


// Escape key closes any open modal.

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeAllModals();
    }
});


// Theme.

elements.themeToggle.addEventListener("click", toggleTheme);


// Reset demo data.

document.getElementById("resetDemoBtn").addEventListener("click", () => {
    const confirmed = window.confirm(
        "Reset all reports to the original demo data? Your current reports will be deleted."
    );

    if (!confirmed) {
        return;
    }

    const previousItems = items.slice();

    items = createDemoItems();

    if (!saveItems()) {
        items = previousItems;
        return;
    }

    clearFilters();

    showToast("Demo data has been reset.", "success");
});


/* =========================================
   INITIALIZATION
========================================= */

function initializeApp() {
    initializeData();
    loadTheme();

    elements.itemDate.max = getToday();

    renderItems();
}

initializeApp();