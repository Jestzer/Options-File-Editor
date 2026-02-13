import { masterProductsList } from "../data/masterProductsList.js";

function displayOffering(offering) {
    if (offering === "lo=CN") return "CN";
    if (offering === "lo=DC") return "DC";
    if (offering === "lo=IN") return "IN";
    return offering;
}

const DIRECTIVE_TYPES = [
    "INCLUDE", "EXCLUDE", "INCLUDE_BORROW", "EXCLUDE_BORROW",
    "INCLUDEALL", "EXCLUDEALL", "RESERVE", "MAX",
    "GROUP", "HOST_GROUP", "COMMENT"
];

const PRODUCT_TYPES = new Set(["INCLUDE", "EXCLUDE", "INCLUDE_BORROW", "EXCLUDE_BORROW", "RESERVE", "MAX"]);
const CLIENT_TYPES = ["USER", "GROUP", "HOST", "HOST_GROUP", "DISPLAY", "PROJECT", "INTERNET"];
const NEEDS_CLIENT = new Set([
    "INCLUDE", "EXCLUDE", "INCLUDE_BORROW", "EXCLUDE_BORROW",
    "INCLUDEALL", "EXCLUDEALL", "RESERVE", "MAX"
]);

export function initDirectiveEditor(state, options) {
    const container = document.getElementById("directive-form-container");
    let editingUid = null; // null = new directive, string = editing existing

    function showEmpty() {
        container.innerHTML = '<div class="empty-state">Select a directive to edit, or click "+ Add Directive".</div>';
        editingUid = null;
    }

    function showForm(directive) {
        // directive is either a directive object (edit mode) or "new" (create mode).
        const isNew = directive === "new";
        editingUid = isNew ? null : directive?.uid || null;

        const currentType = isNew ? "" : directive.type;

        container.innerHTML = "";
        const form = document.createElement("div");

        // --- Type selector (always enabled so users can change type) ---
        const typeGroup = createFormGroup("Directive Type", "select", {
            options: ["", ...DIRECTIVE_TYPES],
            value: currentType
        });
        form.appendChild(typeGroup.wrapper);

        // Dynamic fields container.
        const fieldsContainer = document.createElement("div");
        form.appendChild(fieldsContainer);

        // Actions.
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "form-actions";

        const saveBtn = document.createElement("button");
        saveBtn.className = "btn btn-primary";
        saveBtn.textContent = isNew ? "Add" : "Update";
        actionsDiv.appendChild(saveBtn);

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "btn";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => {
            showEmpty();
            options.directiveList.clearSelection();
        });
        actionsDiv.appendChild(cancelBtn);

        form.appendChild(actionsDiv);
        container.appendChild(form);

        // --- Render fields when type changes ---
        function renderFieldsForType(type) {
            fieldsContainer.innerHTML = "";
            if (!type) return;

            const fields = {};

            if (PRODUCT_TYPES.has(type)) {
                const productNames = state.licenseData.isLoaded
                    ? state.licenseData.getProductNames()
                    : masterProductsList;
                fields.productName = createFormGroup("Product", "select", {
                    options: ["", ...productNames],
                    value: directive?.productName || ""
                });
                fieldsContainer.appendChild(fields.productName.wrapper);

                // License number (optional).
                fields.licenseNumber = createFormGroup("License Number (optional)", "text", {
                    value: directive?.licenseNumber || "",
                    placeholder: "Leave blank for auto-select"
                });
                fieldsContainer.appendChild(fields.licenseNumber.wrapper);

                // Product key (optional).
                fields.productKey = createFormGroup("Product Key (optional)", "text", {
                    value: directive?.productKey || "",
                    placeholder: "Leave blank for auto-select"
                });
                fieldsContainer.appendChild(fields.productKey.wrapper);

                // Update license number options when product changes.
                fields.productName.input.addEventListener("change", () => {
                    updateLicenseOptions(fields, state);
                });
                // Trigger initial.
                if (directive?.productName) {
                    updateLicenseOptions(fields, state);
                }
            }

            if (type === "RESERVE") {
                fields.seatCount = createFormGroup("Seat Count", "number", {
                    value: directive?.seatCount || 1,
                    min: 1
                });
                fieldsContainer.appendChild(fields.seatCount.wrapper);
            }

            if (type === "MAX") {
                fields.maxSeats = createFormGroup("Max Seats", "number", {
                    value: directive?.maxSeats || 1,
                    min: 1
                });
                fieldsContainer.appendChild(fields.maxSeats.wrapper);
            }

            if (NEEDS_CLIENT.has(type)) {
                fields.clientType = createFormGroup("Client Type", "select", {
                    options: ["", ...CLIENT_TYPES],
                    value: directive?.clientType || ""
                });
                fieldsContainer.appendChild(fields.clientType.wrapper);

                fields.clientSpecified = createFormGroup("Client", "text", {
                    value: directive?.clientSpecified || "",
                    placeholder: "Username, group name, hostname..."
                });
                fieldsContainer.appendChild(fields.clientSpecified.wrapper);

                // When clientType is GROUP or HOST_GROUP, offer dropdown.
                fields.clientType.input.addEventListener("change", () => {
                    updateClientSpecifiedHelp(fields, state);
                });
                if (directive?.clientType) {
                    updateClientSpecifiedHelp(fields, state);
                }
            }

            if (type === "GROUP" || type === "HOST_GROUP") {
                fields.groupName = createFormGroup(type === "GROUP" ? "Group Name" : "Host Group Name", "text", {
                    value: directive?.groupName || ""
                });
                fieldsContainer.appendChild(fields.groupName.wrapper);

                fields.members = createFormGroup("Members (one per line)", "textarea", {
                    value: (directive?.members || []).join("\n")
                });
                fieldsContainer.appendChild(fields.members.wrapper);
            }

            if (type === "COMMENT") {
                fields.text = createFormGroup("Comment Text", "text", {
                    value: directive?.text || ""
                });
                fieldsContainer.appendChild(fields.text.wrapper);
            }

            // Wire save button.
            saveBtn.onclick = () => {
                const built = buildDirective(type, fields, editingUid);
                if (!built) return;

                if (isNew) {
                    state.document.add(built);
                } else {
                    state.document.update(editingUid, built);
                }
                showEmpty();
                options.directiveList.clearSelection();
            };
        }

        typeGroup.input.addEventListener("change", () => {
            const newType = typeGroup.input.value;
            // When changing type, preserve shared fields (clientType, clientSpecified)
            // but reset type-specific ones.
            const preserved = {};
            if (directive && directive !== "new") {
                if (directive.clientType) preserved.clientType = directive.clientType;
                if (directive.clientSpecified) preserved.clientSpecified = directive.clientSpecified;
                if (directive.productName) preserved.productName = directive.productName;
            }
            directive = { ...preserved, type: newType };
            renderFieldsForType(newType);
        });

        if (currentType) {
            renderFieldsForType(currentType);
        }
    }

    return {
        showForm,
        showEmpty
    };
}

