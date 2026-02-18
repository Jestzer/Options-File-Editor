import { describe, it, expect } from "vitest";
import { parseLicenseFile } from "../js/parsers/licenseFileParser.js";
import { buildLicenseText, buildIncrementLine } from "./helpers.js";

describe("parseLicenseFile", () => {
    describe("valid license files", () => {
        it("parses a minimal valid license with one CN product", () => {
            const text = buildLicenseText([buildIncrementLine()]);
            const { licenseData, warnings, error } = parseLicenseFile(text);

            expect(error).toBeNull();
            expect(licenseData).not.toBeNull();
            expect(licenseData.products).toHaveLength(1);
            expect(licenseData.products[0].productName).toBe("MATLAB");
            expect(licenseData.products[0].seatCount).toBe(5);
            expect(licenseData.products[0].licenseOffering).toBe("lo=CN");
            expect(licenseData.products[0].licenseNumber).toBe("123456");
        });

        it("parses multiple products", () => {
            const text = buildLicenseText([
                buildIncrementLine({ productName: "MATLAB", assetInfo: "asset_info=111111" }),
                buildIncrementLine({ productName: "SIMULINK", assetInfo: "asset_info=222222" }),
            ]);
            const { licenseData, error } = parseLicenseFile(text);

            expect(error).toBeNull();
            expect(licenseData.products).toHaveLength(2);
            expect(licenseData.products[0].productName).toBe("MATLAB");
            expect(licenseData.products[1].productName).toBe("SIMULINK");
        });

        it("halves NNU seat count", () => {
            const text = buildLicenseText([
                buildIncrementLine({
                    seats: "4",
                    offering: "VENDOR_STRING=lo=NNU: USER_BASED",
                }),
            ]);
            const { licenseData, error } = parseLicenseFile(text);

            expect(error).toBeNull();
            expect(licenseData.products[0].seatCount).toBe(2);
            expect(licenseData.products[0].licenseOffering).toBe("NNU");
        });

        it("does not halve NNU seat count of 1", () => {
            const text = buildLicenseText([
                buildIncrementLine({
                    seats: "1",
                    offering: "VENDOR_STRING=lo=NNU: USER_BASED",
                }),
            ]);
            const { licenseData, error } = parseLicenseFile(text);

            expect(error).toBeNull();
            expect(licenseData.products[0].seatCount).toBe(1);
        });
    });

    describe("USE_SERVER warning", () => {
        it("warns when USE_SERVER is found", () => {
            const text = buildLicenseText([buildIncrementLine()]).replace(
                /\n(?=INCREMENT)/,
                "\nUSE_SERVER\n"
            );
            const { licenseData, warnings, error } = parseLicenseFile(text);

            expect(error).toBeNull();
            expect(licenseData).not.toBeNull();
            expect(warnings.some(w => w.includes("USE_SERVER"))).toBe(true);
        });
    });

    describe("SERVER line validation", () => {
        it("warns when SERVER has no port", () => {
            const text = buildLicenseText([buildIncrementLine()], {
                server: "SERVER myhost ABCDEF123456",
            });
            const { licenseData, warnings, error } = parseLicenseFile(text);

            expect(error).toBeNull();
            expect(licenseData.serverLineHasPort).toBe(false);
        });

        it("errors when SERVER is missing", () => {
            const text = "DAEMON MLM /path options=/path/opts.opt\n" +
                buildIncrementLine();
            const { error } = parseLicenseFile(text);

            expect(error).toBeTruthy();
        });

        it("errors when there are 2 SERVER lines", () => {
            const text = "SERVER host1 ABCDEF123456 27000\nSERVER host2 ABCDEF123456 27001\n" +
                "DAEMON MLM /path options=/path/opts.opt\n" +
                buildIncrementLine();
            const { error } = parseLicenseFile(text);

            expect(error).toBeTruthy();
            expect(error).toContain("invalid number of SERVER lines");
        });
    });

    describe("DAEMON line validation", () => {
        it("errors when DAEMON is missing MLM", () => {
            const text = "SERVER myhost ABCDEF123456 27000\nDAEMON notMLM /path options=/path.opt\n" +
                buildIncrementLine();
            const { error } = parseLicenseFile(text);

            expect(error).toBeTruthy();
            expect(error).toContain("MLM");
        });

        it("errors when options= is missing", () => {
            const text = "SERVER myhost ABCDEF123456 27000\nDAEMON MLM /path/to/mlm\n" +
                buildIncrementLine();
            const { error } = parseLicenseFile(text);

            expect(error).toBeTruthy();
            expect(error).toContain("options file");
        });
    });

    describe("license rejection", () => {
        it("rejects empty file", () => {
            const { error } = parseLicenseFile("");
            expect(error).toBeTruthy();
        });

        it("rejects file without INCREMENT lines", () => {
            const { error } = parseLicenseFile("SERVER myhost ABCDEF123456 27000\nDAEMON MLM /path options=/opts.opt\n");
            expect(error).toBeTruthy();
            expect(error).toContain("INCREMENT");
        });

        it("rejects Individual license (lo=IN)", () => {
            const text = buildLicenseText([
                buildIncrementLine({ offering: "VENDOR_STRING=lo=IN:" }),
            ]);
            const { error } = parseLicenseFile(text);

            expect(error).toBeTruthy();
            expect(error).toContain("Individual");
        });

        it("rejects Designated Computer license (lo=DC)", () => {
            const text = buildLicenseText([
                buildIncrementLine({ offering: "VENDOR_STRING=lo=DC:" }),
            ]);
            const { error } = parseLicenseFile(text);

            expect(error).toBeTruthy();
        });

        it("rejects non-MathWorks product (CONTRACT_ID)", () => {
            const text = buildLicenseText([
                buildIncrementLine() + " CONTRACT_ID=SOMETHING",
            ]);
            const { error } = parseLicenseFile(text);

            expect(error).toBeTruthy();
            expect(error).toContain("non-MathWorks");
        });
    });

    describe("product key validation", () => {
        it("rejects product key longer than 20 chars", () => {
            const text = buildLicenseText([
                buildIncrementLine({ key: "A".repeat(21) }),
            ]);
            const { error } = parseLicenseFile(text);

            expect(error).toBeTruthy();
            expect(error).toContain("greater than 20");
        });

        it("rejects product key shorter than 10 chars", () => {
            const text = buildLicenseText([
                buildIncrementLine({ key: "SHORT" }),
            ]);
            const { error } = parseLicenseFile(text);

            expect(error).toBeTruthy();
            expect(error).toContain("shorter than 10");
        });
    });

    describe("expiration", () => {
        it("rejects expired product", () => {
            const text = buildLicenseText([
                buildIncrementLine({ expiry: "01-jan-2000" }),
            ]);
            const { error } = parseLicenseFile(text);

            expect(error).toBeTruthy();
            expect(error).toContain("expired");
        });

        it("treats 01-jan-0000 as perpetual (not expired)", () => {
            const text = buildLicenseText([
                buildIncrementLine({ expiry: "01-jan-0000" }),
            ]);
            const { licenseData, error } = parseLicenseFile(text);

            expect(error).toBeNull();
            expect(licenseData.products).toHaveLength(1);
        });
    });

    describe("line continuation", () => {
        it("handles backslash-newline continuation in INCREMENT", () => {
            const line = buildIncrementLine();
            // Split the line with a backslash continuation.
            const parts = line.split(" ");
            const mid = Math.floor(parts.length / 2);
            const brokenLine = parts.slice(0, mid).join(" ") + " \\\n" + parts.slice(mid).join(" ");
            const text = buildLicenseText([brokenLine]);
            const { licenseData, error } = parseLicenseFile(text);

            expect(error).toBeNull();
            expect(licenseData.products).toHaveLength(1);
        });
    });
});
