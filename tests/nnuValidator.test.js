import { describe, it, expect } from "vitest";
import { validate } from "../js/validation/nnuValidator.js";
import { buildState, buildLicenseProduct, buildDirective } from "./helpers.js";

describe("nnuValidator", () => {
    describe("NNU-only license requirements", () => {
        it("errors when NNU-only license has no INCLUDE lines", () => {
            const state = buildState(
                [buildLicenseProduct({ licenseOffering: "NNU" })],
                [],
            );
            const results = validate(state);
            expect(results.some(r => r.severity === "error" && r.message.includes("at least one INCLUDE"))).toBe(true);
        });

        it("errors when NNU-only INCLUDE lines use HOST instead of USER/GROUP", () => {
            const state = buildState(
                [buildLicenseProduct({ licenseOffering: "NNU" })],
                [buildDirective("INCLUDE", { clientType: "HOST", clientSpecified: "myhost" })],
            );
            const results = validate(state);
            expect(results.some(r => r.severity === "error" && r.message.includes("USER or GROUP"))).toBe(true);
        });

        it("no error when NNU-only license has INCLUDE with USER", () => {
            const state = buildState(
                [buildLicenseProduct({ licenseOffering: "NNU" })],
                [buildDirective("INCLUDE", { clientType: "USER", clientSpecified: "jdoe" })],
            );
            const results = validate(state);
            expect(results.filter(r => r.severity === "error" && r.message.includes("INCLUDE"))).toHaveLength(0);
        });
    });

    describe("INCLUDEALL with NNU", () => {
        it("warns about INCLUDEALL with NNU products", () => {
            const state = buildState(
                [buildLicenseProduct({ licenseOffering: "NNU" })],
                [
                    buildDirective("INCLUDE", { clientType: "USER", clientSpecified: "jdoe" }),
                    buildDirective("INCLUDEALL", { clientType: "USER", clientSpecified: "other" }),
                ],
            );
            const results = validate(state);
            expect(results.some(r => r.severity === "warning" && r.message.includes("INCLUDEALL"))).toBe(true);
        });
    });

    describe("NNU products with no seats assigned", () => {
        it("warns when NNU product has no INCLUDE with USER or GROUP", () => {
            const state = buildState(
                [
                    buildLicenseProduct({ productName: "MATLAB", licenseOffering: "NNU" }),
                    buildLicenseProduct({ productName: "SIMULINK", licenseOffering: "lo=CN" }),
                ],
                [buildDirective("INCLUDE", { productName: "SIMULINK", clientType: "USER" })],
            );
            const results = validate(state);
            expect(results.some(r => r.severity === "warning" && r.message.includes("MATLAB") && r.message.includes("no seats assigned"))).toBe(true);
        });

        it("no warning when NNU product has INCLUDE with USER", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", licenseOffering: "NNU" })],
                [buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" })],
            );
            const results = validate(state);
            expect(results.filter(r => r.message.includes("no seats assigned"))).toHaveLength(0);
        });
    });

    describe("NNU client type warnings", () => {
        it("warns when NNU product INCLUDE uses HOST client type", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", licenseOffering: "NNU" })],
                [
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" }),
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "HOST", clientSpecified: "myhost" }),
                ],
            );
            const results = validate(state);
            expect(results.some(r => r.severity === "warning" && r.message.includes("HOST"))).toBe(true);
        });
    });

    describe("NNU MAX suggestions", () => {
        it("suggests MAX lines for INCLUDEd USER without MAX", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 5, licenseOffering: "NNU" })],
                [buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" })],
            );
            const results = validate(state);
            const suggestion = results.find(r => r.severity === "suggestion");
            expect(suggestion).toBeTruthy();
            expect(suggestion.action).toBeTruthy();
            expect(suggestion.action.directives).toHaveLength(1);
            expect(suggestion.action.directives[0].maxSeats).toBe(2);
            expect(suggestion.action.directives[0].clientSpecified).toBe("jdoe");
        });

        it("suggests MAX lines for each GROUP member", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 5, licenseOffering: "NNU" })],
                [
                    buildDirective("GROUP", { groupName: "team", members: ["alice", "bob", "charlie"] }),
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "GROUP", clientSpecified: "team" }),
                ],
            );
            const results = validate(state);
            const suggestion = results.find(r => r.severity === "suggestion");
            expect(suggestion).toBeTruthy();
            expect(suggestion.action.directives).toHaveLength(3);
            expect(suggestion.action.directives.every(d => d.clientType === "USER")).toBe(true);
            expect(suggestion.action.directives.map(d => d.clientSpecified).sort()).toEqual(["alice", "bob", "charlie"]);
        });

        it("uses MAX 1 when product has only 1 seat", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 1, licenseOffering: "NNU" })],
                [buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" })],
            );
            const results = validate(state);
            const suggestion = results.find(r => r.severity === "suggestion");
            expect(suggestion).toBeTruthy();
            expect(suggestion.action.directives[0].maxSeats).toBe(1);
        });

        it("skips users that already have MAX lines", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 5, licenseOffering: "NNU" })],
                [
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" }),
                    buildDirective("MAX", { maxSeats: 2, productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" }),
                ],
            );
            const results = validate(state);
            const suggestion = results.find(r => r.severity === "suggestion");
            expect(suggestion).toBeUndefined();
        });

        it("no suggestion when all GROUP members have MAX lines", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 5, licenseOffering: "NNU" })],
                [
                    buildDirective("GROUP", { groupName: "team", members: ["alice", "bob"] }),
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "GROUP", clientSpecified: "team" }),
                    buildDirective("MAX", { maxSeats: 2, productName: "MATLAB", clientType: "USER", clientSpecified: "alice" }),
                    buildDirective("MAX", { maxSeats: 2, productName: "MATLAB", clientType: "USER", clientSpecified: "bob" }),
                ],
            );
            const results = validate(state);
            expect(results.find(r => r.severity === "suggestion")).toBeUndefined();
        });

        it("uses correct pluralization for 1 user", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 5, licenseOffering: "NNU" })],
                [buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" })],
            );
            const results = validate(state);
            const suggestion = results.find(r => r.severity === "suggestion");
            expect(suggestion.message).toContain("1 user");
            expect(suggestion.message).not.toContain("1 users");
        });

        it("uses correct pluralization for multiple users", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 5, licenseOffering: "NNU" })],
                [
                    buildDirective("GROUP", { groupName: "team", members: ["alice", "bob"] }),
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "GROUP", clientSpecified: "team" }),
                ],
            );
            const results = validate(state);
            const suggestion = results.find(r => r.severity === "suggestion");
            expect(suggestion.message).toContain("2 users");
        });
    });

    describe("no license loaded", () => {
        it("returns empty when no license is loaded", () => {
            const state = buildState([], [buildDirective("INCLUDE")]);
            const results = validate(state);
            expect(results).toHaveLength(0);
        });
    });
});
