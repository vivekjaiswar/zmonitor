const { describe, test } = require("node:test");
const assert = require("node:assert");
const Monitor = require("../../server/model/monitor");
const { UP, DOWN, PENDING, MAINTENANCE } = require("../../src/util");

/**
 * Monitor.isImportantBeat / isImportantForNotification are the two pure
 * functions the entire reliability/recovery/correlation story depends on:
 * they decide what counts as a state transition worth recording, and
 * (separately) worth notifying on. Zero test coverage existed for either
 * before this file - see docs/isp-nms-component-audit.md sections 7 and
 * "Constraints", and docs/isp-nms-prd.md section 5.10 (Recovery
 * Verification), which explicitly calls this logic load-bearing for any
 * future correlation/recovery work.
 *
 * Every assertion here is transcribed directly from the truth table in
 * the two functions' own doc comments in server/model/monitor.js, so this
 * test is a regression guard on that documented contract, not a guess.
 */

describe("Monitor.isImportantBeat", () => {
    test("first beat is always important, regardless of current status", () => {
        assert.strictEqual(Monitor.isImportantBeat(true, undefined, UP), true);
        assert.strictEqual(Monitor.isImportantBeat(true, undefined, DOWN), true);
        assert.strictEqual(Monitor.isImportantBeat(true, undefined, PENDING), true);
        assert.strictEqual(Monitor.isImportantBeat(true, undefined, MAINTENANCE), true);
    });

    test("non-transitions are not important", () => {
        assert.strictEqual(Monitor.isImportantBeat(false, UP, UP), false);
        assert.strictEqual(Monitor.isImportantBeat(false, PENDING, PENDING), false);
        assert.strictEqual(Monitor.isImportantBeat(false, DOWN, DOWN), false);
        assert.strictEqual(Monitor.isImportantBeat(false, MAINTENANCE, MAINTENANCE), false);
    });

    test("UP -> PENDING and PENDING -> UP are not important (still recovering/still up)", () => {
        assert.strictEqual(Monitor.isImportantBeat(false, UP, PENDING), false);
        assert.strictEqual(Monitor.isImportantBeat(false, PENDING, UP), false);
    });

    test("real failure/recovery transitions are important", () => {
        assert.strictEqual(Monitor.isImportantBeat(false, UP, DOWN), true, "UP -> DOWN");
        assert.strictEqual(Monitor.isImportantBeat(false, DOWN, UP), true, "DOWN -> UP (recovery)");
        assert.strictEqual(Monitor.isImportantBeat(false, PENDING, DOWN), true, "PENDING -> DOWN (retries exhausted)");
    });

    test("maintenance boundary transitions are always important (for history/UI)", () => {
        assert.strictEqual(Monitor.isImportantBeat(false, UP, MAINTENANCE), true, "UP -> MAINTENANCE");
        assert.strictEqual(Monitor.isImportantBeat(false, DOWN, MAINTENANCE), true, "DOWN -> MAINTENANCE");
        assert.strictEqual(Monitor.isImportantBeat(false, MAINTENANCE, UP), true, "MAINTENANCE -> UP");
        assert.strictEqual(Monitor.isImportantBeat(false, MAINTENANCE, DOWN), true, "MAINTENANCE -> DOWN");
    });
});

describe("Monitor.isImportantForNotification", () => {
    test("first beat is always notification-worthy", () => {
        assert.strictEqual(Monitor.isImportantForNotification(true, undefined, UP), true);
        assert.strictEqual(Monitor.isImportantForNotification(true, undefined, DOWN), true);
    });

    test("non-transitions never notify", () => {
        assert.strictEqual(Monitor.isImportantForNotification(false, UP, UP), false);
        assert.strictEqual(Monitor.isImportantForNotification(false, PENDING, PENDING), false);
        assert.strictEqual(Monitor.isImportantForNotification(false, DOWN, DOWN), false);
        assert.strictEqual(Monitor.isImportantForNotification(false, MAINTENANCE, MAINTENANCE), false);
    });

    test("real failure/recovery transitions notify, retry-pending states don't", () => {
        assert.strictEqual(Monitor.isImportantForNotification(false, UP, PENDING), false);
        assert.strictEqual(Monitor.isImportantForNotification(false, PENDING, UP), false);
        assert.strictEqual(Monitor.isImportantForNotification(false, UP, DOWN), true, "UP -> DOWN");
        assert.strictEqual(Monitor.isImportantForNotification(false, DOWN, UP), true, "DOWN -> UP (recovery)");
        assert.strictEqual(Monitor.isImportantForNotification(false, PENDING, DOWN), true, "PENDING -> DOWN");
    });

    test("entering maintenance never notifies, even though it IS an important beat for history", () => {
        assert.strictEqual(Monitor.isImportantForNotification(false, UP, MAINTENANCE), false);
        assert.strictEqual(Monitor.isImportantForNotification(false, DOWN, MAINTENANCE), false);
    });

    test("a genuine DOWN discovered while already in maintenance still notifies", () => {
        assert.strictEqual(Monitor.isImportantForNotification(false, MAINTENANCE, DOWN), true);
    });

    test("recovering to UP while the maintenance window is still nominally active does not notify", () => {
        assert.strictEqual(Monitor.isImportantForNotification(false, MAINTENANCE, UP), false);
    });

    test("isImportantBeat and isImportantForNotification diverge exactly at the 3 maintenance-entry/exit cases", () => {
        // This is the concrete proof of the maintenance-suppression behavior documented
        // in docs/isp-nms-architecture.md: entering/exiting maintenance is recorded as an
        // important beat (for history/UI) but must not spam a notification.
        const divergent = [
            [false, UP, MAINTENANCE],
            [false, DOWN, MAINTENANCE],
            [false, MAINTENANCE, UP],
        ];
        for (const [isFirstBeat, prev, curr] of divergent) {
            assert.strictEqual(Monitor.isImportantBeat(isFirstBeat, prev, curr), true);
            assert.strictEqual(Monitor.isImportantForNotification(isFirstBeat, prev, curr), false);
        }
    });
});
