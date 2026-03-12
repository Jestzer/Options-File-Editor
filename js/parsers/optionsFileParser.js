import { OptionsDocument } from "../state/OptionsDocument.js";
import { masterProductsSet, masterProductsList } from "../data/masterProductsList.js";
import { uid } from "../util/uid.js";

function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function findClosestProduct(input) {
    let bestMatch = null;
    let bestDistance = Infinity;
    const inputLower = input.toLowerCase();
    for (const product of masterProductsList) {
        const distance = levenshteinDistance(inputLower, product.toLowerCase());
        if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = product;
        }
    }
    const threshold = Math.max(3, Math.ceil(input.length * 0.4));
    return bestDistance <= threshold ? bestMatch : null;
}

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
 * When an invalid client type is detected, check if the user may have used spaces
 * instead of underscores in the product name. Scans forward for a valid client type;
 * if found, the tokens in between are likely a multi-word product name.
 */
function findSuggestion(input, friendlyNameMap) {
    if (friendlyNameMap) {
        const key = input.toLowerCase().replace(/ /g, "_");
        const flexName = friendlyNameMap.get(key);
        if (flexName) return flexName;
    }
    return findClosestProduct(input);
}

function detectSpacedProductName(lineParts, productStartIndex, clientTypeIndex, friendlyNameMap) {
    for (let k = clientTypeIndex; k < lineParts.length; k++) {
        if (validateClientType(lineParts[k])) {
            const spacedName = lineParts.slice(productStartIndex, k).join(" ");
            const underscoredName = lineParts.slice(productStartIndex, k).join("_");
            const suggestion = findSuggestion(underscoredName, friendlyNameMap);
            return {
                detected: true,
                spacedName,
                underscoredName,
                suggestion,
                clientType: lineParts[k],
                clientSpecified: lineParts.slice(k + 1).join(" ").trimEnd().replace(/"/g, "")
            };
        }
    }
    return { detected: false };
}

/**
 * Parse a FlexLM options file (.opt) into an OptionsDocument.
 * Returns { document, warnings, error }.
 */
export function parseOptionsFile(rawText, friendlyNameMap = null) {
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
                const spaced = detectSpacedProductName(lineParts, 1, nextIndex, friendlyNameMap);
                if (spaced.detected) {
                    const fixedName = spaced.suggestion || spaced.underscoredName;
                    warnings.push(`Corrected spaced product name "${spaced.spacedName}" to "${fixedName}" on ${type} line.`);
                    directives.push({
                        uid: uid(), type, productName: fixedName,
                        licenseNumber, productKey,
                        clientType: spaced.clientType, clientSpecified: spaced.clientSpecified
                    });
                    continue;
                }
                return {
                    document: null, warnings,
                    error: `Invalid client type "${clientType || "(empty)"}" on ${type} line: "${currentLine}"`
                };
            }
            if (!clientSpecified || !clientSpecified.trim()) {
                return { document: null, warnings, error: `No ${clientType} specified on ${type} line: "${currentLine}"` };
            }

            // Flag unrecognized products as warnings (the validation panel handles detailed errors).
            if (!masterProductsSet.has(productName)) {
                const suggestion = findSuggestion(productName, friendlyNameMap);
                const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : "";
                warnings.push(`Unknown product "${productName}" on ${type} line.${suggestionText}`);
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
                return { document: null, warnings, error: `Incorrectly formatted MAX line (missing information). A MAX line should be formatted as: MAX <number_of_seats> <product_name> <client_type> <client_specified>. Example: MAX 5 MATLAB USER john_doe. The line in question: "${currentLine}"` };
            }

            const maxSeats = Number(lineParts[1]);
            const productName = lineParts[2];
            const clientType = lineParts[3];
            let clientSpecified = lineParts.slice(4).join(" ").trimEnd().replace(/"/g, "");

            if (!Number.isInteger(maxSeats) || maxSeats <= 0) {
                return { document: null, warnings, error: `Invalid seat count on MAX line: "${currentLine}"` };
            }

            if (!clientType || !validateClientType(clientType)) {
                const spaced = detectSpacedProductName(lineParts, 2, 3, friendlyNameMap);
                if (spaced.detected) {
                    const fixedName = spaced.suggestion || spaced.underscoredName;
                    warnings.push(`Corrected spaced product name "${spaced.spacedName}" to "${fixedName}" on MAX line.`);
                    directives.push({
                        uid: uid(), type: "MAX", maxSeats,
                        productName: fixedName,
                        clientType: spaced.clientType, clientSpecified: spaced.clientSpecified
                    });
                    continue;
                }
                return {
                    document: null, warnings,
                    error: `Invalid client type "${clientType || "(empty)"}" on MAX line: "${currentLine}"`
                };
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
                const spaced = detectSpacedProductName(lineParts, 2, nextIndex, friendlyNameMap);
                if (spaced.detected) {
                    const fixedName = spaced.suggestion || spaced.underscoredName;
                    warnings.push(`Corrected spaced product name "${spaced.spacedName}" to "${fixedName}" on RESERVE line.`);
                    directives.push({
                        uid: uid(), type: "RESERVE", seatCount,
                        productName: fixedName, licenseNumber, productKey,
                        clientType: spaced.clientType, clientSpecified: spaced.clientSpecified
                    });
                    continue;
                }
                return {
                    document: null, warnings,
                    error: `Invalid client type "${clientType || "(empty)"}" on RESERVE line: "${currentLine}"`
                };
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

        // --- USERCASEINSENSITIVE (not a real directive) ---
        if (trimmed.startsWith("USERCASEINSENSITIVE")) {
            lastGroupDirective = null;
            lastHostGroupDirective = null;
            directives.push({ uid: uid(), type: "USERCASEINSENSITIVE" });
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

            // Basic syntax validation for TIMEOUTALL, TIMEOUT, and LINGER.
            const lineParts = trimmed.split(/\s+/).filter(p => p);
            if (firstWord === "TIMEOUTALL") {
                if (lineParts.length < 2) {
                    return { document: null, warnings, error: `TIMEOUTALL line is missing the timeout value (in seconds): "${currentLine}"` };
                }
                const value = Number(lineParts[1]);
                if (!Number.isInteger(value) || value < 0) {
                    return { document: null, warnings, error: `TIMEOUTALL line has an invalid timeout value. It must be a positive integer (in seconds): "${currentLine}"` };
                }
            } else if (firstWord === "TIMEOUT") {
                if (lineParts.length < 3) {
                    return { document: null, warnings, error: `TIMEOUT line is missing information. Format: TIMEOUT product seconds. Line: "${currentLine}"` };
                }
                const value = Number(lineParts[2]);
                if (!Number.isInteger(value) || value < 0) {
                    return { document: null, warnings, error: `TIMEOUT line has an invalid timeout value. It must be a positive integer (in seconds): "${currentLine}"` };
                }
            } else if (firstWord === "LINGER") {
                if (lineParts.length < 3) {
                    return { document: null, warnings, error: `LINGER line is missing information. Format: LINGER product seconds. Line: "${currentLine}"` };
                }
                const value = Number(lineParts[2]);
                if (!Number.isInteger(value) || value < 0) {
                    return { document: null, warnings, error: `LINGER line has an invalid linger value. It must be a positive integer (in seconds): "${currentLine}"` };
                }
            }

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
        lastGroupDirective = null;
        lastHostGroupDirective = null;
        directives.push({ uid: uid(), type: "UNKNOWN", rawLine: trimmed });
        continue;
    }

    doc.replaceAll(directives);
    return { document: doc, warnings, error: null };
}
