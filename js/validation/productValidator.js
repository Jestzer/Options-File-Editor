import { masterProductsSet } from "../data/masterProductsList.js";

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
            results.push({
                severity: "error",
                directiveId: directive.uid,
                message: `"${productName}" is not a recognized MathWorks product.`
            });
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
