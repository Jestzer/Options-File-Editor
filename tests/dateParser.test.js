import { describe, it, expect } from "vitest";
import { parseDdMmmYyyy } from "../js/util/dateParser.js";

describe("parseDdMmmYyyy", () => {
    it("parses a valid date", () => {
        const d = parseDdMmmYyyy("15-jan-2025");
        expect(d).toBeInstanceOf(Date);
        expect(d.getFullYear()).toBe(2025);
        expect(d.getMonth()).toBe(0); // January
        expect(d.getDate()).toBe(15);
    });

    it("parses perpetual date 01-jan-0000", () => {
        const d = parseDdMmmYyyy("01-jan-0000");
        expect(d).toBeInstanceOf(Date);
        expect(d.getDate()).toBe(1);
        expect(d.getMonth()).toBe(0);
    });

    it("parses end-of-year date", () => {
        const d = parseDdMmmYyyy("31-dec-2999");
        expect(d).toBeInstanceOf(Date);
        expect(d.getFullYear()).toBe(2999);
        expect(d.getMonth()).toBe(11); // December
        expect(d.getDate()).toBe(31);
    });

    it("handles uppercase month abbreviations", () => {
        const d = parseDdMmmYyyy("05-MAR-2024");
        expect(d).toBeInstanceOf(Date);
        expect(d.getMonth()).toBe(2); // March
    });

    it("returns null for null input", () => {
        expect(parseDdMmmYyyy(null)).toBeNull();
    });

    it("returns null for empty string", () => {
        expect(parseDdMmmYyyy("")).toBeNull();
    });

    it("returns null for invalid format (missing parts)", () => {
        expect(parseDdMmmYyyy("01-jan")).toBeNull();
    });

    it("returns null for invalid month", () => {
        expect(parseDdMmmYyyy("01-xyz-2025")).toBeNull();
    });

    it("returns null for non-numeric day", () => {
        expect(parseDdMmmYyyy("ab-jan-2025")).toBeNull();
    });

    it("returns null for non-string input", () => {
        expect(parseDdMmmYyyy(42)).toBeNull();
    });
});
