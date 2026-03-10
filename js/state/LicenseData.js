export class LicenseProduct {
    constructor({ productName, seatCount, productKey, licenseOffering, licenseNumber, expirationDate, borrowingEnabled }) {
        this.productName = productName;
        this.seatCount = seatCount;
        this.originalSeatCount = seatCount;
        this.productKey = productKey;
        this.licenseOffering = licenseOffering;
        this.licenseNumber = licenseNumber;
        this.expirationDate = expirationDate;
        this.borrowingEnabled = borrowingEnabled ?? false;
    }
}

export class LicenseData {
    constructor() {
        this.products = [];
        this.serverLineHasPort = true;
        this.daemonLineHasPort = true;
        this.daemonPortIsCnuFriendly = false;
        this.isLoaded = false;
        this.rawText = null;
        this.isModified = false;
    }

    setServerPort(port) {
        if (!this.rawText) return;
        const lines = this.rawText.split(/(\r\n|\r|\n)/);
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("SERVER")) {
                const parts = lines[i].split(" ").filter(p => p.trim());
                if (parts.length === 3) {
                    lines[i] = lines[i].trimEnd() + " " + port;
                }
            }
        }
        this.rawText = lines.join("");
        this.serverLineHasPort = true;
        this.isModified = true;
    }

    setDaemonPort(port) {
        if (!this.rawText) return;
        const lines = this.rawText.split(/(\r\n|\r|\n)/);
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith("DAEMON") || trimmed.startsWith("VENDOR")) {
                if (!lines[i].toLowerCase().includes("port=")) {
                    lines[i] = lines[i].trimEnd() + " port=" + port;
                }
            }
        }
        this.rawText = lines.join("");
        this.daemonLineHasPort = true;
        this.isModified = true;
    }

    getProductNames() {
        const names = new Set(this.products.map(p => p.productName));
        return [...names].sort();
    }

    getProductsByName(name) {
        return this.products.filter(p => p.productName.toLowerCase() === name.toLowerCase());
    }

    getTotalSeats(name) {
        return this.getProductsByName(name).reduce((sum, p) => sum + p.originalSeatCount, 0);
    }

    getLicenseNumbers() {
        const nums = new Set(this.products.map(p => p.licenseNumber).filter(Boolean));
        return [...nums];
    }

    getProductKeysForProduct(name) {
        return this.getProductsByName(name).map(p => p.productKey).filter(Boolean);
    }

    getLicenseEntriesForProduct(name) {
        return this.getProductsByName(name).map(p => ({
            licenseNumber: p.licenseNumber,
            productKey: p.productKey,
            licenseOffering: p.licenseOffering,
            seatCount: p.originalSeatCount
        }));
    }

    hasNnuProducts() {
        return this.products.some(p => p.licenseOffering === "NNU");
    }

    isNnuOnly() {
        return this.products.length > 0 && this.products.every(p => p.licenseOffering === "NNU");
    }
}
