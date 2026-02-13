/**
 * Convert an OptionsDocument into FlexLM-format .opt file text.
 */
export function exportOptionsFile(optionsDoc) {
    const lines = [];

    for (const d of optionsDoc.directives) {
        const line = directiveToLine(d);
        if (line !== null) {
            lines.push(line);
        }
    }

    return lines.join("\n") + "\n";
}

function directiveToLine(d) {
    switch (d.type) {
        case "INCLUDE":
        case "EXCLUDE":
        case "INCLUDE_BORROW":
        case "EXCLUDE_BORROW":
            return `${d.type} ${formatProductPart(d.productName, d.licenseNumber, d.productKey)} ${d.clientType} ${d.clientSpecified}`;

        case "INCLUDEALL":
        case "EXCLUDEALL":
            return `${d.type} ${d.clientType} ${d.clientSpecified}`;

        case "RESERVE":
            return `RESERVE ${d.seatCount} ${formatProductPart(d.productName, d.licenseNumber, d.productKey)} ${d.clientType} ${d.clientSpecified}`;

        case "MAX":
            return `MAX ${d.maxSeats} ${d.productName} ${d.clientType} ${d.clientSpecified}`;

        case "GROUP":
            return `GROUP ${d.groupName} ${d.members.join(" ")}`;

        case "HOST_GROUP":
            return `HOST_GROUP ${d.groupName} ${d.members.join(" ")}`;

        case "GROUPCASEINSENSITIVE":
            return "GROUPCASEINSENSITIVE ON";

        case "COMMENT":
            return `# ${d.text}`;

        default:
            return null;
    }
}

function formatProductPart(productName, licenseNumber, productKey) {
    if (licenseNumber) {
        return `"${productName} asset_info=${licenseNumber}"`;
    }
    if (productKey) {
        return `"${productName} key=${productKey}"`;
    }
    return productName;
}

/**
 * Trigger a browser download of the options file.
 */
export function downloadOptionsFile(optionsDoc, filename = "MLM.opt") {
    const text = exportOptionsFile(optionsDoc);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
