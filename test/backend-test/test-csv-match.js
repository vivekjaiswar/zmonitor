const { describe, test, before } = require("node:test");
const assert = require("node:assert");

// src/util-csv-match.js is an ES module (the frontend Vue component imports
// it via `import`) - dynamic import() to load it from this CJS test file
// rather than duplicating the logic in two module formats.
let findMonitorMatch;

// Pure matching logic behind the coordinates-CSV import. The one rule that
// actually matters: an ambiguous match must never be guessed at, or a bad
// CSV row silently overwrites the wrong monitor's coordinates.
describe("CSV coordinate import - findMonitorMatch()", () => {
    before(async () => {
        ({ findMonitorMatch } = await import("../../src/util-csv-match.js"));
    });

    const monitors = [
        { id: 1, name: "OLT-1", hostname: "10.0.0.1", url: null },
        { id: 2, name: "ONT-Sarah", hostname: "10.0.0.2", url: null },
        { id: 3, name: "ONT-Dup", hostname: "10.0.0.3", url: null },
        { id: 4, name: "ONT-Dup", hostname: "10.0.0.4", url: null }, // duplicate name
        { id: 5, name: "HTTP-Check", hostname: null, url: "http://example.com" },
    ];

    test("matches by exact hostname", () => {
        assert.strictEqual(findMonitorMatch(monitors, "10.0.0.1", "").id, 1);
    });

    test("matches by exact URL when hostname is null", () => {
        assert.strictEqual(findMonitorMatch(monitors, "http://example.com", "").id, 5);
    });

    test("falls back to name when hostname doesn't match anything", () => {
        assert.strictEqual(findMonitorMatch(monitors, "no-such-host", "OLT-1").id, 1);
    });

    test("ambiguous hostname match (theoretical dup) returns null, does not guess", () => {
        const dupHostMonitors = [
            { id: 10, name: "A", hostname: "10.0.0.9", url: null },
            { id: 11, name: "B", hostname: "10.0.0.9", url: null },
        ];
        assert.strictEqual(findMonitorMatch(dupHostMonitors, "10.0.0.9", ""), null);
    });

    test("ambiguous name match returns null, does not guess", () => {
        assert.strictEqual(findMonitorMatch(monitors, "", "ONT-Dup"), null);
    });

    test("no match at all returns null", () => {
        assert.strictEqual(findMonitorMatch(monitors, "10.0.0.99", "Nonexistent"), null);
    });

    test("empty hostname and name returns null", () => {
        assert.strictEqual(findMonitorMatch(monitors, "", ""), null);
    });
});
