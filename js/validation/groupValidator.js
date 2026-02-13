const GROUP_REF_TYPES = new Set([
    "INCLUDE", "EXCLUDE", "INCLUDE_BORROW", "EXCLUDE_BORROW",
    "INCLUDEALL", "EXCLUDEALL", "RESERVE", "MAX"
]);

/**
 * Validate that GROUP and HOST_GROUP references exist in the document.
 */
export function validate(state) {
    const results = [];
    const doc = state.document;
    const caseSensitive = !doc.hasGroupCaseInsensitive();

    // Build lookup sets.
    const groupNames = new Set();
    const hostGroupNames = new Set();

    for (const g of doc.getGroups()) {
        groupNames.add(caseSensitive ? g.groupName : g.groupName.toLowerCase());
    }
    for (const hg of doc.getHostGroups()) {
        hostGroupNames.add(caseSensitive ? hg.groupName : hg.groupName.toLowerCase());
    }

    // Check all directives that reference groups.
    for (const d of doc.directives) {
        if (!GROUP_REF_TYPES.has(d.type)) continue;

        const clientSpecified = d.clientSpecified;
        if (!clientSpecified) continue;

        const lookupName = caseSensitive ? clientSpecified : clientSpecified.toLowerCase();

        if (d.clientType === "GROUP") {
            if (!groupNames.has(lookupName)) {
                results.push({
                    severity: "error",
                    directiveId: d.uid,
                    message: `GROUP "${clientSpecified}" referenced in ${d.type} does not exist. GROUP and HOST_GROUP are separate.`
                });
            }
        } else if (d.clientType === "HOST_GROUP") {
            if (!hostGroupNames.has(lookupName)) {
                results.push({
                    severity: "error",
                    directiveId: d.uid,
                    message: `HOST_GROUP "${clientSpecified}" referenced in ${d.type} does not exist. HOST_GROUP and GROUP are separate.`
                });
            }
        }
    }

    // Case sensitivity info.
    if (caseSensitive && (groupNames.size > 0 || hostGroupNames.size > 0)) {
        results.push({
            severity: "info",
            directiveId: null,
            message: "Case sensitivity is enabled for GROUPs and HOST_GROUPs. Add GROUPCASEINSENSITIVE ON to disable."
        });
    }

    return results;
}
