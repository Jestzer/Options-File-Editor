import { describe, it, expect } from "vitest";
import { calculate } from "../js/validation/seatCalculator.js";
import { buildState, buildLicenseProduct, buildDirective } from "./helpers.js";

describe("seatCalculator", () => {
    describe("INCLUDE seat subtraction", () => {
        it("subtracts 1 seat for INCLUDE USER", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 5 })],
                [buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" })],
            );
            const results = calculate(state);
            const summary = Object.values(state.seatSummary);
            expect(summary[0].remaining).toBe(4);
            expect(summary[0].used).toBe(1);
        });

        it("subtracts group member count for INCLUDE GROUP", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 10 })],
                [
                    buildDirective("GROUP", { groupName: "team", members: ["alice", "bob", "charlie"] }),
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "GROUP", clientSpecified: "team" }),
                ],
            );
            calculate(state);
            const summary = Object.values(state.seatSummary);
            expect(summary[0].remaining).toBe(7);
            expect(summary[0].used).toBe(3);
        });

        it("does not subtract for HOST client type", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 5 })],
                [buildDirective("INCLUDE", { productName: "MATLAB", clientType: "HOST", clientSpecified: "myhost" })],
            );
            calculate(state);
            const summary = Object.values(state.seatSummary);
            expect(summary[0].remaining).toBe(5);
        });
    });

    describe("INCLUDEALL seat subtraction", () => {
        it("subtracts from all non-NNU products", () => {
            const state = buildState(
                [
                    buildLicenseProduct({ productName: "MATLAB", seatCount: 5, licenseOffering: "lo=CN" }),
                    buildLicenseProduct({ productName: "SIMULINK", seatCount: 3, licenseOffering: "lo=CN" }),
                ],
                [buildDirective("INCLUDEALL", { clientType: "USER", clientSpecified: "jdoe" })],
            );
            calculate(state);
            const summary = Object.values(state.seatSummary);
            expect(summary[0].remaining).toBe(4);
            expect(summary[1].remaining).toBe(2);
        });

        it("does not subtract from NNU products", () => {
            const state = buildState(
                [
                    buildLicenseProduct({ productName: "MATLAB", seatCount: 5, licenseOffering: "lo=CN" }),
                    buildLicenseProduct({ productName: "SIMULINK", seatCount: 3, licenseOffering: "NNU" }),
                ],
                [buildDirective("INCLUDEALL", { clientType: "USER", clientSpecified: "jdoe" })],
            );
            calculate(state);
            const summary = Object.values(state.seatSummary);
            const simulinkEntry = Object.values(state.seatSummary).find(s => s.productName === "SIMULINK");
            expect(simulinkEntry.remaining).toBe(3);
        });
    });

    describe("RESERVE seat subtraction", () => {
        it("subtracts specified seat count", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 10 })],
                [buildDirective("RESERVE", { seatCount: 3, productName: "MATLAB" })],
            );
            calculate(state);
            const summary = Object.values(state.seatSummary);
            expect(summary[0].remaining).toBe(7);
        });
    });

    describe("overdraft detection", () => {
        it("reports error for NNU overdraft", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 1, licenseOffering: "NNU", licenseNumber: "111111" })],
                [
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "alice" }),
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "bob" }),
                ],
            );
            const results = calculate(state);
            expect(results.some(r => r.severity === "error" && r.message.includes("NNU"))).toBe(true);
        });

        it("reports warning for CN overdraft", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 1, licenseOffering: "lo=CN", licenseNumber: "222222" })],
                [
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "alice" }),
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "bob" }),
                ],
            );
            const results = calculate(state);
            expect(results.some(r => r.severity === "warning" && r.message.includes("Error -4"))).toBe(true);
        });

        it("uses correct seat pluralization for 1 seat NNU overdraft", () => {
            const state = buildState(
                [buildLicenseProduct({ productName: "MATLAB", seatCount: 1, licenseOffering: "NNU", licenseNumber: "111111" })],
                [
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "alice" }),
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "bob" }),
                ],
            );
            const results = calculate(state);
            const err = results.find(r => r.severity === "error");
            expect(err.message).toContain("seat available");
            expect(err.message).not.toContain("seats available");
        });
    });

    describe("no license loaded", () => {
        it("returns empty when no license is loaded", () => {
            const state = buildState([], [buildDirective("INCLUDE")]);
            const results = calculate(state);
            expect(results).toHaveLength(0);
        });
    });
});
