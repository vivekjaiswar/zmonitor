const { describe, test } = require("node:test");
const assert = require("node:assert");
const { computeState } = require("../../server/license/client");

// Pure function, no DB/network - the state machine + grace-clock math is the
// money/security-adjacent logic ponytail requires a check for, everything
// else in this feature (check-in networking, socket wiring) is glue code.
describe("License client - computeState()", () => {
    test("no key configured yet (fresh install) is VALID", () => {
        assert.strictEqual(computeState(null), "VALID");
    });

    test("kill-switch forces VALID regardless of paidThroughDate", () => {
        const claims = { killSwitchActive: true, paidThroughDate: "2020-01-01" };
        assert.strictEqual(computeState(claims), "VALID");
    });

    test("no plan assigned yet (paidThroughDate null) is VALID/trial", () => {
        assert.strictEqual(computeState({ paidThroughDate: null }), "VALID");
    });

    test("paidThroughDate in the future is VALID", () => {
        const claims = { paidThroughDate: "2099-01-01" };
        assert.strictEqual(computeState(claims), "VALID");
    });

    test("just past paidThroughDate is GRACE_PERIOD", () => {
        const now = new Date("2026-01-15T00:00:00Z");
        const claims = { paidThroughDate: "2026-01-01T00:00:00Z" };
        assert.strictEqual(computeState(claims, now), "GRACE_PERIOD");
    });

    test("14 days past paidThroughDate is still GRACE_PERIOD (boundary)", () => {
        const now = new Date("2026-01-15T00:00:00Z");
        const claims = { paidThroughDate: "2026-01-01T00:00:00Z" };
        assert.strictEqual(computeState(claims, now), "GRACE_PERIOD");
    });

    test("past the 14-day grace window is SOFT_LOCKED", () => {
        const now = new Date("2026-01-16T00:00:01Z");
        const claims = { paidThroughDate: "2026-01-01T00:00:00Z" };
        assert.strictEqual(computeState(claims, now), "SOFT_LOCKED");
    });

    test("retries can't reset the clock - only paidThroughDate itself matters (CM-Eng-2)", () => {
        // Simulates a customer firewalling the license-server hostname: no new
        // claims ever arrive, so the cached paidThroughDate never advances,
        // and days-since keeps counting on the client's own clock regardless.
        const staleClaims = { paidThroughDate: "2026-01-01T00:00:00Z" };
        const rightAfterExpiry = computeState(staleClaims, new Date("2026-01-02T00:00:00Z"));
        const wayLater = computeState(staleClaims, new Date("2026-06-01T00:00:00Z"));
        assert.strictEqual(rightAfterExpiry, "GRACE_PERIOD");
        assert.strictEqual(wayLater, "SOFT_LOCKED");
    });
});
