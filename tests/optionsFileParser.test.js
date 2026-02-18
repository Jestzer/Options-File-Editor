import { describe, it, expect } from "vitest";
import { parseOptionsFile } from "../js/parsers/optionsFileParser.js";

describe("parseOptionsFile", () => {
    describe("INCLUDE / EXCLUDE directives", () => {
        it("parses a simple INCLUDE with plain product name", () => {
            const { document, error } = parseOptionsFile("INCLUDE MATLAB USER jdoe");
            expect(error).toBeNull();
            const d = document.directives[0];
            expect(d.type).toBe("INCLUDE");
            expect(d.productName).toBe("MATLAB");
            expect(d.clientType).toBe("USER");
            expect(d.clientSpecified).toBe("jdoe");
            expect(d.licenseNumber).toBe("");
            expect(d.productKey).toBe("");
        });

        it("parses INCLUDE with quoted asset_info", () => {
            const { document, error } = parseOptionsFile(
                'INCLUDE "MATLAB asset_info=123456" USER jdoe'
            );
            expect(error).toBeNull();
            const d = document.directives[0];
            expect(d.productName).toBe("MATLAB");
            expect(d.licenseNumber).toBe("123456");
            expect(d.clientSpecified).toBe("jdoe");
        });

        it("parses INCLUDE with colon-separated key", () => {
            const { document, error } = parseOptionsFile(
                "INCLUDE MATLAB:key=ABCDEF1234 USER jdoe"
            );
            expect(error).toBeNull();
            const d = document.directives[0];
            expect(d.productName).toBe("MATLAB");
            expect(d.productKey).toBe("ABCDEF1234");
        });

        it("parses EXCLUDE correctly", () => {
            const { document, error } = parseOptionsFile("EXCLUDE MATLAB HOST badhost");
            expect(error).toBeNull();
            expect(document.directives[0].type).toBe("EXCLUDE");
        });

        it("parses INCLUDE_BORROW and EXCLUDE_BORROW", () => {
            const text = "INCLUDE_BORROW MATLAB USER jdoe\nEXCLUDE_BORROW SIMULINK USER other";
            const { document, error } = parseOptionsFile(text);
            expect(error).toBeNull();
            expect(document.directives).toHaveLength(2);
            expect(document.directives[0].type).toBe("INCLUDE_BORROW");
            expect(document.directives[1].type).toBe("EXCLUDE_BORROW");
        });

        it("errors on INCLUDE with missing information", () => {
            const { error } = parseOptionsFile("INCLUDE MATLAB USER");
            expect(error).toBeTruthy();
        });

        it("errors on stray quotation mark", () => {
            const { error } = parseOptionsFile('INCLUDE "MATLAB USER jdoe');
            expect(error).toBeTruthy();
            expect(error).toContain("quotation");
        });

        it("errors on unknown product name", () => {
            const { error } = parseOptionsFile("INCLUDE FAKE_PRODUCT USER jdoe");
            expect(error).toBeTruthy();
            expect(error).toContain("Unknown product");
        });

        it("errors on invalid client type", () => {
            const { error } = parseOptionsFile("INCLUDE MATLAB BADTYPE jdoe");
            expect(error).toBeTruthy();
            expect(error).toContain("Invalid client type");
        });
    });

    describe("INCLUDEALL / EXCLUDEALL", () => {
        it("parses INCLUDEALL", () => {
            const { document, error } = parseOptionsFile("INCLUDEALL USER jdoe");
            expect(error).toBeNull();
            const d = document.directives[0];
            expect(d.type).toBe("INCLUDEALL");
            expect(d.clientType).toBe("USER");
            expect(d.clientSpecified).toBe("jdoe");
        });

        it("parses EXCLUDEALL", () => {
            const { document, error } = parseOptionsFile("EXCLUDEALL GROUP mygroup");
            expect(error).toBeNull();
            expect(document.directives[0].type).toBe("EXCLUDEALL");
        });

        it("errors on INCLUDEALL missing information", () => {
            const { error } = parseOptionsFile("INCLUDEALL USER");
            expect(error).toBeTruthy();
        });
    });

    describe("MAX directives", () => {
        it("parses a valid MAX line", () => {
            const { document, error } = parseOptionsFile("MAX 5 MATLAB USER jdoe");
            expect(error).toBeNull();
            const d = document.directives[0];
            expect(d.type).toBe("MAX");
            expect(d.maxSeats).toBe(5);
            expect(d.productName).toBe("MATLAB");
            expect(d.clientType).toBe("USER");
            expect(d.clientSpecified).toBe("jdoe");
        });

        it("errors on malformed MAX and shows format explanation", () => {
            const { error } = parseOptionsFile("MAX MATLAB");
            expect(error).toBeTruthy();
            expect(error).toContain("MAX <number_of_seats> <product_name> <client_type> <client_specified>");
            expect(error).toContain("Example");
        });

        it("errors on non-integer MAX seat count", () => {
            const { error } = parseOptionsFile("MAX abc MATLAB USER jdoe");
            expect(error).toBeTruthy();
            expect(error).toContain("Invalid seat count");
        });

        it("errors on zero MAX seat count", () => {
            const { error } = parseOptionsFile("MAX 0 MATLAB USER jdoe");
            expect(error).toBeTruthy();
        });
    });

    describe("RESERVE directives", () => {
        it("parses a valid RESERVE line", () => {
            const { document, error } = parseOptionsFile("RESERVE 3 MATLAB USER jdoe");
            expect(error).toBeNull();
            const d = document.directives[0];
            expect(d.type).toBe("RESERVE");
            expect(d.seatCount).toBe(3);
            expect(d.productName).toBe("MATLAB");
        });

        it("errors on zero seat count", () => {
            const { error } = parseOptionsFile("RESERVE 0 MATLAB USER jdoe");
            expect(error).toBeTruthy();
        });
    });

    describe("GROUP directives", () => {
        it("parses a GROUP with members on one line", () => {
            const { document, error } = parseOptionsFile("GROUP dev_team alice bob charlie");
            expect(error).toBeNull();
            const g = document.directives[0];
            expect(g.type).toBe("GROUP");
            expect(g.groupName).toBe("dev_team");
            expect(g.members).toEqual(["alice", "bob", "charlie"]);
        });

        it("handles multi-line GROUP continuation", () => {
            const text = "GROUP dev_team alice bob\ncharlie dave";
            const { document, error } = parseOptionsFile(text);
            expect(error).toBeNull();
            const g = document.directives[0];
            expect(g.members).toEqual(["alice", "bob", "charlie", "dave"]);
        });

        it("handles backslash continuation in GROUP", () => {
            const text = "GROUP dev_team alice \\\nbob charlie";
            const { document, error } = parseOptionsFile(text);
            expect(error).toBeNull();
            const g = document.directives[0];
            expect(g.members).toContain("alice");
            expect(g.members).toContain("bob");
            expect(g.members).toContain("charlie");
        });

        it("merges duplicate GROUP definitions", () => {
            const text = "GROUP dev_team alice bob\nGROUP dev_team charlie";
            const { document, error } = parseOptionsFile(text);
            expect(error).toBeNull();
            const groups = document.directives.filter(d => d.type === "GROUP");
            expect(groups).toHaveLength(1);
            expect(groups[0].members).toEqual(["alice", "bob", "charlie"]);
        });

        it("preserves GROUP continuation through comments", () => {
            const text = "GROUP dev_team alice bob\n# a comment\ncharlie";
            const { document, error } = parseOptionsFile(text);
            expect(error).toBeNull();
            const g = document.directives.find(d => d.type === "GROUP");
            expect(g.members).toContain("charlie");
        });
    });

    describe("HOST_GROUP directives", () => {
        it("parses a HOST_GROUP with members on one line", () => {
            const { document, error } = parseOptionsFile("HOST_GROUP lab host1 host2 host3");
            expect(error).toBeNull();
            const hg = document.directives[0];
            expect(hg.type).toBe("HOST_GROUP");
            expect(hg.groupName).toBe("lab");
            expect(hg.members).toEqual(["host1", "host2", "host3"]);
        });

        it("handles multi-line HOST_GROUP continuation", () => {
            const text = "HOST_GROUP lab host1 host2\nhost3 host4";
            const { document, error } = parseOptionsFile(text);
            expect(error).toBeNull();
            const hg = document.directives[0];
            expect(hg.members).toEqual(["host1", "host2", "host3", "host4"]);
        });

        it("merges duplicate HOST_GROUP definitions", () => {
            const text = "HOST_GROUP lab host1\nHOST_GROUP lab host2";
            const { document, error } = parseOptionsFile(text);
            expect(error).toBeNull();
            const groups = document.directives.filter(d => d.type === "HOST_GROUP");
            expect(groups).toHaveLength(1);
            expect(groups[0].members).toEqual(["host1", "host2"]);
        });
    });

    describe("GROUPCASEINSENSITIVE", () => {
        it("parses GROUPCASEINSENSITIVE ON", () => {
            const { document, error } = parseOptionsFile(
                "GROUPCASEINSENSITIVE ON\nINCLUDE MATLAB USER jdoe"
            );
            expect(error).toBeNull();
            expect(document.hasGroupCaseInsensitive()).toBe(true);
        });
    });

    describe("comments and blank lines", () => {
        it("preserves comments as COMMENT directives", () => {
            const { document, error } = parseOptionsFile("# This is a comment\nINCLUDE MATLAB USER jdoe");
            expect(error).toBeNull();
            const comments = document.directives.filter(d => d.type === "COMMENT");
            expect(comments).toHaveLength(1);
            expect(comments[0].text).toBe("This is a comment");
        });

        it("skips blank lines", () => {
            const { document, error } = parseOptionsFile("\n\nINCLUDE MATLAB USER jdoe\n\n");
            expect(error).toBeNull();
            expect(document.directives.filter(d => d.type === "INCLUDE")).toHaveLength(1);
        });
    });

    describe("warnings", () => {
        it("warns about wildcards", () => {
            const { warnings, error } = parseOptionsFile("INCLUDE MATLAB USER *");
            expect(error).toBeNull();
            expect(warnings.some(w => w.includes("Wildcard"))).toBe(true);
        });

        it("warns about IP addresses", () => {
            const { warnings, error } = parseOptionsFile("INCLUDE MATLAB HOST 192.168.1.1");
            expect(error).toBeNull();
            expect(warnings.some(w => w.includes("IP address"))).toBe(true);
        });
    });

    describe("error cases", () => {
        it("errors on empty file", () => {
            const { error } = parseOptionsFile("");
            expect(error).toBeTruthy();
        });

        it("errors on unrecognized line", () => {
            const { error } = parseOptionsFile("INCLUDE MATLAB USER jdoe\nGARBAGE LINE HERE");
            expect(error).toBeTruthy();
            expect(error).toContain("Unrecognized");
        });
    });
});