function createFormGroup(label, type, options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "form-group";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    wrapper.appendChild(labelEl);

    let input;

    if (type === "select") {
        input = document.createElement("select");
        input.className = "form-control";
        for (const opt of (options.options || [])) {
            const optEl = document.createElement("option");
            optEl.value = opt;
            optEl.textContent = opt || `-- Select --`;
            if (opt === options.value) optEl.selected = true;
            input.appendChild(optEl);
        }
        if (options.disabled) input.disabled = true;
    } else if (type === "textarea") {
        input = document.createElement("textarea");
        input.className = "form-control";
        input.value = options.value || "";
        input.rows = 5;
    } else {
        input = document.createElement("input");
        input.type = type;
        input.className = "form-control";
        input.value = options.value ?? "";
        if (options.placeholder) input.placeholder = options.placeholder;
        if (options.min !== undefined) input.min = options.min;
    }

    wrapper.appendChild(input);
    return { wrapper, input };
}

function updateLicenseOptions(fields, state) {
    if (!state.licenseData.isLoaded || !fields.productName) return;

    const productName = fields.productName.input.value;
    if (!productName) return;

    const entries = state.licenseData.getLicenseEntriesForProduct(productName);

    // Update license number help text.
    if (entries.length > 1 && fields.licenseNumber) {
        // Convert to a select with options.
        const parent = fields.licenseNumber.input.parentElement;
        const oldInput = fields.licenseNumber.input;
        const select = document.createElement("select");
        select.className = "form-control";

        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = "(Any - auto-select)";
        select.appendChild(defaultOpt);

        for (const e of entries) {
            const opt = document.createElement("option");
            opt.value = e.licenseNumber;
            opt.textContent = `${e.licenseNumber} (${displayOffering(e.licenseOffering)}, ${e.seatCount} seats)`;
            if (oldInput.value === e.licenseNumber) opt.selected = true;
            select.appendChild(opt);
        }

        parent.replaceChild(select, oldInput);
        fields.licenseNumber.input = select;
    }
}

