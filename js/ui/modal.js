const overlay = document.getElementById("modal-overlay");
const titleEl = document.getElementById("modal-title");
const bodyEl = document.getElementById("modal-body");
const actionsEl = document.getElementById("modal-actions");

/**
 * Show a modal dialog. Returns a Promise that resolves when the user acts.
 * @param {string} title
 * @param {string} message
 * @param {Array<{label: string, value: any, className?: string}>} buttons
 */
export function showModal(title, message, buttons = [{ label: "OK", value: true }]) {
    return new Promise(resolve => {
        titleEl.textContent = title;
        bodyEl.textContent = message;
        actionsEl.innerHTML = "";

        for (const btn of buttons) {
            const el = document.createElement("button");
            el.className = `btn ${btn.className || ""}`.trim();
            el.textContent = btn.label;
            el.addEventListener("click", () => {
                overlay.classList.add("hidden");
                resolve(btn.value);
            });
            actionsEl.appendChild(el);
        }

        overlay.classList.remove("hidden");
    });
}

/**
 * Show an error modal.
 */
export function showError(message) {
    return showModal("Error", message, [{ label: "OK", value: true }]);
}

/**
 * Show a confirmation modal.
 */
export function showConfirm(message) {
    return showModal("Confirm", message, [
        { label: "Cancel", value: false },
        { label: "Confirm", value: true, className: "btn-primary" }
    ]);
}
