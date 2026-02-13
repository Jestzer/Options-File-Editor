import { EditorState } from "./state/EditorState.js";
import { ValidationEngine } from "./validation/validationEngine.js";
import { initToolbar } from "./ui/toolbar.js";
import { initLicensePanel } from "./ui/licensePanel.js";
import { initDirectiveList } from "./ui/directiveList.js";
import { initDirectiveEditor } from "./ui/directiveEditor.js";
import { initValidationPanel } from "./ui/validationPanel.js";

// --- Bootstrap ---
const state = new EditorState();
const validationEngine = new ValidationEngine(state);

// --- Initialize UI ---
initToolbar(state);
initLicensePanel(state);

// Directive editor needs a reference to the list (for clearing selection).
let directiveList;
const editor = initDirectiveEditor(state, {
    get directiveList() { return directiveList; }
});

directiveList = initDirectiveList(state, {
    onSelectDirective(directive) {
        editor.showForm(directive);
    }
});

initValidationPanel(state, { directiveList });
