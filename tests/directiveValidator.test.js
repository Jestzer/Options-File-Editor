import { describe, it, expect } from "vitest";
import { validate } from "../js/validation/directiveValidator.js";
import { buildState, buildLicenseProduct, buildDirective } from "./helpers.js";

describe("directiveValidator", () => {
    describe("product name validation", () => {
        it("errors on missing product name for INCLUDE", () => {
            const state = buildState([], [
                buildDirective("INCLUDE", { productName: "" }),
            ]);
            const results = validate(state);
            expect(results.some(r => r.severity === "error" && r.message.includes("missing a product name"))).toBe(true);
        });

        it("no error when product name is present", () => {
            const state = buildState([], [
                buildDirective("INCLUDE"),
            ]);
            const results = validate(state);
            expect(results.filter(r => r.message.includes("missing a product name"))).toHaveLength(0);
        });
    });

    describe("client type validation", () => {
        it("errors on invalid client type", () => {
            const state = buildState([], [
                buildDirective("INCLUDE", { clientType: "BADTYPE" }),
            ]);
            const results = validate(state);
            expect(results.some(r => r.severity === "error" && r.message.includes("invalid client type"))).toBe(true);
        });

        it("errors on missing client specified", () => {
            const state = buildState([], [
                buildDirective("INCLUDE", { clientSpecified: "" }),
            ]);
            const results = validate(state);
            expect(results.some(r => r.severity === "error" && r.message.includes("missing"))).toBe(true);
        });
    });

    describe("RESERVE validation", () => {
        it("errors on zero seat count", () => {
            const state = buildState([], [
                buildDirective("RESERVE", { seatCount: 0 }),
            ]);
            const results = validate(state);
            expect(results.some(r => r.severity === "error" && r.message.includes("invalid seat count"))).toBe(true);
        });

        it("errors on negative seat count", () => {
            const state = buildState([], [
                buildDirective("RESERVE", { seatCount: -1 }),
            ]);
            const results = validate(state);
            expect(results.some(r => r.severity === "error")).toBe(true);
        });
    });

    describe("MAX validation", () => {
        it("errors on zero MAX seat count", () => {
            const state = buildState([], [
                buildDirective("MAX", { maxSeats: 0 }),
            ]);
            const results = validate(state);
            expect(results.some(r => r.severity === "error" && r.message.includes("invalid seat count"))).toBe(true);
        });

        it("warns when MAX seats exceed license seat count", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 3 })],
                [buildDirective("MAX", { maxSeats: 10, productName: "MATLAB" })],
            );
            const results = validate(state);
            const warning = results.find(r => r.severity === "warning" && r.message.includes("10") && r.message.includes("3"));
            expect(warning).toBeTruthy();
        });

        it("uses correct pluralization for 1 seat", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 1 })],
                [buildDirective("MAX", { maxSeats: 5, productName: "MATLAB" })],
            );
            const results = validate(state);
            const warning = results.find(r => r.severity === "warning" && r.message.includes("1 seat "));
            expect(warning).toBeTruthy();
        });

        it("uses correct pluralization for multiple seats", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 3 })],
                [buildDirective("MAX", { maxSeats: 10, productName: "MATLAB" })],
            );
            const results = validate(state);
            const warning = results.find(r => r.severity === "warning" && r.message.includes("3 seats"));
            expect(warning).toBeTruthy();
        });

        it("no warning when MAX seats are within limit", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 10 })],
                [buildDirective("MAX", { maxSeats: 5, productName: "MATLAB" })],
            );
            const results = validate(state);
            expect(results.filter(r => r.message.includes("available in the license file"))).toHaveLength(0);
        });
    });

    describe("GROUP / HOST_GROUP validation", () => {
        it("errors on GROUP with no name", () => {
            const state = buildState([], [
                buildDirective("GROUP", { groupName: "" }),
            ]);
            const results = validate(state);
            expect(results.some(r => r.severity === "error" && r.message.includes("missing a name"))).toBe(true);
        });

        it("errors on GROUP with no members", () => {
            const state = buildState([], [
                buildDirective("GROUP", { members: [] }),
            ]);
            const results = validate(state);
            expect(results.some(r => r.severity === "error" && r.message.includes("no members"))).toBe(true);
        });
    });

    describe("wildcard and IP warnings", () => {
        it("warns about wildcards in client specified", () => {
            const state = buildState([], [
                buildDirective("INCLUDE", { clientSpecified: "*" }),
            ]);
            const results = validate(state);
            expect(results.some(r => r.severity === "warning" && r.message.includes("Wildcard"))).toBe(true);
        });

        it("warns about IP addresses in client specified", () => {
            const state = buildState([], [
                buildDirective("INCLUDE", { clientSpecified: "192.168.1.1" }),
            ]);
            const results = validate(state);
            expect(results.some(r => r.severity === "warning" && r.message.includes("IP address"))).toBe(true);
        });
    });

    describe("MATLAB Parallel Server info", () => {
        it("shows info for MATLAB_Distrib_Comp_Engine", () => {
            const state = buildState([], [
                buildDirective("INCLUDE", { productName: "MATLAB_Distrib_Comp_Engine" }),
            ]);
            const results = validate(state);
            expect(results.some(r => r.severity === "info" && r.message.includes("Parallel Server"))).toBe(true);
        });
    });
});
