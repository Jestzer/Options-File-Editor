import { LicenseData, LicenseProduct } from "../js/state/LicenseData.js";
import { OptionsDocument } from "../js/state/OptionsDocument.js";

/**
 * Build a minimal state object that validators and the seat calculator expect.
 * @param {Array} licenseProducts — array of LicenseProduct-like objects (or overrides)
 * @param {Array} directives — array of directive objects
 * @returns state-like object with licenseData, document, and setSeatSummary
 */
export function buildState(licenseProducts = [], directives = []) {
    const licenseData = new LicenseData();
    for (const p of licenseProducts) {
        licenseData.products.push(new LicenseProduct({
            productName: p.productName ?? "MATLAB",
            seatCount: p.seatCount ?? 5,
            productKey: p.productKey ?? "ABCDEFghij12",
            licenseOffering: p.licenseOffering ?? "lo=CN",
            licenseNumber: p.licenseNumber ?? "123456",
            expirationDate: p.expirationDate ?? new Date(2999, 0, 1),
        }));
    }
    if (licenseProducts.length > 0) {
        licenseData.isLoaded = true;
    }

    const document = new OptionsDocument();
    document.replaceAll(directives);

    let seatSummary = {};

    return {
        licenseData,
        document,
        seatSummary,
        setSeatSummary(s) { seatSummary = s; this.seatSummary = s; },
    };
}

/**
 * Shorthand to build a LicenseProduct override object.
 */
export function buildLicenseProduct(overrides = {}) {
    return {
        productName: "MATLAB",
        seatCount: 5,
        productKey: "ABCDEFghij12",
        licenseOffering: "lo=CN",
        licenseNumber: "123456",
        expirationDate: new Date(2999, 0, 1),
        ...overrides,
    };
}

/**
 * Shorthand to build a directive object.
 */
export function buildDirective(type, overrides = {}) {
    const base = { type, uid: overrides.uid || `test-${Math.random().toString(36).slice(2, 8)}` };

    switch (type) {
        case "INCLUDE":
        case "EXCLUDE":
        case "INCLUDE_BORROW":
        case "EXCLUDE_BORROW":
            return {
                ...base,
                productName: "MATLAB",
                licenseNumber: "",
                productKey: "",
                clientType: "USER",
                clientSpecified: "jdoe",
                ...overrides,
            };
        case "INCLUDEALL":
        case "EXCLUDEALL":
            return {
                ...base,
                clientType: "USER",
                clientSpecified: "jdoe",
                ...overrides,
            };
        case "RESERVE":
            return {
                ...base,
                seatCount: 1,
                productName: "MATLAB",
                licenseNumber: "",
                productKey: "",
                clientType: "USER",
                clientSpecified: "jdoe",
                ...overrides,
            };
        case "MAX":
            return {
                ...base,
                maxSeats: 2,
                productName: "MATLAB",
                clientType: "USER",
                clientSpecified: "jdoe",
                ...overrides,
            };
        case "GROUP":
            return {
                ...base,
                groupName: "matlab_users",
                members: ["alice", "bob"],
                ...overrides,
            };
        case "HOST_GROUP":
            return {
                ...base,
                groupName: "lab_machines",
                members: ["host1", "host2"],
                ...overrides,
            };
        case "GROUPCASEINSENSITIVE":
            return { ...base, ...overrides };
        case "COMMENT":
            return { ...base, text: "A comment", ...overrides };
        default:
            return { ...base, ...overrides };
    }
}

/**
 * Build a minimal valid license file text with the given INCREMENT lines.
 * @param {Array<string>} incrementLines — raw INCREMENT lines (without line breaks)
 * @param {Object} options — optional overrides for SERVER/DAEMON
 */
export function buildLicenseText(incrementLines = [], options = {}) {
    const server = options.server ?? "SERVER myhost ABCDEF123456 27000";
    const daemon = options.daemon ?? "DAEMON MLM /path/to/mlm options=/path/to/opts.opt";
    return [server, daemon, ...incrementLines].join("\n") + "\n";
}

/**
 * Build a standard INCREMENT line for testing.
 */
export function buildIncrementLine(overrides = {}) {
    const name = overrides.productName ?? "MATLAB";
    const vendor = "MLM";
    const version = overrides.version ?? "42";
    const expiry = overrides.expiry ?? "01-jan-2999";
    const seats = overrides.seats ?? "5";
    const key = overrides.key ?? "ABCDEFghij12";
    const offering = overrides.offering ?? 'VENDOR_STRING=lo=CN:';
    const assetInfo = overrides.assetInfo ?? "asset_info=123456";
    const sign = overrides.sign ?? "SIGN=ABCD1234";

    return `INCREMENT ${name} ${vendor} ${version} ${expiry} ${seats} ${key} ${offering} ${assetInfo} ${sign}`;
}
