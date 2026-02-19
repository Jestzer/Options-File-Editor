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

    // Check if any NNU products have no users assigned via INCLUDE.
    if (hasNnu) {
        const nnuProductNames = new Set(
            state.licenseData.products
                .filter(p => p.licenseOffering === "NNU")
                .map(p => p.productName)
        );

        const includes = doc.getByType("INCLUDE");

        for (const nnuProduct of nnuProductNames) {
            const hasAssignment = includes.some(d =>
                d.productName === nnuProduct &&
                (d.clientType === "USER" || d.clientType === "GROUP")
            );

            if (!hasAssignment) {
                results.push({
                    severity: "warning",
                    directiveId: null,
                    message: `NNU product "${nnuProduct}" has no seats assigned. NNU products require INCLUDE lines with USER or GROUP to assign seats.`
                });
            }
        }
    }

    // Warn when an INCLUDE targets an NNU product that exists on multiple licenses
    // but does not specify a license number, causing ambiguous seat subtraction.
    if (hasNnu) {
        const nnuProducts = state.licenseData.products.filter(p => p.licenseOffering === "NNU");

        // Map product name (lowercase) → set of license numbers.
        const nnuLicenseCounts = new Map();
        for (const p of nnuProducts) {
            const key = p.productName.toLowerCase();
            if (!nnuLicenseCounts.has(key)) {
                nnuLicenseCounts.set(key, new Set());
            }
            nnuLicenseCounts.get(key).add(p.licenseNumber);
        }

        // Only care about products on 2+ licenses.
        const multiLicenseNnuProducts = new Map(
            [...nnuLicenseCounts].filter(([, nums]) => nums.size > 1)
        );

        if (multiLicenseNnuProducts.size > 0) {
            const includes = doc.getByType("INCLUDE");
            for (const d of includes) {
                if (!d.productName) continue;
                if (d.clientType !== "USER" && d.clientType !== "GROUP") continue;
                if (!multiLicenseNnuProducts.has(d.productName.toLowerCase())) continue;
                if (d.licenseNumber) continue; // Already qualified — no ambiguity.

                const licenseCount = multiLicenseNnuProducts.get(d.productName.toLowerCase()).size;
                results.push({
                    severity: "warning",
                    directiveId: d.uid,
                    message: `NNU product "${d.productName}" exists on ${licenseCount} licenses. This INCLUDE does not specify a license number, so seats will be subtracted from all of them.`
                });
            }
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

    // Suggest MAX directives for users INCLUDEd on NNU products.
    if (hasNnu) {
        const nnuProductNames = new Set(
            state.licenseData.products
                .filter(p => p.licenseOffering === "NNU")
                .map(p => p.productName)
        );

        const includes = doc.getByType("INCLUDE");
        const existingMaxDirectives = doc.getByType("MAX");
        const groups = doc.getGroups();
        const missingMaxDirectives = [];

        for (const d of includes) {
            if (!d.productName || !nnuProductNames.has(d.productName)) continue;

            // Use MAX 1 if the product only has 1 seat, otherwise MAX 2.
            const totalSeats = state.licenseData.getTotalSeats(d.productName);
            const maxSeatsToUse = totalSeats <= 1 ? 1 : 2;

            if (d.clientType === "USER") {
                // Check if a MAX line already exists for this user + product.
                const hasMax = existingMaxDirectives.some(m =>
                    m.productName === d.productName &&
                    m.clientType === "USER" &&
                    m.clientSpecified === d.clientSpecified
                );

                if (!hasMax) {
                    missingMaxDirectives.push({
                        type: "MAX",
                        maxSeats: maxSeatsToUse,
                        productName: d.productName,
                        clientType: "USER",
                        clientSpecified: d.clientSpecified
                    });
                }
            } else if (d.clientType === "GROUP") {
                // Find the group and check each member.
                const group = groups.find(g => g.groupName === d.clientSpecified);
                if (!group || !group.members) continue;

                for (const member of group.members) {
                    const hasMax = existingMaxDirectives.some(m =>
                        m.productName === d.productName &&
                        m.clientType === "USER" &&
                        m.clientSpecified === member
                    );

                    if (!hasMax) {
                        // Avoid duplicates in the suggestion list.
                        const alreadySuggested = missingMaxDirectives.some(m =>
                            m.productName === d.productName &&
                            m.clientSpecified === member
                        );

                        if (!alreadySuggested) {
                            missingMaxDirectives.push({
                                type: "MAX",
                                maxSeats: maxSeatsToUse,
                                productName: d.productName,
                                clientType: "USER",
                                clientSpecified: member
                            });
                        }
                    }
                }
            }
        }

        if (missingMaxDirectives.length > 0) {
            const userWord = missingMaxDirectives.length === 1 ? "user" : "users";
            results.push({
                severity: "suggestion",
                directiveId: null,
                message: `NNU: ${missingMaxDirectives.length} ${userWord} across NNU products are missing MAX seat limits. Adding MAX lines prevents users from hogging seats.`,
                action: {
                    label: "Add MAX lines",
                    directives: missingMaxDirectives
                }
            });
        }
    }

    return results;
}
