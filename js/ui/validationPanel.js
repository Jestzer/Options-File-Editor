export function initValidationPanel(state, { directiveList }) {
    const resultsEl = document.getElementById("validation-results");
    const countEl = document.getElementById("validation-count");
    let activeItem = null;

    state.on("validation-complete", (results) => {
        activeItem = null;
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

            // Render message, with diff highlighting for product suggestions.
            if (r.suggestedProduct && r.enteredProduct) {
                item.appendChild(document.createTextNode(
                    `"${r.enteredProduct}" is not a recognized MathWorks product. Did you mean "`
                ));
                const segments = getDiffSegments(r.enteredProduct, r.suggestedProduct);
                for (const seg of segments) {
                    if (seg.highlighted) {
                        const span = document.createElement("span");
                        span.className = "diff-highlight";
                        span.textContent = seg.text;
                        item.appendChild(span);
                    } else {
                        item.appendChild(document.createTextNode(seg.text));
                    }
                }
                item.appendChild(document.createTextNode('"?'));
            } else {
                item.appendChild(document.createTextNode(r.message));
            }

            // Render action button for fixable issues.
            if (r.action) {
                const btn = document.createElement("button");
                btn.className = "btn btn-suggestion-action";
                btn.textContent = r.action.label || "Apply";
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    executeAction(r.action, state);
                });
                item.appendChild(btn);
            }

            // Determine if this message has anything to highlight.
            const uids = [];
            if (r.directiveId) uids.push(r.directiveId);
            if (r.relatedDirectiveIds) {
                for (const uid of r.relatedDirectiveIds) {
                    if (!uids.includes(uid)) uids.push(uid);
                }
            }
            const hasDirectiveHighlight = uids.length > 0;
            const hasProductHighlight = r.relatedProducts && r.relatedProducts.length > 0;
            const isClickable = hasDirectiveHighlight || hasProductHighlight;

            if (isClickable) {
                item.style.cursor = "pointer";
                item.addEventListener("click", () => {
                    // Toggle: clicking the same item again clears the highlight.
                    if (activeItem === item) {
                        activeItem.classList.remove("active");
                        activeItem = null;
                        directiveList.clearSpotlight();
                        state.emit("spotlight-products", null);
                        return;
                    }

                    // Clear previous active state.
                    if (activeItem) activeItem.classList.remove("active");
                    activeItem = item;
                    item.classList.add("active");

                    // Spotlight directives.
                    if (hasDirectiveHighlight) {
                        directiveList.spotlightDirectives(uids, r.severity);
                        const firstRow = document.querySelector(`.directive-row[data-uid="${uids[0]}"]`);
                        if (firstRow) firstRow.scrollIntoView({ behavior: "smooth", block: "start" });
                    } else {
                        directiveList.clearSpotlight();
                    }

                    // Spotlight products in the left panel.
                    if (hasProductHighlight) {
                        state.emit("spotlight-products", r.relatedProducts);
                        const firstProductName = r.relatedProducts[0].split("|")[0];
                        const productEl = document.querySelector(`.product-entry[data-product-name="${firstProductName}"]`);
                        if (productEl) productEl.scrollIntoView({ behavior: "smooth", block: "start" });
                    } else {
                        state.emit("spotlight-products", null);
                    }
                });
            }

            resultsEl.appendChild(item);
        }
    }
}

function executeAction(action, state) {
    const type = action.type || (action.directives ? "add" : null);

    switch (type) {
        case "add":
            for (const directive of action.directives) {
                state.document.add({ ...directive });
            }
            break;
        case "remove":
            state.document.remove(action.targetId);
            break;
        case "update":
            state.document.update(action.targetId, action.changes);
            break;
        case "replace": {
            const idx = state.document.directives.findIndex(d => d.uid === action.targetId);
            state.document.remove(action.targetId);
            state.document.add({ ...action.replacement }, idx >= 0 ? idx : undefined);
            break;
        }
        case "license-fix":
            state.fixLicensePort(action.fixType, action.value);
            break;
    }
}

/**
 * Compute diff segments between two strings using Levenshtein backtracking.
 * Returns an array of { text, highlighted } objects for the target string,
 * where highlighted segments represent insertions or substitutions.
 */
function getDiffSegments(source, target) {
    const m = source.length;
    const n = target.length;

    // Build DP matrix.
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (source[i - 1] === target[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to find edit operations.
    const ops = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && source[i - 1] === target[j - 1]) {
            ops.push({ type: "match", char: target[j - 1] });
            i--; j--;
        } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
            ops.push({ type: "substitute", char: target[j - 1] });
            i--; j--;
        } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
            ops.push({ type: "insert", char: target[j - 1] });
            j--;
        } else {
            // Deletion from source — not in target.
            i--;
        }
    }
    ops.reverse();

    // Group consecutive matching/differing characters into segments.
    const segments = [];
    let currentText = "";
    let currentHighlighted = false;

    for (const op of ops) {
        if (op.type === "match") {
            if (currentHighlighted && currentText) {
                segments.push({ text: currentText, highlighted: true });
                currentText = "";
            }
            currentHighlighted = false;
            currentText += op.char;
        } else if (op.type === "substitute" || op.type === "insert") {
            if (!currentHighlighted && currentText) {
                segments.push({ text: currentText, highlighted: false });
                currentText = "";
            }
            currentHighlighted = true;
            currentText += op.char;
        }
    }
    if (currentText) {
        segments.push({ text: currentText, highlighted: currentHighlighted });
    }

    return segments;
}
