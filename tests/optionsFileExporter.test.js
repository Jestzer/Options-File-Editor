import { describe, it, expect } from "vitest";
import { exportOptionsFile } from "../js/export/optionsFileExporter.js";
import { parseOptionsFile } from "../js/parsers/optionsFileParser.js";
import { OptionsDocument } from "../js/state/OptionsDocument.js";
import { buildDirective } from "./helpers.js";

describe("optionsFileExporter", () => {
    describe("directive export formats", () => {
        it("exports INCLUDE with plain product", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("INCLUDE", { productName: "MATLAB", licenseNumber: "", productKey: "", clientType: "USER", clientSpecified: "jdoe" })]);
            const text = exportOptionsFile(doc);
            expect(text.trim()).toBe("INCLUDE MATLAB USER jdoe");
        });

        it("exports INCLUDE with license number", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("INCLUDE", { productName: "MATLAB", licenseNumber: "123456", productKey: "", clientType: "USER", clientSpecified: "jdoe" })]);
            const text = exportOptionsFile(doc);
            expect(text.trim()).toBe('INCLUDE "MATLAB asset_info=123456" USER jdoe');
        });

        it("exports INCLUDE with product key", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("INCLUDE", { productName: "MATLAB", licenseNumber: "", productKey: "ABCD1234", clientType: "USER", clientSpecified: "jdoe" })]);
            const text = exportOptionsFile(doc);
            expect(text.trim()).toBe('INCLUDE "MATLAB key=ABCD1234" USER jdoe');
        });

        it("exports EXCLUDE", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("EXCLUDE", { productName: "MATLAB", clientType: "HOST", clientSpecified: "badhost" })]);
            const text = exportOptionsFile(doc);
            expect(text).toContain("EXCLUDE MATLAB HOST badhost");
        });

        it("exports INCLUDEALL", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("INCLUDEALL", { clientType: "USER", clientSpecified: "jdoe" })]);
            const text = exportOptionsFile(doc);
            expect(text.trim()).toBe("INCLUDEALL USER jdoe");
        });

        it("exports EXCLUDEALL", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("EXCLUDEALL", { clientType: "GROUP", clientSpecified: "mygroup" })]);
            const text = exportOptionsFile(doc);
            expect(text.trim()).toBe("EXCLUDEALL GROUP mygroup");
        });

        it("exports RESERVE", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("RESERVE", { seatCount: 3, productName: "MATLAB", licenseNumber: "", productKey: "", clientType: "USER", clientSpecified: "jdoe" })]);
            const text = exportOptionsFile(doc);
            expect(text.trim()).toBe("RESERVE 3 MATLAB USER jdoe");
        });

        it("exports MAX", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("MAX", { maxSeats: 5, productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" })]);
            const text = exportOptionsFile(doc);
            expect(text.trim()).toBe("MAX 5 MATLAB USER jdoe");
        });

        it("exports GROUP", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("GROUP", { groupName: "team", members: ["alice", "bob", "charlie"] })]);
            const text = exportOptionsFile(doc);
            expect(text.trim()).toBe("GROUP team alice bob charlie");
        });

        it("exports HOST_GROUP", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("HOST_GROUP", { groupName: "lab", members: ["host1", "host2"] })]);
            const text = exportOptionsFile(doc);
            expect(text.trim()).toBe("HOST_GROUP lab host1 host2");
        });

        it("exports GROUPCASEINSENSITIVE ON", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("GROUPCASEINSENSITIVE")]);
            const text = exportOptionsFile(doc);
            expect(text.trim()).toBe("GROUPCASEINSENSITIVE ON");
        });

        it("exports COMMENT", () => {
            const doc = new OptionsDocument();
            doc.replaceAll([buildDirective("COMMENT", { text: "This is a comment" })]);
            const text = exportOptionsFile(doc);
            expect(text.trim()).toBe("# This is a comment");
        });
    });

    describe("roundtrip: parse → export → parse", () => {
        it("roundtrips a complex options file", () => {
            const original = [
                "GROUPCASEINSENSITIVE ON",
                "GROUP dev_team alice bob charlie",
                "HOST_GROUP lab host1 host2",
                "INCLUDE MATLAB USER jdoe",
                'INCLUDE "SIMULINK asset_info=123456" GROUP dev_team',
                "EXCLUDE MATLAB HOST badhost",
                "INCLUDEALL USER admin",
                "RESERVE 2 MATLAB USER vip",
                "MAX 5 MATLAB USER jdoe",
                "# A comment line",
            ].join("\n");

            const firstParse = parseOptionsFile(original);
            expect(firstParse.error).toBeNull();

            const exported = exportOptionsFile(firstParse.document);
            const secondParse = parseOptionsFile(exported);
            expect(secondParse.error).toBeNull();

            // Compare directive counts and types.
            const first = firstParse.document.directives;
            const second = secondParse.document.directives;
            expect(second).toHaveLength(first.length);

            for (let i = 0; i < first.length; i++) {
                expect(second[i].type).toBe(first[i].type);
                if (first[i].productName) {
                    expect(second[i].productName).toBe(first[i].productName);
                }
                if (first[i].clientSpecified) {
                    expect(second[i].clientSpecified).toBe(first[i].clientSpecified);
                }
                if (first[i].groupName) {
                    expect(second[i].groupName).toBe(first[i].groupName);
                }
                if (first[i].members) {
                    expect(second[i].members).toEqual(first[i].members);
                }
            }
        });
    });
});
