const { R } = require("redbean-node");
const dayjs = require("dayjs");

/**
 * Tracks ZMonitor's own operational health - scheduler liveness, database
 * connectivity, and an aggregate "is polling happening at all" signal -
 * independent of any single monitor's up/down status.
 *
 * Every check here is read-only and best-effort. A self-health check
 * failing must never block or slow down real monitoring - this module
 * only observes existing state, it never sits in a monitor's critical
 * path.
 */
class SelfHealth {
    static schedulerRuns = {};

    /**
     * Record that a scheduled job (server/jobs.js) ran, successfully or
     * not. Call this from the job wrapper, not from inside individual
     * job functions - keeps job code itself unmodified.
     * @param {string} jobName Job name (matches server/jobs.js job.name)
     * @param {Error|null} error Error if the job failed, null on success
     * @returns {void}
     */
    static recordSchedulerRun(jobName, error = null) {
        SelfHealth.schedulerRuns[jobName] = {
            lastRun: dayjs().toISOString(),
            lastError: error ? error.message : null,
        };
    }

    /**
     * Compute the current self-health snapshot.
     * @returns {Promise<object>} Health status by subsystem, plus an
     * overall "ok" boolean
     */
    static async getStatus() {
        const [database, monitoring] = await Promise.all([SelfHealth.checkDatabase(), SelfHealth.checkMonitoring()]);
        const scheduler = SelfHealth.checkScheduler();

        return {
            timestamp: dayjs().toISOString(),
            ok: database.ok && scheduler.ok && monitoring.ok,
            database,
            scheduler,
            monitoring,
        };
    }

    /**
     * @returns {Promise<object>} Database connectivity status
     */
    static async checkDatabase() {
        try {
            await R.getCell("SELECT 1");
            return { ok: true };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    /**
     * Scheduler (background job) liveness, derived from recordSchedulerRun
     * calls. No runs recorded yet (fresh start, before the first cron
     * tick) is reported as unknown, not unhealthy - silence alone isn't
     * a failure signal.
     * @returns {object} Scheduler liveness status
     */
    static checkScheduler() {
        const jobs = {};
        let ok = true;
        const now = dayjs();

        for (const [name, run] of Object.entries(SelfHealth.schedulerRuns)) {
            const ageMinutes = now.diff(dayjs(run.lastRun), "minute");
            // Both existing jobs (clear-old-data: daily, incremental-vacuum:
            // every 5 min) run well within an hour on a healthy system -
            // treat a full hour of silence as stuck, not just slow.
            const jobOk = !run.lastError && ageMinutes < 60;
            jobs[name] = { ...run, ageMinutes, ok: jobOk };
            ok = ok && jobOk;
        }

        return { ok, jobs };
    }

    /**
     * Aggregate signal that polling is happening at all - not a
     * per-monitor status check (that's the existing heartbeat/status
     * model). If there are active monitors but zero heartbeats written
     * in the last 5 minutes, the scheduler has likely stalled broadly.
     * @returns {Promise<object>} Monitoring-execution health status
     */
    static async checkMonitoring() {
        try {
            const activeCount = await R.getCell("SELECT COUNT(*) FROM monitor WHERE active = 1");

            if (activeCount === 0) {
                return { ok: true, activeMonitors: 0, note: "no active monitors configured" };
            }

            const fiveMinutesAgo = R.isoDateTimeMillis(dayjs.utc().subtract(5, "minute"));
            const recentHeartbeats = await R.getCell("SELECT COUNT(*) FROM heartbeat WHERE time > ?", [
                fiveMinutesAgo,
            ]);

            return {
                ok: recentHeartbeats > 0,
                activeMonitors: activeCount,
                heartbeatsLast5Min: recentHeartbeats,
            };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }
}

module.exports = {
    SelfHealth,
};
