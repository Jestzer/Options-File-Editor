import { masterProductsSet, masterProductsList } from "../data/masterProductsList.js";

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

/**
 * Validate product names on directives against the master list and the loaded license file.
 */
export function validate(state) {
    const results = [];
    const licenseProductNames = state.licenseData.isLoaded
        ? new Set(state.licenseData.getProductNames().map(n => n.toLowerCase()))
        : null;

    const expiredProductsWarned = new Set();

    for (const directive of state.document.directives) {
        const productName = directive.productName || directive.reserveProductName;
        if (!productName) continue;

        if (!masterProductsSet.has(productName)) {
            let suggestion = null;
            let isFriendlyNameMatch = false;
            if (state.licenseData.isLoaded) {
                suggestion = state.licenseData.findFlexNameByFriendlyName(productName);
                if (suggestion) isFriendlyNameMatch = true;
            }
            if (!suggestion) {
                suggestion = findClosestProduct(productName);
            }
            const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : "";
            const result = {
                severity: "error",
                directiveId: directive.uid,
                message: `"${productName}" is not a recognized MathWorks product.${suggestionText}`
            };
            if (suggestion) {
                if (!isFriendlyNameMatch) {
                    result.enteredProduct = productName;
                    result.suggestedProduct = suggestion;
                }
                result.action = { label: "Rename", type: "update", targetId: directive.uid, changes: { productName: suggestion } };
            }
            results.push(result);
        } else if (licenseProductNames && !licenseProductNames.has(productName.toLowerCase())) {
            results.push({
                severity: "error",
                directiveId: directive.uid,
                message: `"${productName}" is not in your license file.`
            });
        }

        // Validate license number / product key against license file if specified.
        if (state.licenseData.isLoaded && (directive.licenseNumber || directive.productKey)) {
            const entries = state.licenseData.getProductsByName(productName);
            if (entries.length > 0) {
                if (directive.licenseNumber) {
                    const found = entries.some(e => e.licenseNumber === directive.licenseNumber);
                    if (!found) {
                        results.push({
                            severity: "error",
                            directiveId: directive.uid,
                            message: `License number "${directive.licenseNumber}" does not exist for product "${productName}" in the license file.`
                        });
                    }
                }
                if (directive.productKey) {
                    const found = entries.some(e => e.productKey === directive.productKey);
                    if (!found) {
                        results.push({
                            severity: "error",
                            directiveId: directive.uid,
                            message: `Product key "${directive.productKey}" does not exist for product "${productName}" in the license file.`
                        });
                    }
                }
            }
        }

        // Warn about expired products (once per product name).
        if (state.licenseData.isLoaded && !expiredProductsWarned.has(productName.toLowerCase())) {
            const entries = state.licenseData.getProductsByName(productName);
            if (entries.length > 0) {
                const now = new Date();
                const allExpired = entries.every(e => e.expirationDate && e.expirationDate < now);
                if (allExpired) {
                    expiredProductsWarned.add(productName.toLowerCase());
                    results.push({
                        severity: "warning",
                        directiveId: directive.uid,
                        message: `"${productName}" has expired in the license file. Directives for this product will have no effect.`
                    });
                }
            }
        }
    }

    return results;
}
