import { LicenseData, LicenseProduct } from "../state/LicenseData.js";
import { parseDdMmmYyyy } from "../util/dateParser.js";

/**
 * Parse a FlexLM/MathWorks license file (.lic/.dat) into a LicenseData model.
 * Returns { licenseData, warnings, error }.
 *   - licenseData: populated LicenseData on success, null on error
 *   - warnings: array of warning strings
 *   - error: string on failure, null on success
 */
export function parseLicenseFile(rawText) {
    const warnings = [];

    if (!rawText || !rawText.trim()) {
        return { licenseData: null, warnings, error: "The license file is empty." };
    }

    // Remove line continuations and tabs.
    let text = rawText
        .replace(/\\\r\n/g, "")
        .replace(/\\\n\t/g, "")
        .replace(/\\\n/g, "")
        .replace(/\t/g, "");

    const lines = text.split(/\r\n|\r|\n/);

    // Quick sanity checks on the full text.
    if (!text.includes("INCREMENT")) {
        return { licenseData: null, warnings, error: "The license file does not contain any products (no INCREMENT lines found)." };
    }

    if (text.includes("lo=IN") || text.includes("lo=DC") || text.includes("lo=CIN")) {
        return {
            licenseData: null, warnings,
            error: "The license file contains an Individual or Designated Computer license, which cannot use an options file."
        };
    }

    if (text.includes("CONTRACT_ID=")) {
        return { licenseData: null, warnings, error: "The license file contains at least one non-MathWorks product." };
    }

    const licenseData = new LicenseData();
    let serverLineCount = 0;
    let daemonLineCount = 0;
    let productLinesHaveBeenReached = false;
    let containsPLP = false;
    let plpLicenseNumber = "";

    const assetInfoWithNumberRegex = /asset_info=(\S+)/i;
    const licenseNumberSnRegex = /SN=(\S+)/i;
    const licenseNumberInvalidRegex = /^[^Rab_\d]+$/;

    for (let i = 0; i < lines.length; i++) {
        const currentLine = lines[i];
        const trimmed = currentLine.trim();

        // --- SERVER line ---
        if (trimmed.startsWith("SERVER")) {
            if (productLinesHaveBeenReached) {
                return { licenseData: null, warnings, error: "The SERVER line(s) are listed after a product." };
            }
            serverLineCount++;
            const parts = currentLine.split(" ").filter(p => p.trim());

            if (parts[0] !== "SERVER") {
                return { licenseData: null, warnings, error: "A line starts with SERVER but does not have the correct format." };
            }

            const hostID = parts[2];

            if (hostID === "27000" || hostID === "27001" || hostID === "27010") {
                return {
                    licenseData: null, warnings,
                    error: "You have likely omitted your Host ID and attempted to specify a SERVER port number."
                };
            }

            switch (parts.length) {
                case 0:
                case 1:
                case 2:
                    return { licenseData: null, warnings, error: "The SERVER line is missing required information." };
                case 3:
                    licenseData.serverLineHasPort = false;
                    break;
                case 4: {
                    const serverPort = Number(parts[3]);
                    if (!Number.isInteger(serverPort)) {
                        return { licenseData: null, warnings, error: "The SERVER line has stray information." };
                    }
                    if (!hostID.includes("INTERNET=") && hostID.length !== 12) {
                        return { licenseData: null, warnings, error: "The Host ID on the SERVER line is not specified correctly." };
                    }
                    break;
                }
                case 5:
                    if (parts[4] !== "") {
                        return { licenseData: null, warnings, error: "The SERVER line has stray information." };
                    }
                    break;
                default:
                    return { licenseData: null, warnings, error: "The SERVER line has stray information." };
            }
            continue;
        }

        // --- DAEMON / VENDOR line ---
        if (trimmed.startsWith("DAEMON") || trimmed.startsWith("VENDOR")) {
            if (productLinesHaveBeenReached) {
                return { licenseData: null, warnings, error: "The DAEMON line is listed after a product." };
            }
            daemonLineCount++;
            if (daemonLineCount > 1) {
                return { licenseData: null, warnings, error: "There is more than one DAEMON line." };
            }

            const portMatches = (currentLine.match(/port=/gi) || []).length;
            const optionsMatches = (currentLine.match(/options=/gi) || []).length;
            const commentedBegin = (currentLine.match(/# BEGIN--------------/gi) || []).length;

            if (currentLine.includes("PORT=")) {
                licenseData.daemonPortIsCnuFriendly = true;
            }

            if (commentedBegin > 0) {
                return { licenseData: null, warnings, error: "The DAEMON line has content that is intended to be commented out." };
            }
            if (portMatches > 1) {
                return { licenseData: null, warnings, error: "More than one port number is specified for MLM." };
            }
            if (optionsMatches > 1) {
                return { licenseData: null, warnings, error: "The path to more than one options file is specified." };
            }
            if (optionsMatches === 0) {
                return {
                    licenseData: null, warnings,
                    error: "The path to the options file is not specified. Use options= to specify it."
                };
            }

            const parts = currentLine.split(" ");

            if (parts.length === 1) {
                return { licenseData: null, warnings, error: "The DAEMON line does not specify the vendor daemon (MLM) or its path." };
            }

            const vendor = parts[1];
            if (!vendor || !vendor.trim()) {
                return { licenseData: null, warnings, error: "There are too many spaces between DAEMON and MLM." };
            }
            if (vendor !== "MLM") {
                return {
                    licenseData: null, warnings,
                    error: "The vendor daemon is not specified as \"MLM\" exactly (must be uppercase)."
                };
            }

            if (parts.length === 2) {
                return { licenseData: null, warnings, error: "The path to the vendor daemon MLM is not specified." };
            }
            if (parts.length === 3) {
                return { licenseData: null, warnings, error: "The path to the options file is not specified." };
            }

            if (optionsMatches === 1 && portMatches > 0) {
                licenseData.daemonLineHasPort = true;
            } else if (portMatches === 0) {
                licenseData.daemonLineHasPort = false;
            }
            continue;
        }

        // --- INCREMENT (product) line ---
        if (trimmed.startsWith("INCREMENT")) {
            productLinesHaveBeenReached = true;
            const parts = currentLine.split(" ").filter(p => p.trim());

            const productName = parts[1];
            const productVersion = Number(parts[3]);
            let expirationDateStr = parts[4];
            const rawSeatCount = String(Number(parts[5]));
            let seatCount = Number(parts[5]);
            const productKey = parts[6]?.trim() || "";

            // Product key validation.
            if (productKey.length > 20) {
                return {
                    licenseData: null, warnings,
                    error: `The product key for ${productName} is greater than 20 characters long and is likely tampered with.`
                };
            }
            if (productKey.length < 10) {
                return {
                    licenseData: null, warnings,
                    error: `The product key for ${productName} is shorter than 10 characters and is likely tampered with.`
                };
            }

            // License number extraction.
            let licenseNumber = "";

            if (currentLine.includes("asset_info=")) {
                const match = currentLine.match(assetInfoWithNumberRegex);
                if (match) licenseNumber = match[1];
            } else if (currentLine.includes("SN=")) {
                const match = currentLine.match(licenseNumberSnRegex);
                if (match) licenseNumber = match[1];
                if (productName === "TMW_Archive") {
                    containsPLP = true;
                    plpLicenseNumber = licenseNumber;
                    continue;
                }
            } else if (containsPLP && productName.includes("PolySpace")) {
                licenseNumber = plpLicenseNumber;
            } else {
                if (!licenseNumber) {
                    return {
                        licenseData: null, warnings,
                        error: `The license number was not found for product ${productName} with product key ${productKey}. The license file may be tampered with.`
                    };
                }
            }

            // License offering detection.
            let licenseOffering = "";

            if (currentLine.includes("lo=")) {
                if (currentLine.includes("lo=CN:")) {
                    licenseOffering = "lo=CN";
                } else if (currentLine.includes("lo=CNU")) {
                    licenseOffering = "CNU";
                } else if (currentLine.includes("lo=NNU")) {
                    licenseOffering = "NNU";
                } else if (currentLine.includes("lo=TH")) {
                    if (!currentLine.includes("USER_BASED")) {
                        licenseOffering = "lo=CN";
                    } else {
                        return {
                            licenseData: null, warnings,
                            error: `${productName}'s license offering is Total Headcount with USER_BASED, which is invalid.`
                        };
                    }
                } else {
                    return { licenseData: null, warnings, error: `Product ${productName} has an invalid license offering.` };
                }
            } else if (currentLine.includes("lr=") || containsPLP || !currentLine.includes("asset_info=")) {
                if (seatCount > 0) {
                    if (currentLine.includes("USER_BASED")) {
                        licenseOffering = "NNU";
                    } else {
                        if (containsPLP && !currentLine.includes("asset_info=") && !currentLine.includes("ISSUED=")) {
                            licenseOffering = "lo=DC";
                        } else {
                            licenseOffering = "lo=CN";
                        }
                    }
                } else if (containsPLP && !currentLine.includes("asset_info=")) {
                    licenseOffering = "lo=IN";
                    seatCount = 1;
                } else {
                    return {
                        licenseData: null, warnings,
                        error: `Product ${productName} comes from an Individual or Designated Computer license, which cannot use an options file.`
                    };
                }
            } else {
                if (currentLine.includes("PLATFORMS=x")) {
                    return {
                        licenseData: null, warnings,
                        error: `Product ${productName} comes from a Designated Computer license generated from a PLP on Windows, which cannot use an options file.`
                    };
                } else {
                    if (productKey.length === 20) {
                        if (!text.includes("TMW_Archive")) {
                            return {
                                licenseData: null, warnings,
                                error: "The license file is either a Windows Individual license from a PLP or is missing the TMW_Archive product for pre-R2008a products."
                            };
                        } else {
                            licenseOffering = "lo=DC";
                            containsPLP = true;
                        }
                    } else {
                        return { licenseData: null, warnings, error: `Product ${productName} has an invalid license offering.` };
                    }
                }
            }

            // Expiration date check.
            if (expirationDateStr === "01-jan-0000") {
                expirationDateStr = "01-jan-2999"; // Perpetual.
            }
            const expirationDate = parseDdMmmYyyy(expirationDateStr);
            if (!expirationDate) {
                return { licenseData: null, warnings, error: `Could not parse the expiration date for ${productName}: ${expirationDateStr}` };
            }
            const today = new Date(new Date().toDateString());
            if (expirationDate < today) {
                return {
                    licenseData: null, warnings,
                    error: `Product ${productName} on license ${licenseNumber} expired on ${expirationDateStr}.`
                };
            }

            // NNU seat halving.
            if (licenseOffering === "NNU") {
                if (seatCount !== 1 && !containsPLP) {
                    seatCount = Math.floor(seatCount / 2);
                }
            }

            // Special case checks.
            if (licenseOffering === "lo=CN" && seatCount === 0 && licenseNumber === "220668") {
                if ((productVersion <= 18) || (productName.includes("Polyspace") && productVersion <= 22)) {
                    return { licenseData: null, warnings, error: `License ${licenseNumber} contains a Designated Computer license incorrectly labeled as Concurrent.` };
                } else {
                    return { licenseData: null, warnings, error: `Product ${productName} on license ${licenseNumber} expired on ${expirationDateStr}.` };
                }
            }

            if (rawSeatCount === "uncounted") {
                return {
                    licenseData: null, warnings,
                    error: `The license contains an Individual or Designated Computer license (uncounted seats) on license ${licenseNumber}.`
                };
            }

            if (seatCount < 1 && currentLine.includes("asset_info=")) {
                return { licenseData: null, warnings, error: `${productName} on license ${licenseNumber} has a seat count of zero or less.` };
            }

            if (seatCount === 0 && containsPLP && licenseOffering === "lo=DC") {
                seatCount = 1;
            }

            if (seatCount === 0) {
                return { licenseData: null, warnings, error: `The seat count for ${productName} on license ${licenseNumber} is zero. The license file may be tampered with.` };
            }

            // Validate collected values.
            if (!productName || !productName.trim()) {
                return { licenseData: null, warnings, error: `A product name is blank on license ${licenseNumber}.` };
            }
            if (!licenseNumber || !licenseNumber.trim() || licenseNumberInvalidRegex.test(licenseNumber)) {
                if (licenseNumber === "DEMO") {
                    return { licenseData: null, warnings, error: `Invalid license number detected for trial license of ${productName}. Please regenerate.` };
                }
                return { licenseData: null, warnings, error: `Invalid license number "${licenseNumber}" detected for ${productName}.` };
            }
            if (!licenseOffering || !licenseOffering.trim()) {
                return { licenseData: null, warnings, error: `Could not detect a license offering for ${productName} on license ${licenseNumber}.` };
            }
            if (!productKey || !productKey.trim()) {
                return { licenseData: null, warnings, error: `Could not detect a product key for ${productName} on license ${licenseNumber}.` };
            }
            if (productName === "MATLAB_Distrib_Comp_Engine" && licenseOffering === "NNU") {
                return {
                    licenseData: null, warnings,
                    error: "MATLAB Parallel Server is registered as NNU, which is not possible. Please regenerate this license."
                };
            }

            licenseData.products.push(new LicenseProduct({
                productName,
                seatCount,
                productKey,
                licenseOffering,
                licenseNumber,
                expirationDate
            }));
            continue;
        }

        // --- Comments and blank lines ---
        if (trimmed.startsWith("#") || trimmed === "") {
            continue;
        }

        // --- USE_SERVER ---
        if (trimmed.startsWith("USE_SERVER")) {
            warnings.push("USE_SERVER was found in the license file. This line is not needed and can be removed.");
            continue;
        }

        // --- Unrecognized line ---
        return {
            licenseData: null, warnings,
            error: `Unrecognized line in the license file: "${currentLine}". The file may have been manually edited and may need to be regenerated.`
        };
    }

    // Post-loop validation.
    if (serverLineCount > 3 || serverLineCount === 2) {
        return { licenseData: null, warnings, error: "The license file has an invalid number of SERVER lines. Only 1 or 3 are accepted." };
    }
    if (serverLineCount === 0) {
        return { licenseData: null, warnings, error: "The license file has no SERVER lines." };
    }

    // Generate warnings.
    if (!licenseData.serverLineHasPort) {
        warnings.push("No port number specified on the SERVER line.");
    }
    if (!licenseData.daemonLineHasPort) {
        warnings.push("No port number specified on the DAEMON line. A random port will be chosen each time FlexLM restarts.");
    }

    licenseData.isLoaded = true;
    return { licenseData, warnings, error: null };
}
