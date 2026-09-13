const { R } = require("redbean-node");

/**
 * Detects flapping: a monitor rapidly oscillating between states. Read-only
 * over existing heartbeat data, no new schema.
 *
 * Flap classification never hides the underlying failure or loses
 * history - this module only classifies, it doesn't suppress heartbeat
 * recording or change status semantics. Notification suppression (the
 * actual noise reduction a flap state exists to enable) is a separate
 * integration point in the notification-dispatch path, not built in
 * this pass.
 */
class FlapDetector {
    // How many of the monitor's most recent heartbeats to look at.
    static WINDOW_SIZE = 10;
    // Transitions within the window at or above this count = flapping.
    static FLAP_THRESHOLD = 4;

    /**
     * Count status transitions in a chronological sequence of statuses.
     * Pure function - no I/O.
     *
     * ponytail: counts every literal status change, including UP<->PENDING
     * during a retry sequence, not just UP<->DOWN. Simpler and matches
     * "do not over-engineer this feature" - PENDING oscillation already
     * only happens during genuine retry activity, so it's a reasonable
     * proxy. Upgrade path if this over-fires: filter the sequence to only
     * UP/DOWN before counting.
     * @param {Array<number>} statusSequence Statuses in chronological order (oldest first)
     * @returns {number} Number of adjacent status changes
     */
    static countTransitions(statusSequence) {
        let transitions = 0;
        for (let i = 1; i < statusSequence.length; i++) {
            if (statusSequence[i] !== statusSequence[i - 1]) {
                transitions++;
            }
        }
        return transitions;
    }

    /**
     * Is a chronological sequence of statuses flapping?
     * @param {Array<number>} statusSequence Statuses in chronological order (oldest first)
     * @returns {boolean} True if the transition count meets the flap threshold
     */
    static isFlappingSequence(statusSequence) {
        return FlapDetector.countTransitions(statusSequence) >= FlapDetector.FLAP_THRESHOLD;
    }

    /**
     * Determine if a monitor is currently flapping, based on its most
     * recent heartbeats.
     * @param {number} monitorID Monitor ID
     * @returns {Promise<object>} Flap status
     */
    static async getStatus(monitorID) {
        const rows = await R.getAll("SELECT status FROM heartbeat WHERE monitor_id = ? ORDER BY time DESC LIMIT ?", [
            monitorID,
            FlapDetector.WINDOW_SIZE,
        ]);

        // Rows come back newest-first; reverse for chronological order so
        // countTransitions reads oldest -> newest like the pure function expects.
        const statusSequence = rows.map((row) => row.status).reverse();
        const transitions = FlapDetector.countTransitions(statusSequence);

        return {
            windowSize: statusSequence.length,
            transitions,
            flapping: transitions >= FlapDetector.FLAP_THRESHOLD,
        };
    }
}

module.exports = {
    FlapDetector,
};
