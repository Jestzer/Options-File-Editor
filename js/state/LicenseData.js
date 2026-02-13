export class LicenseProduct {
    constructor({ productName, seatCount, productKey, licenseOffering, licenseNumber, expirationDate }) {
        this.productName = productName;
        this.seatCount = seatCount;
        this.originalSeatCount = seatCount;
        this.productKey = productKey;
        this.licenseOffering = licenseOffering;
        this.licenseNumber = licenseNumber;
        this.expirationDate = expirationDate;
    }
}

export class LicenseData {
    constructor() {
        this.products = [];
        this.serverLineHasPort = true;
        this.daemonLineHasPort = true;
        this.daemonPortIsCnuFriendly = false;
        this.isLoaded = false;
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