function updateClientSpecifiedHelp(fields, state) {
    if (!fields.clientType || !fields.clientSpecified) return;

    const clientType = fields.clientType.input.value;

    // If GROUP or HOST_GROUP, suggest available groups.
    if (clientType === "GROUP") {
        const groupNames = state.document.getGroupNames();
        convertToSelectOrInput(fields.clientSpecified, groupNames);
    } else if (clientType === "HOST_GROUP") {
        const hostGroupNames = state.document.getHostGroupNames();
        convertToSelectOrInput(fields.clientSpecified, hostGroupNames);
    } else {
        // Ensure it's a text input.
        ensureTextInput(fields.clientSpecified);
    }
}

function convertToSelectOrInput(fieldObj, options) {
    if (options.length === 0) {
        ensureTextInput(fieldObj);
        return;
    }

    const parent = fieldObj.input.parentElement;
    const oldValue = fieldObj.input.value;
    const select = document.createElement("select");
    select.className = "form-control";

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "-- Select --";
    select.appendChild(defaultOpt);

    for (const name of options) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        if (name === oldValue) opt.selected = true;
        select.appendChild(opt);
    }

    parent.replaceChild(select, fieldObj.input);
    fieldObj.input = select;
}

function ensureTextInput(fieldObj) {
    if (fieldObj.input.tagName === "INPUT") return;
    const parent = fieldObj.input.parentElement;
    const oldValue = fieldObj.input.value;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "form-control";
    input.value = oldValue;
    input.placeholder = "Username, group name, hostname...";
    parent.replaceChild(input, fieldObj.input);
    fieldObj.input = input;
}

function buildDirective(type, fields, existingUid) {
    const base = existingUid ? { uid: existingUid, type } : { type };

    switch (type) {
        case "INCLUDE":
        case "EXCLUDE":
        case "INCLUDE_BORROW":
        case "EXCLUDE_BORROW":
            return {
                ...base,
                productName: fields.productName.input.value,
                licenseNumber: fields.licenseNumber?.input.value || "",
                productKey: fields.productKey?.input.value || "",
                clientType: fields.clientType.input.value,
                clientSpecified: fields.clientSpecified.input.value.trim()
            };

        case "INCLUDEALL":
        case "EXCLUDEALL":
            return {
                ...base,
                clientType: fields.clientType.input.value,
                clientSpecified: fields.clientSpecified.input.value.trim()
            };

        case "RESERVE":
            return {
                ...base,
                seatCount: parseInt(fields.seatCount.input.value, 10) || 1,
                productName: fields.productName.input.value,
                licenseNumber: fields.licenseNumber?.input.value || "",
                productKey: fields.productKey?.input.value || "",
                clientType: fields.clientType.input.value,
                clientSpecified: fields.clientSpecified.input.value.trim()
            };

        case "MAX":
            return {
                ...base,
                maxSeats: parseInt(fields.maxSeats.input.value, 10) || 1,
                productName: fields.productName.input.value,
                clientType: fields.clientType.input.value,
                clientSpecified: fields.clientSpecified.input.value.trim()
            };

        case "GROUP":
        case "HOST_GROUP":
            return {
                ...base,
                groupName: fields.groupName.input.value.trim(),
                members: fields.members.input.value
                    .split("\n")
                    .map(m => m.trim())
                    .filter(Boolean)
            };

        case "COMMENT":
            return {
                ...base,
                text: fields.text.input.value
            };

        default:
            return null;
    }
}
