export function downloadLicenseFile(licenseData, filename = "license.lic") {
    if (!licenseData.rawText) return;
    const blob = new Blob([licenseData.rawText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
