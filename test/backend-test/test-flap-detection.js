const { describe, test } = require("node:test");
const assert = require("node:assert");
const { FlapDetector } = require("../../server/flap-detection");
const { UP, DOWN, PENDING } = require("../../src/util");

/**
 * FlapDetector.countTransitions/isFlappingSequence are pure (no database
 * access), so they're covered directly here. getStatus() needs a live DB
 * connection via redbean-node and is not exercised in this pass - see
 * docs/isp-nms-production-readiness.md row D for status.
 */
describe("FlapDetector.countTransitions", () => {
    test("a steady sequence has zero transitions", () => {
        assert.strictEqual(FlapDetector.countTransitions([UP, UP, UP, UP, UP]), 0);
    });

    test("a single failure and recovery is 2 transitions", () => {
        assert.strictEqual(FlapDetector.countTransitions([UP, UP, DOWN, DOWN, UP, UP]), 2);
    });

    test("counts every adjacent change, including through PENDING", () => {
        // UP -> PENDING -> DOWN -> PENDING -> UP = 4 transitions
        assert.strictEqual(FlapDetector.countTransitions([UP, PENDING, DOWN, PENDING, UP]), 4);
    });

    test("an empty or single-element sequence has zero transitions", () => {
        assert.strictEqual(FlapDetector.countTransitions([]), 0);
        assert.strictEqual(FlapDetector.countTransitions([UP]), 0);
    });
});

describe("FlapDetector.isFlappingSequence", () => {
    test("a monitor that went down once and recovered is not flapping", () => {
        assert.strictEqual(FlapDetector.isFlappingSequence([UP, UP, UP, DOWN, DOWN, UP, UP, UP, UP, UP]), false);
    });

    test("a monitor oscillating rapidly is flapping", () => {
        assert.strictEqual(FlapDetector.isFlappingSequence([UP, DOWN, UP, DOWN, UP, DOWN]), true);
    });

    test("exactly at the threshold counts as flapping (boundary is inclusive)", () => {
        // UP,DOWN,UP,DOWN,UP = 4 transitions, matches FLAP_THRESHOLD exactly
        assert.strictEqual(FlapDetector.countTransitions([UP, DOWN, UP, DOWN, UP]), FlapDetector.FLAP_THRESHOLD);
        assert.strictEqual(FlapDetector.isFlappingSequence([UP, DOWN, UP, DOWN, UP]), true);
    });

    test("one below the threshold is not flapping", () => {
        assert.strictEqual(FlapDetector.isFlappingSequence([UP, DOWN, UP, DOWN]), false);
    });
});
