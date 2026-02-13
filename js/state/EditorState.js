import { EventBus } from "../util/eventBus.js";
import { LicenseData } from "./LicenseData.js";
import { OptionsDocument } from "./OptionsDocument.js";

export class EditorState {
    constructor() {
        this._bus = new EventBus();
        this.licenseData = new LicenseData();
        this.document = new OptionsDocument();
        this.validationResults = [];
        this.seatSummary = {};

        // Forward document changes to the event bus.
        this.document.onChange((changeType, directive) => {
            this.emit("document-changed", { changeType, directive });
        });
    }

    on(event, handler) {
        return this._bus.on(event, handler);
    }

    emit(event, data) {
        this._bus.emit(event, data);
    }

    setLicenseData(licenseData) {
        this.licenseData = licenseData;
        this.emit("license-loaded", licenseData);
    }

    setValidationResults(results) {
        this.validationResults = results;
        this.emit("validation-complete", results);
    }

    setSeatSummary(summary) {
        this.seatSummary = summary;
        this.emit("seat-summary-updated", summary);
    }
}
