const { R } = require("redbean-node");
const { DependencyGraph } = require("./dependency-graph");
const { UP, DOWN } = require("../src/util");

/**
 * Correlation engine: on a monitor status transition, walks the
 * dependency graph from the failed node and produces ONE incident
 * carrying the impact summary, instead of one alert per affected leaf.
 *
 * Deliberately not wired into Monitor.beat() yet - that's a one-line,
 * error-isolated addition at the same "isImportant" branch point
 * beat() already uses for notifications, left as the explicit next
 * step rather than done silently in this pass (same reasoning as
 * flap-detection's D3: build and test the engine, wire it into the
 * transition path separately, once this module itself is proven).
 */
class CorrelationEngine {
    /**
     * Pure decision: given whether an active (unresolved) incident
     * already exists for this root node, and the new status, what
     * should happen? No I/O.
     * @param {boolean} hasActiveIncident Whether an unresolved incident already exists for this root node
     * @param {number} newStatus The new status (UP/DOWN/PENDING/MAINTENANCE constant)
     * @returns {"CREATE"|"IGNORE"|"RESOLVE"|"NONE"} What the caller should do
     */
    static decideAction(hasActiveIncident, newStatus) {
        if (newStatus === DOWN) {
            // Dedup: a repeat DOWN beat for a root that already has an
            // open incident must not create a second one.
            return hasActiveIncident ? "IGNORE" : "CREATE";
        }
        if (newStatus === UP) {
            return hasActiveIncident ? "RESOLVE" : "NONE";
        }
        // PENDING/MAINTENANCE: correlation only reacts to confirmed
        // DOWN/UP in this pass - do not over-engineer partial states in
        // before the simple case is proven.
        return "NONE";
    }

    /**
     * React to a root node's status transition. Walks the dependency
     * graph downstream from the node, and per decideAction():
     * creates one incident recording every reachable node as impact,
     * ignores a repeat DOWN while an incident is already open, or
     * resolves the open incident on recovery.
     * @param {number} userID Owning user
     * @param {number} rootNodeID The graph_node that transitioned
     * @param {number} newStatus UP or DOWN (PENDING/MAINTENANCE are a no-op)
     * @param {string} title Incident title if one gets created (e.g. "OLT-01 DOWN")
     * @returns {Promise<{action: string, incidentId: number|null}>} What happened
     */
    static async onTransition(userID, rootNodeID, newStatus, title) {
        const existing = await R.getRow(
            "SELECT id FROM nms_incident WHERE root_node_id = ? AND status NOT IN ('RESOLVED', 'CLOSED') ORDER BY id DESC LIMIT 1",
            [rootNodeID]
        );
        const action = CorrelationEngine.decideAction(!!existing, newStatus);

        if (action === "CREATE") {
            const impact = await DependencyGraph.walkDownstream(rootNodeID);

            const incidentID = await R.knex("nms_incident").insert({
                user_id: userID,
                root_node_id: rootNodeID,
                title,
                status: "DETECTED",
            });
            const id = Array.isArray(incidentID) ? incidentID[0] : incidentID;

            for (const node of impact) {
                await R.knex("nms_incident_impact").insert({ incident_id: id, node_id: node.nodeId });
            }
            await R.knex("nms_incident_event").insert({
                incident_id: id,
                event_type: "DETECTED",
                message: `${title} - ${impact.length} downstream resource(s) affected`,
            });

            return { action, incidentId: id };
        }

        if (action === "RESOLVE") {
            await R.knex("nms_incident")
                .where({ id: existing.id })
                .update({ status: "RESOLVED", resolved_at: R.knex.fn.now(), updated_at: R.knex.fn.now() });
            await R.knex("nms_incident_event").insert({
                incident_id: existing.id,
                event_type: "RESOLVED",
                message: "Root cause recovered",
            });
            return { action, incidentId: existing.id };
        }

        return { action, incidentId: existing ? existing.id : null };
    }
}

module.exports = {
    CorrelationEngine,
};
