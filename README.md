# Options File Editor

A browser-based editor for creating and modifying FlexLM options files (`.opt`) used with MathWorks license files. Load your license file to enforce rules like seat counts, valid product names, and NNU restrictions while editing.

This project is **not affiliated with MathWorks**. It was created to help license administrators manage their options files more easily.

## Features

- **Create** new options files from scratch or **edit** existing `.opt` files
- **License-aware editing**: loads your `.lic`/`.dat` file to constrain product dropdowns to only licensed products, show seat counts, and validate license numbers
- **All FlexLM directives**: INCLUDE, EXCLUDE, INCLUDE_BORROW, EXCLUDE_BORROW, INCLUDEALL, EXCLUDEALL, RESERVE, MAX, GROUP, HOST_GROUP, GROUPCASEINSENSITIVE
- **Real-time validation** as you edit:
  - Product name verification against 222+ MathWorks products
  - GROUP/HOST_GROUP reference integrity
  - Seat overdraft detection (error for NNU, warning for CN)
  - NNU-specific rules (must have INCLUDE with USER or GROUP, multi-license ambiguity)
  - Duplicate INCLUDE detection
  - INCLUDE + EXCLUDE conflict detection (respects license numbers and product keys)
  - INCLUDE_BORROW without a corresponding INCLUDE
  - RESERVE consuming all available seats
  - MAX exceeding license seat count
  - Expired product warnings
  - Borrow directives on NNU products (not applicable)
  - Wildcard and IP address warnings
- **Seat usage summary** with visual progress bars per product
- **Export** to a properly formatted `.opt` file

## Getting Started

This is a vanilla JavaScript project with no build tools or dependencies. It uses ES modules, which require the files to be served over HTTP (not opened directly via `file://`).

### Option 1: Python (built-in on macOS/Linux)

```bash
cd Options-File-Editor
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080) in your browser.

### Option 2: VS Code Live Server

If you use VS Code, install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension, open the project folder, and click "Go Live" in the status bar.

### Option 3: Any static file server

Any HTTP server that serves static files will work (e.g., `npx serve`, Nginx, Apache).

## Testing

Tests use [Vitest](https://vitest.dev/). Install dependencies and run:

```bash
npm install
npm test
```

## Usage

1. **Load a license file** (`.lic` or `.dat`) using the "Load License" button in the toolbar. This populates the left panel with your licensed products and enables license-aware validation.
2. **Create directives** by clicking "+ Add Directive" in the center panel. Select a directive type, fill in the fields, and click "Add".
3. **Or load an existing options file** (`.opt`) using the "Load Options" button. All directives will appear in the center panel for editing.
4. **Edit directives** by clicking on them in the list. The right panel shows a form with the directive's current values.
5. **Review validation** results in the bottom-right panel. Errors and warnings update in real time as you make changes.
6. **Export** your finished options file by clicking "Export .opt". The file will download to your browser's default download location.

## Project Structure

```
Options-File-Editor/
├── index.html              # Single-page application
├── css/                    # Styling (dark theme)
│   ├── main.css            # Layout, panels
│   ├── forms.css           # Form controls, directive rows
│   ├── validation.css      # Error/warning/info styles
│   └── modal.css           # Modal dialog
├── js/
│   ├── app.js              # Entry point
│   ├── version.js          # App version constant
│   ├── data/
│   │   └── masterProductsList.js   # 222+ MathWorks product names
│   ├── state/
│   │   ├── EditorState.js          # Central state and event bus
│   │   ├── LicenseData.js          # Parsed license file model
│   │   └── OptionsDocument.js      # Editable directive list
│   ├── parsers/
│   │   ├── licenseFileParser.js    # Parses .lic/.dat files
│   │   └── optionsFileParser.js    # Parses .opt files
│   ├── validation/
│   │   ├── validationEngine.js     # Orchestrates all validators
│   │   ├── productValidator.js     # Product name and expiration validation
│   │   ├── directiveValidator.js   # Field-level and cross-directive validation
│   │   ├── groupValidator.js       # GROUP/HOST_GROUP references
│   │   ├── seatCalculator.js       # Seat subtraction logic
│   │   └── nnuValidator.js         # NNU-specific rules
│   ├── export/
│   │   └── optionsFileExporter.js  # Generates .opt file text
│   ├── ui/                         # UI modules
│   │   ├── toolbar.js
│   │   ├── licensePanel.js
│   │   ├── directiveList.js
│   │   ├── directiveEditor.js
│   │   ├── groupEditor.js
│   │   ├── seatSummaryPanel.js
│   │   ├── validationPanel.js
│   │   └── modal.js
│   └── util/
│       ├── eventBus.js     # Pub/sub event system
│       ├── uid.js          # Unique ID generator
│       └── dateParser.js   # Date parsing utility
└── tests/
    ├── helpers.js                  # Shared test utilities
    ├── dateParser.test.js
    ├── directiveValidator.test.js
    ├── groupValidator.test.js
    ├── licenseFileParser.test.js
    ├── nnuValidator.test.js
    ├── optionsFileExporter.test.js
    ├── optionsFileParser.test.js
    ├── productValidator.test.js
    └── seatCalculator.test.js
```

## Browser Compatibility

Works in all modern browsers that support ES modules (Chrome, Firefox, Safari, Edge). No Internet Explorer support.

## License

See LICENSE file for details.
