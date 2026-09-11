const { describe, test } = require("node:test");
const assert = require("node:assert");
const { StaleTelemetry } = require("../../server/stale-telemetry");

/**
 * StaleTelemetry.staleThresholdSeconds is pure (no database access), so
 * it's covered directly here. getStatus() needs a live DB connection via
 * redbean-node and is not exercised in this pass - see
 * docs/isp-nms-production-readiness.md row C for status.
 */
describe("StaleTelemetry.staleThresholdSeconds", () => {
    test("uses the interval-based threshold when it exceeds the floor", () => {
        // 200s interval * 3 = 600s, which is above the 300s floor.
        assert.strictEqual(StaleTelemetry.staleThresholdSeconds(200), 600);
    });

    test("uses the fixed floor for short-interval monitors", () => {
        // 20s interval * 3 = 60s, well under the 300s floor - a monitor
        // polled every 20s must not be flagged stale after one missed beat.
        assert.strictEqual(StaleTelemetry.staleThresholdSeconds(20), 300);
    });

    test("treats a missing/zero interval as 60s rather than 0", () => {
        // A 0 or falsy interval must not collapse the threshold to 0
        // (which would flag every monitor as permanently stale).
        assert.strictEqual(StaleTelemetry.staleThresholdSeconds(0), 300);
        assert.strictEqual(StaleTelemetry.staleThresholdSeconds(undefined), 300);
    });

    test("scales up for long-interval monitors", () => {
        // 3600s (hourly) interval * 3 = 10800s - an hourly monitor
        // shouldn't be flagged stale after 5 minutes of normal operation.
        assert.strictEqual(StaleTelemetry.staleThresholdSeconds(3600), 10800);
    });
});
