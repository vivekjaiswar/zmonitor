const { R } = require("redbean-node");
const dayjs = require("dayjs");
const { UP } = require("../src/util");

/**
 * Computes telemetry staleness for a monitor from its existing heartbeat
 * history - no new schema. A monitor's scheduler can silently stop
 * running for it (a stuck process, a crash in its beat() chain) while
 * its last-known status keeps being shown as current. This module
 * surfaces that explicitly, as an addition alongside the existing
 * UP/DOWN/PENDING/MAINTENANCE states - it never redefines them.
 *
 * Distinguishes two timestamps deliberately: "last attempt" (the most
 * recent heartbeat, any status - every beat() call writes one heartbeat
 * regardless of outcome, so this doubles as "is the scheduler still
 * trying") and "last success" (the most recent UP heartbeat - useful
 * even when the scheduler is healthy and correctly reporting DOWN, e.g.
 * "last confirmed reachable: 3 days ago" on a device that's been down
 * since).
 */
class StaleTelemetry {
    // No heartbeat within 3x the monitor's own interval is treated as
    // stale - tolerates ordinary scheduling jitter without false-flagging.
    static STALE_INTERVAL_MULTIPLIER = 3;
    // Floor regardless of interval, so a monitor polled every few seconds
    // doesn't get flagged stale from a single missed beat.
    static MIN_THRESHOLD_SECONDS = 300;

    /**
     * The staleness threshold for a monitor.
     * @param {number} intervalSeconds Monitor's configured interval, in seconds
     * @returns {number} Threshold in seconds
     */
    static staleThresholdSeconds(intervalSeconds) {
        const normalizedInterval = intervalSeconds > 0 ? intervalSeconds : 60;
        const intervalBased = normalizedInterval * StaleTelemetry.STALE_INTERVAL_MULTIPLIER;
        return Math.max(intervalBased, StaleTelemetry.MIN_THRESHOLD_SECONDS);
    }

    /**
     * Compute telemetry freshness for one monitor from its heartbeat
     * history. Read-only.
     * @param {number} monitorID Monitor ID
     * @param {number} intervalSeconds Monitor's configured interval, in seconds
     * @returns {Promise<object>} Freshness status
     */
    static async getStatus(monitorID, intervalSeconds) {
        const lastAttempt = await R.getRow(
            "SELECT time FROM heartbeat WHERE monitor_id = ? ORDER BY time DESC LIMIT 1",
            [monitorID]
        );

        if (!lastAttempt) {
            return {
                lastAttemptTime: null,
                lastSuccessTime: null,
                stale: false,
                note: "no telemetry recorded yet",
            };
        }

        const lastSuccess = await R.getRow(
            "SELECT time FROM heartbeat WHERE monitor_id = ? AND status = ? ORDER BY time DESC LIMIT 1",
            [monitorID, UP]
        );

        const ageSeconds = dayjs().diff(dayjs(lastAttempt.time), "second");
        const staleThresholdSeconds = StaleTelemetry.staleThresholdSeconds(intervalSeconds);

        return {
            lastAttemptTime: lastAttempt.time,
            lastSuccessTime: lastSuccess ? lastSuccess.time : null,
            ageSeconds,
            staleThresholdSeconds,
            stale: ageSeconds > staleThresholdSeconds,
        };
    }
}

module.exports = {
    StaleTelemetry,
};
