import { showConfirm } from "./modal.js";

const TYPE_BADGES = {
    INCLUDE: "badge-include",
    EXCLUDE: "badge-exclude",
    INCLUDE_BORROW: "badge-include",
    EXCLUDE_BORROW: "badge-exclude",
    INCLUDEALL: "badge-includeall",
    EXCLUDEALL: "badge-excludeall",
    RESERVE: "badge-reserve",
    MAX: "badge-max",
    GROUP: "badge-group",
    HOST_GROUP: "badge-hostgroup",
    COMMENT: "badge-comment",
    GROUPCASEINSENSITIVE: "badge-groupcaseinsensitive"
};

export function initDirectiveList(state, { onSelectDirective }) {
    const listEl = document.getElementById("directive-list");
    const addBtn = document.getElementById("btn-add-directive");
    let selectedId = null;

    function render() {
        const directives = state.document.directives;
        listEl.innerHTML = "";

        if (directives.length === 0) {
            listEl.innerHTML = '<div class="empty-state">Load an options file or add directives to get started.</div>';
            return;
        }

        // Collect directive IDs that have validation issues.
        const errorIds = new Set();
        const warningIds = new Set();
        for (const r of state.validationResults) {
            if (!r.directiveId) continue;
            if (r.severity === "error") errorIds.add(r.directiveId);
            else if (r.severity === "warning") warningIds.add(r.directiveId);
        }

        for (const d of directives) {
            const row = document.createElement("div");
            row.className = "directive-row";
            if (d.uid === selectedId) row.classList.add("selected");
            if (errorIds.has(d.uid)) row.classList.add("has-error");
            else if (warningIds.has(d.uid)) row.classList.add("has-warning");
            row.dataset.uid = d.uid;

            // Type badge.
            const badge = document.createElement("span");
            badge.className = `directive-type-badge ${TYPE_BADGES[d.type] || ""}`;
            badge.textContent = d.type === "GROUPCASEINSENSITIVE" ? "GROUPCASEINSENSITIVE" : d.type.replace("_", " ");
            row.appendChild(badge);

            // Summary text.
            const summary = document.createElement("span");
            summary.className = "directive-summary";
            summary.textContent = directiveSummaryText(d);
            row.appendChild(summary);

            // Action buttons.
            const actions = document.createElement("div");
            actions.className = "directive-actions";

            // Move up.
            const upBtn = document.createElement("button");
            upBtn.textContent = "\u2191";
            upBtn.title = "Move up";
            upBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const idx = state.document.directives.findIndex(x => x.uid === d.uid);
                if (idx > 0) state.document.move(d.uid, idx - 1);
            });
            actions.appendChild(upBtn);

            // Move down.
            const downBtn = document.createElement("button");
            downBtn.textContent = "\u2193";
            downBtn.title = "Move down";
            downBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const idx = state.document.directives.findIndex(x => x.uid === d.uid);
                if (idx < state.document.length - 1) state.document.move(d.uid, idx + 1);
            });
            actions.appendChild(downBtn);

            // Delete.
            const delBtn = document.createElement("button");
            delBtn.textContent = "\u00D7";
            delBtn.title = "Delete";
            delBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const confirmed = await showConfirm(`Delete this ${d.type} directive?`);
                if (confirmed) {
                    state.document.remove(d.uid);
                    if (selectedId === d.uid) {
                        selectedId = null;
                        onSelectDirective(null);
                    }
                }
            });
            actions.appendChild(delBtn);

            row.appendChild(actions);

            // Click to select/edit.
            row.addEventListener("click", () => {
                selectedId = d.uid;
                onSelectDirective(d);
                render();
            });

            listEl.appendChild(row);
        }
    }

    // Add new directive.
    addBtn.addEventListener("click", () => {
        selectedId = null;
        onSelectDirective("new");
    });

    state.on("document-changed", render);
    state.on("validation-complete", render);

    return {
        render,
        selectDirective(uid) {
            selectedId = uid;
            render();
        },
        clearSelection() {
            selectedId = null;
            render();
        }
    };
}

function directiveSummaryText(d) {
    switch (d.type) {
        case "INCLUDE":
        case "EXCLUDE":
        case "INCLUDE_BORROW":
        case "EXCLUDE_BORROW": {
            let qualifier = "";
            if (d.licenseNumber) qualifier += `:asset_info=${d.licenseNumber}`;
            if (d.productKey) qualifier += `:key=${d.productKey}`;
            return `${d.productName}${qualifier} ${d.clientType} ${d.clientSpecified}`;
        }
        case "INCLUDEALL":
        case "EXCLUDEALL":
            return `${d.clientType} ${d.clientSpecified}`;
        case "RESERVE":
            return `${d.seatCount} ${d.productName} ${d.clientType} ${d.clientSpecified}`;
        case "MAX":
            return `${d.maxSeats} ${d.productName} ${d.clientType} ${d.clientSpecified}`;
        case "GROUP":
            return `${d.groupName} (${d.members.length} members)`;
        case "HOST_GROUP":
            return `${d.groupName} (${d.members.length} hosts)`;
        case "COMMENT":
            return d.text;
        case "GROUPCASEINSENSITIVE":
            return "ON";
        default:
            return "";
    }
}
