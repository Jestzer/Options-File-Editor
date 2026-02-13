const VALID_CLIENT_TYPES = new Set(["USER", "GROUP", "HOST", "HOST_GROUP", "DISPLAY", "PROJECT", "INTERNET"]);
const PRODUCT_DIRECTIVE_TYPES = new Set(["INCLUDE", "EXCLUDE", "INCLUDE_BORROW", "EXCLUDE_BORROW", "RESERVE", "MAX"]);
const CLIENT_DIRECTIVE_TYPES = new Set([
    "INCLUDE", "EXCLUDE", "INCLUDE_BORROW", "EXCLUDE_BORROW",
    "INCLUDEALL", "EXCLUDEALL", "RESERVE", "MAX"
]);

/**
 * Validate individual directive fields (required fields, valid client types, etc.).
 */
export function validate(state) {
    const results = [];

    for (const d of state.document.directives) {
        // Product name required for product-specific directives.
        if (PRODUCT_DIRECTIVE_TYPES.has(d.type)) {
            const name = d.productName;
            if (!name || !name.trim()) {
                results.push({
                    severity: "error",
                    directiveId: d.uid,
                    message: `${d.type} line is missing a product name.`
                });
            }
        }

        // Client type and client specified required for client directives.
        if (CLIENT_DIRECTIVE_TYPES.has(d.type)) {
            if (!d.clientType || !VALID_CLIENT_TYPES.has(d.clientType)) {
                results.push({
                    severity: "error",
                    directiveId: d.uid,
                    message: `${d.type} line has an invalid client type: "${d.clientType || "(empty)"}".`
                });
            }
            if (!d.clientSpecified || !d.clientSpecified.trim()) {
                results.push({
                    severity: "error",
                    directiveId: d.uid,
                    message: `${d.type} line is missing the ${d.clientType || "client"} value.`
                });
            }

            // Wildcard warning.
            if (d.clientSpecified && d.clientSpecified.includes("*")) {
                results.push({
                    severity: "warning",
                    directiveId: d.uid,
                    message: `Wildcard used in ${d.type} line. Wildcards may be unreliable.`
                });
            }

            // IP address warning.
            if (d.clientSpecified && /\d{2,3}\./.test(d.clientSpecified)) {
                results.push({
                    severity: "warning",
                    directiveId: d.uid,
                    message: `IP address used in ${d.type} line. IP addresses are often dynamic and unreliable.`
                });
            }
        }

        // RESERVE: seat count must be positive integer.
        if (d.type === "RESERVE") {
            if (!Number.isInteger(d.seatCount) || d.seatCount <= 0) {
                results.push({
                    severity: "error",
                    directiveId: d.uid,
                    message: `RESERVE line has an invalid seat count: ${d.seatCount}.`
                });
            }
        }

        // MAX: seat count must be positive integer.
        if (d.type === "MAX") {
            if (!Number.isInteger(d.maxSeats) || d.maxSeats <= 0) {
                results.push({
                    severity: "error",
                    directiveId: d.uid,
                    message: `MAX line has an invalid seat count: ${d.maxSeats}.`
                });
            }
        }

        // GROUP / HOST_GROUP: must have at least one member.
        if (d.type === "GROUP" || d.type === "HOST_GROUP") {
            if (!d.groupName || !d.groupName.trim()) {
                results.push({
                    severity: "error",
                    directiveId: d.uid,
                    message: `${d.type} is missing a name.`
                });
            }
            if (!d.members || d.members.length === 0) {
                results.push({
                    severity: "error",
                    directiveId: d.uid,
                    message: `${d.type} "${d.groupName}" has no members.`
                });
            }
        }

        // MATLAB Parallel Server info.
        if (d.productName === "MATLAB_Distrib_Comp_Engine") {
            results.push({
                severity: "info",
                directiveId: d.uid,
                message: "MATLAB Parallel Server: the username must correspond to the cluster username. This does not prevent users from accessing the cluster."
            });
        }
    }

    return results;
}
