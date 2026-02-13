/**
 * Validate NNU-specific rules:
 *   - NNU-only licenses must have at least one INCLUDE with USER or GROUP.
 *   - NNU products should not use INCLUDEALL (can't count users).
 */
export function validate(state) {
    const results = [];

    if (!state.licenseData.isLoaded) return results;

    const isNnuOnly = state.licenseData.isNnuOnly();
    const hasNnu = state.licenseData.hasNnuProducts();
    const doc = state.document;

    if (isNnuOnly) {
        const includes = doc.getByType("INCLUDE");

        if (includes.length === 0) {
            results.push({
                severity: "error",
                directiveId: null,
                message: "NNU-only license: you must have at least one INCLUDE line."
            });
        } else {
            const hasUserOrGroup = includes.some(d =>
                d.clientType === "USER" || d.clientType === "GROUP"
            );
            if (!hasUserOrGroup) {
                results.push({
                    severity: "error",
                    directiveId: null,
                    message: "NNU-only license: at least one INCLUDE line must use USER or GROUP client type."
                });
            }
        }
    }

    // Warn about INCLUDEALL with NNU products.
    if (hasNnu) {
        const includeAlls = doc.getByType("INCLUDEALL");
        for (const d of includeAlls) {
            results.push({
                severity: "warning",
                directiveId: d.uid,
                message: "INCLUDEALL does not apply to NNU products. NNU seats will not be subtracted for this line."
            });
        }
    }

    // Check NNU products used with non-USER/GROUP client types.
    if (hasNnu) {
        const nnuProductNames = new Set(
            state.licenseData.products
                .filter(p => p.licenseOffering === "NNU")
                .map(p => p.productName.toLowerCase())
        );

        for (const d of doc.directives) {
            if (!d.productName) continue;
            if (!nnuProductNames.has(d.productName.toLowerCase())) continue;
            if (d.type !== "INCLUDE" && d.type !== "INCLUDE_BORROW") continue;

            if (d.clientType !== "USER" && d.clientType !== "GROUP") {
                results.push({
                    severity: "warning",
                    directiveId: d.uid,
                    message: `NNU product "${d.productName}" should use USER or GROUP client type, not ${d.clientType}.`
                });
            }
        }
    }

    return results;
}
