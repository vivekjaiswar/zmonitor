const { describe, test } = require("node:test");
const assert = require("node:assert");
const { CorrelationEngine } = require("../../server/correlation-engine");
const { UP, DOWN, PENDING, MAINTENANCE } = require("../../src/util");

/**
 * CorrelationEngine.decideAction is pure (no database access), so it's
 * covered directly here. onTransition() needs a live DB connection
 * (dependency graph + incident tables) and is covered separately in
 * test-correlation-engine-schema.js.
 */
describe("CorrelationEngine.decideAction", () => {
    test("DOWN with no active incident creates one", () => {
        assert.strictEqual(CorrelationEngine.decideAction(false, DOWN), "CREATE");
    });

    test("DOWN with an active incident already open is ignored (dedup)", () => {
        assert.strictEqual(CorrelationEngine.decideAction(true, DOWN), "IGNORE");
    });

    test("UP with an active incident open resolves it", () => {
        assert.strictEqual(CorrelationEngine.decideAction(true, UP), "RESOLVE");
    });

    test("UP with no active incident does nothing (nothing to resolve)", () => {
        assert.strictEqual(CorrelationEngine.decideAction(false, UP), "NONE");
    });

    test("PENDING never triggers correlation, active incident or not", () => {
        assert.strictEqual(CorrelationEngine.decideAction(false, PENDING), "NONE");
        assert.strictEqual(CorrelationEngine.decideAction(true, PENDING), "NONE");
    });

    test("MAINTENANCE never triggers correlation, active incident or not", () => {
        assert.strictEqual(CorrelationEngine.decideAction(false, MAINTENANCE), "NONE");
        assert.strictEqual(CorrelationEngine.decideAction(true, MAINTENANCE), "NONE");
    });
});
