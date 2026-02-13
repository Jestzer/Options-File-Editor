import * as productValidator from "./productValidator.js";
import * as directiveValidator from "./directiveValidator.js";
import * as groupValidator from "./groupValidator.js";
import * as seatCalculator from "./seatCalculator.js";
import * as nnuValidator from "./nnuValidator.js";

export class ValidationEngine {
    constructor(editorState) {
        this.state = editorState;
        this._debounceTimer = null;

        // Run validation on every document change (debounced).
        this.state.on("document-changed", () => this._scheduleValidation());
        this.state.on("license-loaded", () => this._scheduleValidation());
    }

    _scheduleValidation() {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this.validate(), 150);
    }

    validate() {
        const results = [
            ...productValidator.validate(this.state),
            ...directiveValidator.validate(this.state),
            ...groupValidator.validate(this.state),
            ...seatCalculator.calculate(this.state),
            ...nnuValidator.validate(this.state)
        ];

        this.state.setValidationResults(results);
        return results;
    }
}
