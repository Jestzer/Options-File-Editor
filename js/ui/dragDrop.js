import { parseLicenseFile } from "../parsers/licenseFileParser.js";
import { parseOptionsFile } from "../parsers/optionsFileParser.js";
import { showModal, showError } from "./modal.js";
import { validateTextFile } from "../util/fileValidation.js";

export function initDragDrop(state) {
    const overlay = document.getElementById("drop-overlay");
    let dragCounter = 0;

    document.addEventListener("dragenter", (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) {
            overlay.classList.remove("hidden");
        }
    });

    document.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            overlay.classList.add("hidden");
        }
    });

    document.addEventListener("dragover", (e) => {
        e.preventDefault();
    });

    document.addEventListener("drop", (e) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.add("hidden");

        const files = e.dataTransfer.files;
        if (!files.length) return;

        for (const file of files) {
            handleDroppedFile(file, state);
        }
    });
}

function detectFileTypeFromExtension(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    if (ext === "dat" || ext === "lic") return "license";
    if (ext === "opt") return "options";
    return "unknown";
}

function detectFileTypeFromContent(text) {
    const lines = text.split(/\r?\n/);
    let licenseScore = 0;
    let optionsScore = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (/^(SERVER|VENDOR|DAEMON)\s/i.test(trimmed)) licenseScore += 3;
        if (/^(INCREMENT|FEATURE)\s/i.test(trimmed)) licenseScore += 3;
        if (/^(INCLUDE|EXCLUDE|INCLUDEALL|EXCLUDEALL|INCLUDE_BORROW|EXCLUDE_BORROW)\s/i.test(trimmed)) optionsScore += 3;
        if (/^(GROUP|HOST_GROUP)\s/i.test(trimmed)) optionsScore += 3;
        if (/^(RESERVE|MAX)\s/i.test(trimmed)) optionsScore += 3;
        if (/^GROUPCASEINSENSITIVE/i.test(trimmed)) optionsScore += 5;
    }

    if (licenseScore > 0 && optionsScore === 0) return "license";
    if (optionsScore > 0 && licenseScore === 0) return "options";
    if (licenseScore > optionsScore * 2) return "license";
    if (optionsScore > licenseScore * 2) return "options";
    return "unknown";
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

async function handleDroppedFile(file, state) {
    if (!await validateTextFile(file)) {
        showError(`"${file.name}" appears to be a binary file (such as a PDF, image, or Word document), not a plain text file.`);
        return;
    }

    let fileType = detectFileTypeFromExtension(file.name);
    const text = await readFileAsText(file);

    if (fileType === "unknown") {
        fileType = detectFileTypeFromContent(text);

        if (fileType === "unknown") {
            fileType = await showModal(
                "File Type",
                `Could not determine the type of "${file.name}". What kind of file is this?`,
                [
                    { label: "License File", value: "license" },
                    { label: "Options File", value: "options" },
                    { label: "Cancel", value: null }
                ]
            );
            if (!fileType) return;
        }
    }

    if (fileType === "license") {
        const { licenseData, error } = parseLicenseFile(text);
        if (error) {
            showError(error);
            return;
        }
        state.setLicenseData(licenseData);
    } else {
        const friendlyNameMap = state.licenseData.isLoaded ? state.licenseData.getFriendlyNameMap() : null;
        const { document: doc, error } = parseOptionsFile(text, friendlyNameMap);
        if (error) {
            showError(error);
            return;
        }
        state.document.replaceAll(doc.directives);
    }
}
