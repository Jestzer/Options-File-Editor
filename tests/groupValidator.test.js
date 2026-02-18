import { describe, it, expect } from "vitest";
import { validate } from "../js/validation/groupValidator.js";
import { buildState, buildDirective } from "./helpers.js";

describe("groupValidator", () => {
    it("errors when referenced GROUP does not exist", () => {
        const state = buildState([], [
            buildDirective("INCLUDE", { clientType: "GROUP", clientSpecified: "nonexistent_group" }),
        ]);
        const results = validate(state);
        expect(results.some(r => r.severity === "error" && r.message.includes("nonexistent_group"))).toBe(true);
    });

    it("no error when referenced GROUP exists", () => {
        const state = buildState([], [
            buildDirective("GROUP", { groupName: "dev_team", members: ["alice", "bob"] }),
            buildDirective("INCLUDE", { clientType: "GROUP", clientSpecified: "dev_team" }),
        ]);
        const results = validate(state);
        expect(results.filter(r => r.severity === "error" && r.message.includes("dev_team"))).toHaveLength(0);
    });

    it("errors when referenced HOST_GROUP does not exist", () => {
        const state = buildState([], [
            buildDirective("INCLUDE", { clientType: "HOST_GROUP", clientSpecified: "nonexistent_hg" }),
        ]);
        const results = validate(state);
        expect(results.some(r => r.severity === "error" && r.message.includes("nonexistent_hg"))).toBe(true);
    });

    it("no error when referenced HOST_GROUP exists", () => {
        const state = buildState([], [
            buildDirective("HOST_GROUP", { groupName: "lab", members: ["host1"] }),
            buildDirective("INCLUDE", { clientType: "HOST_GROUP", clientSpecified: "lab" }),
        ]);
        const results = validate(state);
        expect(results.filter(r => r.severity === "error" && r.message.includes("lab"))).toHaveLength(0);
    });

    it("shows case sensitivity info when groups exist and case insensitive is off", () => {
        const state = buildState([], [
            buildDirective("GROUP", { groupName: "team", members: ["alice"] }),
        ]);
        const results = validate(state);
        expect(results.some(r => r.severity === "info" && r.message.includes("Case sensitivity"))).toBe(true);
    });

    it("no case sensitivity info when GROUPCASEINSENSITIVE is ON", () => {
        const state = buildState([], [
            buildDirective("GROUPCASEINSENSITIVE"),
            buildDirective("GROUP", { groupName: "team", members: ["alice"] }),
        ]);
        const results = validate(state);
        expect(results.filter(r => r.message.includes("Case sensitivity"))).toHaveLength(0);
    });

    it("case-insensitive GROUP lookup when GROUPCASEINSENSITIVE is ON", () => {
        const state = buildState([], [
            buildDirective("GROUPCASEINSENSITIVE"),
            buildDirective("GROUP", { groupName: "Dev_Team", members: ["alice"] }),
            buildDirective("INCLUDE", { clientType: "GROUP", clientSpecified: "dev_team" }),
        ]);
        const results = validate(state);
        expect(results.filter(r => r.severity === "error")).toHaveLength(0);
    });

    it("case-sensitive GROUP lookup fails on case mismatch by default", () => {
        const state = buildState([], [
            buildDirective("GROUP", { groupName: "Dev_Team", members: ["alice"] }),
            buildDirective("INCLUDE", { clientType: "GROUP", clientSpecified: "dev_team" }),
        ]);
        const results = validate(state);
        expect(results.some(r => r.severity === "error" && r.message.includes("dev_team"))).toBe(true);
    });

    it("checks GROUP references across multiple directive types", () => {
        const state = buildState([], [
            buildDirective("RESERVE", { clientType: "GROUP", clientSpecified: "missing_group" }),
        ]);
        const results = validate(state);
        expect(results.some(r => r.severity === "error" && r.message.includes("missing_group"))).toBe(true);
    });
});
