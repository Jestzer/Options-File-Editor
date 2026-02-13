import { OptionsDocument } from "../state/OptionsDocument.js";
import { masterProductsSet } from "../data/masterProductsList.js";
import { uid } from "../util/uid.js";

const VALID_CLIENT_TYPES = new Set(["USER", "GROUP", "HOST", "HOST_GROUP", "DISPLAY", "PROJECT", "INTERNET"]);
const IGNORED_DIRECTIVES = new Set([
    "TIMEOUTALL", "DEBUGLOG", "LINGER", "MAX_OVERDRAFT", "REPORTLOG",
    "TIMEOUT", "BORROW", "NOLOG", "DEFAULT", "HIDDEN", "MAX_BORROW_HOURS", "BORROW_LOWWATER"
]);

/**
 * Parse a product+qualifier field that may contain quotes, colons, asset_info, or key.
 * Handles these formats:
 *   "Product asset_info=NNNN"  -> { productName, licenseNumber, productKey: "" }
 *   "Product key=XXXX"         -> { productName, licenseNumber: "", productKey }
 *   Product:asset_info=NNNN    -> { productName, licenseNumber, productKey: "" }
 *   Product:key=XXXX           -> { productName, licenseNumber: "", productKey }
 *   Product                    -> { productName, licenseNumber: "", productKey: "" }
 *
 * For quoted formats, also returns how many lineParts tokens were consumed for the
 * product portion (so the caller knows where clientType starts).
 */
