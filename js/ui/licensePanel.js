/**
 * Display-friendly license offering label.
 * Internally we store "lo=CN" but show "CN" to the user.
 */
function displayOffering(offering) {
    if (offering === "lo=CN") return "CN";
    if (offering === "lo=DC") return "DC";
    if (offering === "lo=IN") return "IN";
    return offering; // "NNU", "CNU" are already clean.
}

export function initLicensePanel(state) {
    const productsEl = document.getElementById("license-products");
    const seatSummaryEl = document.getElementById("seat-summary");
    const seatSummaryHeader = document.getElementById("seat-summary-header");

    state.on("license-loaded", (licenseData) => {
        renderProducts(licenseData, productsEl);
    });

    state.on("seat-summary-updated", (summary) => {
        renderSeatSummary(summary, seatSummaryEl, seatSummaryHeader);
    });
}

function renderProducts(licenseData, container) {
    if (!licenseData.isLoaded || licenseData.products.length === 0) {
        container.innerHTML = '<div class="empty-state">No products found in the license file.</div>';
        return;
    }

    container.innerHTML = "";

    // Group by product name.
    const grouped = {};
    for (const p of licenseData.products) {
        if (!grouped[p.productName]) grouped[p.productName] = [];
        grouped[p.productName].push(p);
    }

    for (const [name, entries] of Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]))) {
        const div = document.createElement("div");
        div.className = "product-entry";

        const nameSpan = document.createElement("div");
        nameSpan.className = "product-name";
        nameSpan.textContent = name;
        div.appendChild(nameSpan);

        for (const entry of entries) {
            const detail = document.createElement("div");
            detail.className = "product-detail";
            detail.textContent = `${entry.originalSeatCount} seats | ${displayOffering(entry.licenseOffering)} | #${entry.licenseNumber}`;
            div.appendChild(detail);
        }

        container.appendChild(div);
    }
}

function renderSeatSummary(summary, container, header) {
    if (!summary || Object.keys(summary).length === 0) {
        header.style.display = "none";
        container.innerHTML = "";
        return;
    }

    header.style.display = "block";
    container.innerHTML = "";

    for (const [key, entry] of Object.entries(summary).sort((a, b) => a[1].productName.localeCompare(b[1].productName))) {
        const div = document.createElement("div");
        div.className = "seat-entry";

        const label = document.createElement("span");
        label.textContent = `${entry.productName} (#${entry.licenseNumber})`;
        div.appendChild(label);

        const count = document.createElement("span");
        count.textContent = `${entry.used}/${entry.total}`;
        if (entry.remaining < 0) {
            count.style.color = entry.licenseOffering === "NNU" ? "var(--error)" : "var(--warning)";
        }
        div.appendChild(count);

        const barOuter = document.createElement("div");
        barOuter.className = "seat-bar";
        const barFill = document.createElement("div");
        barFill.className = "seat-bar-fill";
        const pct = Math.min(100, Math.max(0, (entry.used / entry.total) * 100));
        barFill.style.width = pct + "%";
        if (entry.remaining < 0) barFill.classList.add("overdraft");
        barOuter.appendChild(barFill);

        const wrapper = document.createElement("div");
        wrapper.style.width = "100%";
        wrapper.appendChild(div);
        wrapper.appendChild(barOuter);
        container.appendChild(wrapper);
    }
}
