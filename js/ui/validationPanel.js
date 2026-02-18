export function initValidationPanel(state, { directiveList }) {
    const resultsEl = document.getElementById("validation-results");
    const countEl = document.getElementById("validation-count");

    state.on("validation-complete", (results) => {
        render(results);
    });

    function render(results) {
        resultsEl.innerHTML = "";

        if (!results || results.length === 0) {
            countEl.innerHTML = "";
            return;
        }

        // Count by severity.
        let errors = 0, warnings = 0, infos = 0, suggestions = 0;
        for (const r of results) {
            if (r.severity === "error") errors++;
            else if (r.severity === "warning") warnings++;
            else if (r.severity === "suggestion") suggestions++;
            else infos++;
        }

        countEl.innerHTML = "";
        if (errors > 0) {
            const span = document.createElement("span");
            span.className = "count-error";
            span.textContent = `${errors} error${errors !== 1 ? "s" : ""}`;
            countEl.appendChild(span);
        }
        if (warnings > 0) {
            const span = document.createElement("span");
            span.className = "count-warning";
            span.textContent = `${warnings} warning${warnings !== 1 ? "s" : ""}`;
            countEl.appendChild(span);
        }
        if (suggestions > 0) {
            const span = document.createElement("span");
            span.className = "count-suggestion";
            span.textContent = `${suggestions} suggestion${suggestions !== 1 ? "s" : ""}`;
            countEl.appendChild(span);
        }
        if (infos > 0) {
            const span = document.createElement("span");
            span.className = "count-info";
            span.textContent = `${infos} info`;
            countEl.appendChild(span);
        }

        // Render each result.
        for (const r of results) {
            const item = document.createElement("div");
            item.className = `validation-item ${r.severity}`;

            const icon = document.createElement("span");
            icon.className = "validation-icon";
            icon.textContent = r.severity === "error" ? "\u2716"
                : r.severity === "warning" ? "\u26A0"
                : r.severity === "suggestion" ? "\uD83D\uDCA1"
                : "\u2139\uFE0F";
            item.appendChild(icon);

            const text = document.createTextNode(r.message);
            item.appendChild(text);

            // Render action button for suggestions.
            if (r.action && r.action.directives && r.action.directives.length > 0) {
                const btn = document.createElement("button");
                btn.className = "btn btn-suggestion-action";
                btn.textContent = r.action.label || "Apply";
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    for (const directive of r.action.directives) {
                        state.document.add({ ...directive });
                    }
                });
                item.appendChild(btn);
            }

            // Click to highlight the relevant directive.
            if (r.directiveId) {
                item.style.cursor = "pointer";
                item.addEventListener("click", () => {
                    directiveList.selectDirective(r.directiveId);
                    // Scroll directive into view.
                    const row = document.querySelector(`.directive-row[data-uid="${r.directiveId}"]`);
                    if (row) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
                });
            }

            resultsEl.appendChild(item);
        }
    }
}
