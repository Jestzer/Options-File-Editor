import { describe, it, expect } from "vitest";
import { validate } from "../js/validation/productValidator.js";
import { buildState, buildLicenseProduct, buildDirective } from "./helpers.js";

describe("productValidator", () => {
    describe("expired products", () => {
        it("warns when all license entries for a product are expired", () => {
            const state = buildState(
                [buildLicenseProduct({
                    productName: "MATLAB",
                    expirationDate: new Date(2020, 0, 1),
                })],
                [buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" })],
            );
            const results = validate(state);
            expect(results.some(r => r.severity === "warning" && r.message.includes("expired"))).toBe(true);
        });

        it("no warning when product has not expired", () => {
            const state = buildState(
                [buildLicenseProduct({
                    productName: "MATLAB",
                    expirationDate: new Date(2999, 0, 1),
                })],
                [buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" })],
            );
            const results = validate(state);
            expect(results.filter(r => r.message.includes("expired"))).toHaveLength(0);
        });

        it("no warning when at least one license entry is not expired", () => {
            const state = buildState(
                [
                    buildLicenseProduct({
                        productName: "MATLAB",
                        expirationDate: new Date(2020, 0, 1),
                        licenseNumber: "111111",
                    }),
                    buildLicenseProduct({
                        productName: "MATLAB",
                        expirationDate: new Date(2999, 0, 1),
                        licenseNumber: "222222",
                    }),
                ],
                [buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "jdoe" })],
            );
            const results = validate(state);
            expect(results.filter(r => r.message.includes("expired"))).toHaveLength(0);
        });

        it("warns only once per product even with multiple directives", () => {
            const state = buildState(
                [buildLicenseProduct({
                    productName: "MATLAB",
                    expirationDate: new Date(2020, 0, 1),
                })],
                [
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "alice" }),
                    buildDirective("INCLUDE", { productName: "MATLAB", clientType: "USER", clientSpecified: "bob" }),
                ],
            );
            const results = validate(state);
            expect(results.filter(r => r.message.includes("expired"))).toHaveLength(1);
        });
    });
});
