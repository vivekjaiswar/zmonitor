const { describe, test, beforeEach } = require("node:test");
const assert = require("node:assert");
const { SelfHealth } = require("../../server/self-health");

/**
 * SelfHealth.checkScheduler/recordSchedulerRun are pure (no database
 * access), so they're covered here directly. checkDatabase/checkMonitoring
 * need a live DB connection via redbean-node and are not exercised in
 * this pass - see docs/isp-nms-production-readiness.md row I for status.
 */
describe("SelfHealth scheduler tracking", () => {
    beforeEach(() => {
        // Reset shared static state between tests.
        SelfHealth.schedulerRuns = {};
    });

    test("no runs recorded yet is reported as ok (unknown, not unhealthy)", () => {
        const status = SelfHealth.checkScheduler();
        assert.strictEqual(status.ok, true);
        assert.deepStrictEqual(status.jobs, {});
    });

    test("a successful run is recorded and reported healthy", () => {
        SelfHealth.recordSchedulerRun("incremental-vacuum", null);
        const status = SelfHealth.checkScheduler();

        assert.strictEqual(status.ok, true);
        assert.strictEqual(status.jobs["incremental-vacuum"].ok, true);
        assert.strictEqual(status.jobs["incremental-vacuum"].lastError, null);
    });

    test("a failed run is recorded with its error and marks that job unhealthy", () => {
        SelfHealth.recordSchedulerRun("clear-old-data", new Error("disk full"));
        const status = SelfHealth.checkScheduler();

        assert.strictEqual(status.jobs["clear-old-data"].ok, false);
        assert.strictEqual(status.jobs["clear-old-data"].lastError, "disk full");
        assert.strictEqual(status.ok, false, "overall status must reflect any unhealthy job");
    });

    test("one failing job does not hide a different job's healthy status", () => {
        SelfHealth.recordSchedulerRun("incremental-vacuum", null);
        SelfHealth.recordSchedulerRun("clear-old-data", new Error("boom"));
        const status = SelfHealth.checkScheduler();

        assert.strictEqual(status.jobs["incremental-vacuum"].ok, true);
        assert.strictEqual(status.jobs["clear-old-data"].ok, false);
        assert.strictEqual(status.ok, false);
    });

    test("a stale run (recorded over an hour ago) is treated as unhealthy even with no error", () => {
        const dayjs = require("dayjs");
        SelfHealth.schedulerRuns["incremental-vacuum"] = {
            lastRun: dayjs().subtract(90, "minute").toISOString(),
            lastError: null,
        };
        const status = SelfHealth.checkScheduler();

        assert.strictEqual(status.jobs["incremental-vacuum"].ok, false, "a stuck scheduler must not report healthy");
        assert.strictEqual(status.ok, false);
    });
});
