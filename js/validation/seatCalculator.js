/**
 * Calculate seat usage across all license products based on the current options document.
 * Returns { results, summary }.
 *   - results: validation messages (overdraft warnings/errors)
 *   - summary: { productName: { used, total, licenseOffering, entries: [...] } }
 *
 * This is idempotent — it works on copies of seat data and can be called repeatedly.
 */
export function calculate(state) {
    const results = [];

    if (!state.licenseData.isLoaded || state.licenseData.products.length === 0) {
        return results;
    }

    // Create working copies of seat counts keyed by product index.
    const seatCounts = state.licenseData.products.map(p => ({
        productName: p.productName,
        seatCount: p.originalSeatCount,
        originalSeatCount: p.originalSeatCount,
        productKey: p.productKey,
        licenseOffering: p.licenseOffering,
        licenseNumber: p.licenseNumber,
        subtractingDirectives: []
    }));

    const doc = state.document;
    const caseSensitive = !doc.hasGroupCaseInsensitive();

    // Build group member count lookup.
    const groupMemberCounts = {};
    for (const g of doc.getGroups()) {
        const key = caseSensitive ? g.groupName : g.groupName.toLowerCase();
        groupMemberCounts[key] = g.members.length;
    }

    // Process INCLUDE directives.
    for (const d of doc.getByType("INCLUDE")) {
        subtractForDirective(d, seatCounts, groupMemberCounts, caseSensitive, results);
    }

    // Process INCLUDEALL directives.
    for (const d of doc.getByType("INCLUDEALL")) {
        subtractForIncludeAll(d, seatCounts, groupMemberCounts, caseSensitive, results);
    }

    // Process RESERVE directives.
    for (const d of doc.getByType("RESERVE")) {
        subtractForReserve(d, seatCounts, groupMemberCounts, caseSensitive, results);
    }

    // Build summary.
    const summary = {};
    for (const entry of seatCounts) {
        const key = `${entry.productName}|${entry.licenseNumber}`;
        summary[key] = {
            productName: entry.productName,
            licenseNumber: entry.licenseNumber,
            licenseOffering: entry.licenseOffering,
            productKey: entry.productKey,
            remaining: entry.seatCount,
            total: entry.originalSeatCount,
            used: entry.originalSeatCount - entry.seatCount,
            subtractingDirectives: entry.subtractingDirectives
        };
    }

    // Check for overdraft.
    for (const entry of seatCounts) {
        if (entry.seatCount < 0) {
            if (entry.licenseOffering === "NNU") {
                results.push({
                    severity: "error",
                    directiveId: null,
                    message: `NNU product "${entry.productName}" on license ${entry.licenseNumber}: more users specified (${entry.originalSeatCount - entry.seatCount}) than ${entry.originalSeatCount === 1 ? "seat" : "seats"} available (${entry.originalSeatCount}).`
                });
            } else if (entry.licenseOffering === "lo=CN") {
                results.push({
                    severity: "warning",
                    directiveId: null,
                    message: `CN product "${entry.productName}" on license ${entry.licenseNumber}: more users specified than ${entry.originalSeatCount === 1 ? "seat" : "seats"} available. Possible License Manager Error -4.`
                });
            }
        }
    }

    state.setSeatSummary(summary);
    return results;
}

function findMatchingEntries(productName, licenseNumber, productKey, seatCounts) {
    return seatCounts.filter(entry => {
        if (entry.productName.toLowerCase() !== productName.toLowerCase()) return false;
        if (licenseNumber && entry.licenseNumber !== licenseNumber) return false;
        if (productKey && entry.productKey !== productKey) return false;
        return true;
    });
}

function getSubtractionAmount(directive, groupMemberCounts, caseSensitive) {
    switch (directive.clientType) {
        case "USER":
            return 1;
        case "GROUP": {
            const key = caseSensitive
                ? directive.clientSpecified
                : directive.clientSpecified?.toLowerCase();
            return groupMemberCounts[key] || 0;
        }
        default:
            // HOST, HOST_GROUP, DISPLAY, PROJECT, INTERNET — can't determine a count.
            return 0;
    }
}

function subtractForDirective(directive, seatCounts, groupMemberCounts, caseSensitive, results) {
    const productName = directive.productName;
    if (!productName) return;

    const amount = getSubtractionAmount(directive, groupMemberCounts, caseSensitive);
    if (amount === 0) return;

    const matches = findMatchingEntries(productName, directive.licenseNumber, directive.productKey, seatCounts);
    if (matches.length === 0) return;

    let remaining = amount;

    // First pass: subtract from entries with available seats.
    for (const entry of matches) {
        if (remaining <= 0) break;
        if (entry.seatCount <= 0) continue;

        const toSubtract = Math.min(remaining, entry.seatCount);
        entry.seatCount -= toSubtract;
        remaining -= toSubtract;
        entry.subtractingDirectives.push(directive.uid);
    }

    // Second pass: force-subtract remainder from first match.
    if (remaining > 0) {
        matches[0].seatCount -= remaining;
        if (!matches[0].subtractingDirectives.includes(directive.uid)) {
            matches[0].subtractingDirectives.push(directive.uid);
        }
    }
}

function subtractForIncludeAll(directive, seatCounts, groupMemberCounts, caseSensitive, results) {
    const amount = getSubtractionAmount(directive, groupMemberCounts, caseSensitive);
    if (amount === 0) return;

    // INCLUDEALL subtracts from every product — except NNU products.
    for (const entry of seatCounts) {
        if (entry.licenseOffering === "NNU") continue;
        entry.seatCount -= amount;
        entry.subtractingDirectives.push(directive.uid);
    }
}

function subtractForReserve(directive, seatCounts, groupMemberCounts, caseSensitive, results) {
    const productName = directive.productName;
    if (!productName) return;

    const amount = directive.seatCount;
    if (!amount || amount <= 0) return;

    const matches = findMatchingEntries(productName, directive.licenseNumber, directive.productKey, seatCounts);
    if (matches.length === 0) return;

    let remaining = amount;

    // First pass: subtract from entries with available seats.
    for (const entry of matches) {
        if (remaining <= 0) break;
        if (entry.seatCount <= 0) continue;

        const toSubtract = Math.min(remaining, entry.seatCount);
        entry.seatCount -= toSubtract;
        remaining -= toSubtract;
        entry.subtractingDirectives.push(directive.uid);
    }

    // Second pass: force-subtract remainder.
    if (remaining > 0) {
        matches[0].seatCount -= remaining;
        if (!matches[0].subtractingDirectives.includes(directive.uid)) {
            matches[0].subtractingDirectives.push(directive.uid);
        }
    }
}
