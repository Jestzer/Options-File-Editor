import { masterProductsSet } from "../data/masterProductsList.js";

/**
 * Validate product names on directives against the master list and the loaded license file.
 */
export function validate(state) {
    const results = [];
    const licenseProductNames = state.licenseData.isLoaded
        ? new Set(state.licenseData.getProductNames().map(n => n.toLowerCase()))
        : null;

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
    }

    return results;
}