function parseProductQualifier(lineParts, startIndex) {
    let productName = lineParts[startIndex];
    let licenseNumber = "";
    let productKey = "";
    let nextIndex = startIndex + 1; // Index of the next token after product info.

    if (productName.includes('"')) {
        // Quoted format: could be "Product asset_info=NNN" or "Product:asset_info=NNN"
        productName = productName.replace(/"/g, "");

        if (productName.includes(":")) {
            // Colon inside the first token with a quote: "Product:asset_info=NNN"
            const result = splitColonQualifier(productName);
            if (result.error) return { error: result.error };
            productName = result.productName;
            licenseNumber = result.licenseNumber;
            productKey = result.productKey;
            // nextIndex stays the same — clientType is at startIndex+1
        } else {
            // Space-separated: "Product asset_info=NNN" (the qualifier is the next token)
            const qualifier = lineParts[startIndex + 1] || "";

            if (qualifier.toLowerCase().includes("key=")) {
                productKey = qualifier.replace(/key=/gi, "").replace(/"/g, "");
            } else if (qualifier.toLowerCase().includes("asset_info=")) {
                licenseNumber = qualifier.replace(/asset_info=/gi, "").replace(/"/g, "");
            }
            // clientType is now 2 positions after startIndex.
            nextIndex = startIndex + 2;
        }
    } else if (productName.includes(":")) {
        // Colon format without quotes: Product:asset_info=NNN
        const result = splitColonQualifier(productName);
        if (result.error) return { error: result.error };
        productName = result.productName;
        licenseNumber = result.licenseNumber;
        productKey = result.productKey;
        // nextIndex stays the same.
    }
    // else: plain product name, no qualifier.

    // Clean up any remaining quotes.
    licenseNumber = licenseNumber.replace(/"/g, "");
    productKey = productKey.replace(/"/g, "");

    if (licenseNumber === "DEMO") {
        return { error: "A trial license number was incorrectly specified as DEMO. Use the full trial license number." };
    }

    return { productName, licenseNumber, productKey, nextIndex, error: null };
}

function splitColonQualifier(rawName) {
    const parts = rawName.split(":");
    if (parts.length !== 2) {
        return { error: `Stray colon in product name: "${rawName}".` };
    }
    const productName = parts[0];
    const qualifier = parts[1];
    let licenseNumber = "";
    let productKey = "";

    if (qualifier.toLowerCase().includes("key=")) {
        productKey = qualifier.replace(/key=/gi, "");
    } else {
        licenseNumber = qualifier.replace(/asset_info=/gi, "");
    }
    return { productName, licenseNumber, productKey, error: null };
}

function validateClientType(clientType) {
    return VALID_CLIENT_TYPES.has(clientType);
}

/**
 * Parse a FlexLM options file (.opt) into an OptionsDocument.
 * Returns { document, warnings, error }.
 */
export function parseOptionsFile(rawText) {
    const warnings = [];

    if (!rawText || !rawText.trim()) {
        return { document: null, warnings, error: "The options file is empty." };
    }

    // Remove line continuations and tabs (but preserve lines for GROUP continuation).
    let text = rawText
        .replace(/\\\r\n/g, "")
        .replace(/\\\n\t/g, "")
        .replace(/\\\n/g, "")
        .replace(/\t/g, " ");

    const lines = text.split(/\r\n|\r|\n/);

    // Quick content check.
    if (!text.includes("INCLUDE") && !text.includes("EXCLUDE") && !text.includes("RESERVE")
        && !text.includes("MAX") && !text.includes("LINGER") && !text.includes("LOG")
        && !text.includes("TIMEOUT") && !text.includes("GROUP")) {
        return { document: null, warnings, error: "The file does not appear to be a valid options file." };
    }

    const doc = new OptionsDocument();
    const directives = [];
    let lastGroupDirective = null; // For multi-line GROUP continuation.
    let lastHostGroupDirective = null; // For multi-line HOST_GROUP continuation.
    const ipAddressRegex = /\d{2,3}\./g;

    for (let i = 0; i < lines.length; i++) {
        const currentLine = lines[i];
        const trimmed = currentLine.trim();

        // --- INCLUDE / INCLUDE_BORROW / EXCLUDE / EXCLUDE_BORROW ---
        if (trimmed.startsWith("INCLUDE ") || trimmed.startsWith("INCLUDE_BORROW ") ||
            trimmed.startsWith("EXCLUDE ") || trimmed.startsWith("EXCLUDE_BORROW ")) {
            lastGroupDirective = null;
            lastHostGroupDirective = null;

            let type;
            if (trimmed.startsWith("INCLUDE_BORROW ")) type = "INCLUDE_BORROW";
            else if (trimmed.startsWith("INCLUDE ")) type = "INCLUDE";
            else if (trimmed.startsWith("EXCLUDE_BORROW ")) type = "EXCLUDE_BORROW";
            else type = "EXCLUDE";

            const lineParts = currentLine.split(" ").filter(p => p.trim() !== "");

            if (lineParts.length < 4) {
                return { document: null, warnings, error: `Incorrectly formatted ${type} line (missing information): "${currentLine}"` };
            }

            // Check for stray quotation marks.
            const quoteCount = (currentLine.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0) {
                return { document: null, warnings, error: `Stray quotation mark on ${type} line: "${currentLine}"` };
            }

            const result = parseProductQualifier(lineParts, 1);
            if (result.error) {
                return { document: null, warnings, error: `${result.error} Line: "${currentLine}"` };
            }

            const { productName, licenseNumber, productKey, nextIndex } = result;
            const clientType = lineParts[nextIndex];
            let clientSpecified = lineParts.slice(nextIndex + 1).join(" ").trimEnd().replace(/"/g, "");

            if (!clientType || !validateClientType(clientType)) {
                return {
                    document: null, warnings,
                    error: `Invalid client type "${clientType || "(empty)"}" on ${type} line: "${currentLine}"`
                };
            }
            if (!clientSpecified || !clientSpecified.trim()) {
                return { document: null, warnings, error: `No ${clientType} specified on ${type} line: "${currentLine}"` };
            }

            // Validate product name against master list.
            if (!masterProductsSet.has(productName)) {
                return {
                    document: null, warnings,
                    error: `Unknown product "${productName}" on ${type} line. Ensure it matches the INCREMENT line in the license file exactly. Line: "${currentLine}"`
                };
            }

            // Check for wildcards and IP addresses.
            if (clientSpecified.includes("*")) {
                warnings.push(`Wildcard used in ${type} line: "${currentLine}"`);
            }
            if (ipAddressRegex.test(clientSpecified)) {
                warnings.push(`IP address used in ${type} line: "${currentLine}"`);
                ipAddressRegex.lastIndex = 0;
            }

            directives.push({
                uid: uid(),
                type,
                productName,
                licenseNumber,
                productKey,
                clientType,
                clientSpecified
            });
            continue;
        }

        // --- INCLUDEALL / EXCLUDEALL ---
        if (trimmed.startsWith("INCLUDEALL ") || trimmed.startsWith("EXCLUDEALL ")) {
            lastGroupDirective = null;
            lastHostGroupDirective = null;

            const type = trimmed.startsWith("INCLUDEALL ") ? "INCLUDEALL" : "EXCLUDEALL";
            const lineParts = currentLine.split(" ").filter(p => p.trim());

            if (lineParts.length < 3) {
                return { document: null, warnings, error: `Incorrectly formatted ${type} line (missing information): "${currentLine}"` };
            }

            const clientType = lineParts[1];
            let clientSpecified = lineParts.slice(2).join(" ").trimEnd().replace(/"/g, "");

            if (!validateClientType(clientType)) {
                return { document: null, warnings, error: `Invalid client type "${clientType}" on ${type} line: "${currentLine}"` };
            }
            if (!clientSpecified || !clientSpecified.trim()) {
                return { document: null, warnings, error: `No ${clientType} specified on ${type} line: "${currentLine}"` };
            }

            if (clientSpecified.includes("*")) {
                warnings.push(`Wildcard used in ${type} line: "${currentLine}"`);
            }
            if (ipAddressRegex.test(clientSpecified)) {
                warnings.push(`IP address used in ${type} line: "${currentLine}"`);
                ipAddressRegex.lastIndex = 0;
            }

            directives.push({
                uid: uid(),
                type,
                clientType,
                clientSpecified
            });
            continue;
        }

        // --- MAX ---
        if (trimmed.startsWith("MAX ")) {
            lastGroupDirective = null;
            lastHostGroupDirective = null;

            const lineParts = currentLine.split(" ").filter(p => p.trim());
            if (lineParts.length < 5) {
                return { document: null, warnings, error: `Incorrectly formatted MAX line (missing information): "${currentLine}"` };
            }

            const maxSeats = Number(lineParts[1]);
            const productName = lineParts[2];
            const clientType = lineParts[3];
            let clientSpecified = lineParts.slice(4).join(" ").trimEnd().replace(/"/g, "");

            if (!Number.isInteger(maxSeats) || maxSeats <= 0) {
                return { document: null, warnings, error: `Invalid seat count on MAX line: "${currentLine}"` };
            }

            if (clientSpecified.includes("*")) {
                warnings.push(`Wildcard used in MAX line: "${currentLine}"`);
            }
            if (ipAddressRegex.test(clientSpecified)) {
                warnings.push(`IP address used in MAX line: "${currentLine}"`);
                ipAddressRegex.lastIndex = 0;
            }

            directives.push({
                uid: uid(),
                type: "MAX",
                maxSeats,
                productName,
                clientType,
                clientSpecified
            });
            continue;
        }

        // --- RESERVE ---
        if (trimmed.startsWith("RESERVE ")) {
            lastGroupDirective = null;
            lastHostGroupDirective = null;

            const lineParts = currentLine.split(" ").filter(p => p.trim() !== "");
            if (lineParts.length < 5) {
                return { document: null, warnings, error: `Incorrectly formatted RESERVE line (missing information): "${currentLine}"` };
            }

            const quoteCount = (currentLine.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0) {
                return { document: null, warnings, error: `Stray quotation mark on RESERVE line: "${currentLine}"` };
            }

            const seatCount = Number(lineParts[1]);
            if (!Number.isInteger(seatCount) || seatCount <= 0) {
                return { document: null, warnings, error: `Invalid or zero/negative seat count on RESERVE line: "${currentLine}"` };
            }

            const result = parseProductQualifier(lineParts, 2);
            if (result.error) {
                return { document: null, warnings, error: `${result.error} Line: "${currentLine}"` };
            }

            const { productName, licenseNumber, productKey, nextIndex } = result;
            const clientType = lineParts[nextIndex];
            let clientSpecified = lineParts.slice(nextIndex + 1).join(" ").trimEnd().replace(/"/g, "");

            if (!clientType || !validateClientType(clientType)) {
                return { document: null, warnings, error: `Invalid client type "${clientType || "(empty)"}" on RESERVE line: "${currentLine}"` };
            }
            if (!clientSpecified || !clientSpecified.trim()) {
                return { document: null, warnings, error: `No ${clientType} specified on RESERVE line: "${currentLine}"` };
            }

            if (clientSpecified.includes("*")) {
                warnings.push(`Wildcard used in RESERVE line: "${currentLine}"`);
            }
            if (ipAddressRegex.test(clientSpecified)) {
                warnings.push(`IP address used in RESERVE line: "${currentLine}"`);
                ipAddressRegex.lastIndex = 0;
            }

            directives.push({
                uid: uid(),
                type: "RESERVE",
                seatCount,
                productName,
                licenseNumber,
                productKey,
                clientType,
                clientSpecified
            });
            continue;
        }

        // --- GROUP ---
        if (trimmed.startsWith("GROUP ") || trimmed.startsWith("GROUP\t")) {
            lastHostGroupDirective = null;

            const cleanLine = currentLine.replace(/[\t\r\n]/g, " ");
            const lineParts = cleanLine.split(" ").filter(p => /\S/.test(p));

            const groupName = lineParts[1]?.replace(/[\s\t]/g, "") || "";
            const memberTokens = lineParts.slice(2).map(m => m.trim()).filter(Boolean);

            // Check if we already have a GROUP with this name — merge members.
            const existing = directives.find(d => d.type === "GROUP" && d.groupName === groupName);
            if (existing) {
                existing.members.push(...memberTokens);
                lastGroupDirective = existing;
            } else {
                const directive = {
                    uid: uid(),
                    type: "GROUP",
                    groupName,
                    members: memberTokens
                };
                directives.push(directive);
                lastGroupDirective = directive;
            }

            // Check for wildcards and IP addresses.
            for (const m of memberTokens) {
                if (m.includes("*")) warnings.push(`Wildcard used in GROUP "${groupName}": "${m}"`);
                if (ipAddressRegex.test(m)) {
                    warnings.push(`IP address used in GROUP "${groupName}": "${m}"`);
                    ipAddressRegex.lastIndex = 0;
                }
            }
            continue;
        }

        // --- HOST_GROUP ---
        if (trimmed.startsWith("HOST_GROUP ") || trimmed.startsWith("HOST_GROUP\t")) {
            lastGroupDirective = null;

            const cleanLine = currentLine.replace(/[\t\r\n]/g, " ");
            const lineParts = cleanLine.split(" ").filter(p => /\S/.test(p));

            const groupName = lineParts[1]?.replace(/[\s\t]/g, "") || "";
            const memberTokens = lineParts.slice(2).map(m => m.trim().replace(/"/g, "")).filter(Boolean);

            // Check if we already have a HOST_GROUP with this name — merge.
            const existing = directives.find(d => d.type === "HOST_GROUP" && d.groupName === groupName);
            if (existing) {
                existing.members.push(...memberTokens);
                lastHostGroupDirective = existing;
            } else {
                const directive = {
                    uid: uid(),
                    type: "HOST_GROUP",
                    groupName,
                    members: memberTokens
                };
                directives.push(directive);
                lastHostGroupDirective = directive;
            }

            for (const m of memberTokens) {
                if (m.includes("*")) warnings.push(`Wildcard used in HOST_GROUP "${groupName}": "${m}"`);
                if (ipAddressRegex.test(m)) {
                    warnings.push(`IP address used in HOST_GROUP "${groupName}": "${m}"`);
                    ipAddressRegex.lastIndex = 0;
                }
            }
            continue;
        }

        // --- GROUPCASEINSENSITIVE ---
        if (trimmed.startsWith("GROUPCASEINSENSITIVE ON")) {
            lastGroupDirective = null;
            lastHostGroupDirective = null;
            directives.push({ uid: uid(), type: "GROUPCASEINSENSITIVE" });
            continue;
        }

        // --- Recognized but not parsed directives ---
        const firstWord = trimmed.split(/\s/)[0];
        if (IGNORED_DIRECTIVES.has(firstWord)) {
            lastGroupDirective = null;
            lastHostGroupDirective = null;
            continue;
        }

        // --- Comments and blank lines ---
        if (trimmed.startsWith("#") || trimmed === "") {
            // Comments don't reset group continuation if they're between group lines.
            if (trimmed.startsWith("#")) {
                directives.push({ uid: uid(), type: "COMMENT", text: trimmed.slice(1).trim() });
            }
            continue;
        }

        // --- GROUP continuation lines (no keyword at start) ---
        if (lastGroupDirective) {
            const cleanLine = currentLine.replace(/[\t\r\n\\]/g, " ");
            const memberTokens = cleanLine.split(" ").filter(p => /\S/.test(p));

            lastGroupDirective.members.push(...memberTokens);

            for (const m of memberTokens) {
                if (m.includes("*")) warnings.push(`Wildcard used in GROUP "${lastGroupDirective.groupName}": "${m}"`);
                if (ipAddressRegex.test(m)) {
                    warnings.push(`IP address used in GROUP "${lastGroupDirective.groupName}": "${m}"`);
                    ipAddressRegex.lastIndex = 0;
                }
            }
            continue;
        }

        if (lastHostGroupDirective) {
            const cleanLine = currentLine.replace(/[\t\r\n]/g, " ");
            const memberTokens = cleanLine.split(" ").filter(p => /\S/.test(p)).map(m => m.replace(/"/g, ""));

            lastHostGroupDirective.members.push(...memberTokens);

            for (const m of memberTokens) {
                if (m.includes("*")) warnings.push(`Wildcard used in HOST_GROUP "${lastHostGroupDirective.groupName}": "${m}"`);
                if (ipAddressRegex.test(m)) {
                    warnings.push(`IP address used in HOST_GROUP "${lastHostGroupDirective.groupName}": "${m}"`);
                    ipAddressRegex.lastIndex = 0;
                }
            }
            continue;
        }

        // --- Unrecognized line ---
        return {
            document: null, warnings,
            error: `Unrecognized option line: "${currentLine}". Check for typos.`
        };
    }

    doc.replaceAll(directives);
    return { document: doc, warnings, error: null };
}
