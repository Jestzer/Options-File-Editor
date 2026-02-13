import { parseLicenseFile } from "../parsers/licenseFileParser.js";
import { parseOptionsFile } from "../parsers/optionsFileParser.js";
import { downloadOptionsFile } from "../export/optionsFileExporter.js";
import { showError, showConfirm } from "./modal.js";
import { resetUidCounter } from "../util/uid.js";

export function initToolbar(state) {
    const btnNew = document.getElementById("btn-new");
    const btnLoadLicense = document.getElementById("btn-load-license");
    const btnLoadOptions = document.getElementById("btn-load-options");
    const btnExport = document.getElementById("btn-export");
    const licenseInput = document.getElementById("license-file-input");
    const optionsInput = document.getElementById("options-file-input");
    const chkCaseInsensitive = document.getElementById("chk-case-insensitive");

    // --- New ---
    btnNew.addEventListener("click", async () => {
        if (state.document.length > 0) {
            const confirmed = await showConfirm("Clear all directives and start a new options file?");
            if (!confirmed) return;
        }
        state.document.clear();
        resetUidCounter();
    });

    // --- Load License ---
    btnLoadLicense.addEventListener("click", () => {
        licenseInput.value = "";
        licenseInput.click();
    });

    licenseInput.addEventListener("change", () => {
        const file = licenseInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const { licenseData, warnings, error } = parseLicenseFile(reader.result);
            if (error) {
                showError(error);
                return;
            }
            state.setLicenseData(licenseData);
            if (warnings.length > 0) {
                // Warnings are handled by the validation panel.
            }
        };
        reader.readAsText(file);
    });

    // --- Load Options ---
    btnLoadOptions.addEventListener("click", () => {
        optionsInput.value = "";
        optionsInput.click();
    });

    optionsInput.addEventListener("change", () => {
        const file = optionsInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const { document: doc, warnings, error } = parseOptionsFile(reader.result);
            if (error) {
                showError(error);
                return;
            }

            // Replace the current document's directives.
            state.document.replaceAll(doc.directives);

            // Sync the GROUPCASEINSENSITIVE checkbox.
            chkCaseInsensitive.checked = state.document.hasGroupCaseInsensitive();
        };
        reader.readAsText(file);
    });

    // --- Export ---
    btnExport.addEventListener("click", () => {
        downloadOptionsFile(state.document);
    });

    // Enable export button when there are directives.
    state.on("document-changed", () => {
        btnExport.disabled = state.document.length === 0;
    });

    // --- GROUPCASEINSENSITIVE toggle ---
    chkCaseInsensitive.addEventListener("change", () => {
        const hasIt = state.document.hasGroupCaseInsensitive();
        if (chkCaseInsensitive.checked && !hasIt) {
            state.document.add({ type: "GROUPCASEINSENSITIVE" }, 0);
        } else if (!chkCaseInsensitive.checked && hasIt) {
            const d = state.document.getByType("GROUPCASEINSENSITIVE")[0];
            if (d) state.document.remove(d.uid);
        }
    });

    // Keep checkbox in sync.
    state.on("document-changed", () => {
        chkCaseInsensitive.checked = state.document.hasGroupCaseInsensitive();
    });
}
