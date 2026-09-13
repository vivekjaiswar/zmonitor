const { R } = require("redbean-node");

/**
 * Generic dependency graph: typed NODEs wrapping real entities (a monitor,
 * a customer, a service), connected by typed, directional EDGEs. The
 * correlation engine walks this graph - it never branches on node type
 * (no "if node.type === 'OLT'"), so adding a new resource type later
 * (ROUTER, BGP_PEER, ...) means adding rows, not new code.
 */
class DependencyGraph {
    static NODE_TYPES = Object.freeze({
        DEVICE: "DEVICE",
        INTERFACE: "INTERFACE",
        POP: "POP",
        OLT: "OLT",
        PON: "PON",
        ONU: "ONU",
        SERVICE: "SERVICE",
        CUSTOMER: "CUSTOMER",
        // Extension points, not populated by anything yet:
        ROUTER: "ROUTER",
        SWITCH: "SWITCH",
        BGP_PEER: "BGP_PEER",
        UPLINK: "UPLINK",
    });

    static EDGE_TYPES = Object.freeze({
        DEPENDS_ON: "DEPENDS_ON",
        CONNECTED_TO: "CONNECTED_TO",
        SERVES: "SERVES",
        CONTAINS: "CONTAINS",
        UPSTREAM: "UPSTREAM",
        DOWNSTREAM: "DOWNSTREAM",
    });

    /**
     * Pure breadth-first traversal over an adjacency list - no I/O. Used
     * for both downstream (failure -> affected resources) and upstream
     * (resource -> what it depends on) walks: callers build the adjacency
     * map in the direction they want to walk (forward edges for
     * downstream, reversed edges for upstream) and this function doesn't
     * need to know which.
     * @param {number} startNodeId Node to walk from
     * @param {Map<number, Array<{toNodeId: number, edgeType: string}>>} adjacency Outgoing edges per node, in the walk direction
     * @param {number} maxDepth Maximum hops - protects against a cycle or a runaway graph
     * @returns {Array<{nodeId: number, depth: number, edgeType: string}>} Reachable nodes, nearest first, each visited once
     */
    static walkFromAdjacency(startNodeId, adjacency, maxDepth = 10) {
        const visited = new Set([startNodeId]);
        const result = [];
        let frontier = [startNodeId];

        for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
            const nextFrontier = [];
            for (const nodeId of frontier) {
                const edges = adjacency.get(nodeId) || [];
                for (const edge of edges) {
                    if (!visited.has(edge.toNodeId)) {
                        visited.add(edge.toNodeId);
                        result.push({ nodeId: edge.toNodeId, depth, edgeType: edge.edgeType });
                        nextFrontier.push(edge.toNodeId);
                    }
                }
            }
            frontier = nextFrontier;
        }

        return result;
    }

    /**
     * Find or create the graph node wrapping a real entity. Idempotent -
     * calling this twice for the same (refTable, refId) returns the same
     * node.
     * @param {number} userID Owning user
     * @param {string} nodeType One of NODE_TYPES
     * @param {string} refTable Table the node wraps ('monitor', 'customer', 'service')
     * @param {number} refID Row id in that table
     * @returns {Promise<number>} The graph node's id
     */
    static async getOrCreateNode(userID, nodeType, refTable, refID) {
        const existing = await R.getRow("SELECT id FROM graph_node WHERE ref_table = ? AND ref_id = ?", [
            refTable,
            refID,
        ]);
        if (existing) {
            return existing.id;
        }

        const id = await R.knex("graph_node").insert({
            user_id: userID,
            node_type: nodeType,
            ref_table: refTable,
            ref_id: refID,
        });
        return Array.isArray(id) ? id[0] : id;
    }

    /**
     * Create a directed edge between two nodes. Idempotent - the
     * (from, to, type) unique constraint means calling this twice with the
     * same arguments is a no-op the second time.
     * @param {number} fromNodeID Source node id
     * @param {number} toNodeID Target node id
     * @param {string} edgeType One of EDGE_TYPES
     * @returns {Promise<void>}
     */
    static async addEdge(fromNodeID, toNodeID, edgeType) {
        const existing = await R.getRow(
            "SELECT id FROM graph_edge WHERE from_node_id = ? AND to_node_id = ? AND edge_type = ?",
            [fromNodeID, toNodeID, edgeType]
        );
        if (existing) {
            return;
        }

        await R.knex("graph_edge").insert({
            from_node_id: fromNodeID,
            to_node_id: toNodeID,
            edge_type: edgeType,
        });
    }

    /**
     * Walk downstream from a node (what depends on it, transitively) -
     * e.g. an OLT's affected PONs/ONUs/services/customers.
     * @param {number} nodeID Node to walk from
     * @param {number} maxDepth Maximum hops
     * @returns {Promise<Array<{nodeId: number, depth: number, edgeType: string}>>} Reachable downstream nodes
     */
    static async walkDownstream(nodeID, maxDepth = 10) {
        // ponytail: loads every edge in the database, not just the
        // relevant subgraph. Fine at current scale (no evidence of a
        // large graph yet - nothing populates this table today). Upgrade
        // path if that changes: scope this query by user_id at minimum,
        // or move to a recursive CTE that stops at maxDepth in SQL rather
        // than fetching everything and stopping in application code.
        const edges = await R.getAll("SELECT from_node_id, to_node_id, edge_type FROM graph_edge");
        const adjacency = new Map();
        for (const edge of edges) {
            if (!adjacency.has(edge.from_node_id)) {
                adjacency.set(edge.from_node_id, []);
            }
            adjacency.get(edge.from_node_id).push({ toNodeId: edge.to_node_id, edgeType: edge.edge_type });
        }
        return DependencyGraph.walkFromAdjacency(nodeID, adjacency, maxDepth);
    }

    /**
     * Walk upstream from a node (what it depends on, transitively) - the
     * reverse direction of walkDownstream, same traversal logic.
     * @param {number} nodeID Node to walk from
     * @param {number} maxDepth Maximum hops
     * @returns {Promise<Array<{nodeId: number, depth: number, edgeType: string}>>} Reachable upstream nodes
     */
    static async walkUpstream(nodeID, maxDepth = 10) {
        const edges = await R.getAll("SELECT from_node_id, to_node_id, edge_type FROM graph_edge");
        const adjacency = new Map();
        for (const edge of edges) {
            // Reversed: walking upstream means following edges backwards.
            if (!adjacency.has(edge.to_node_id)) {
                adjacency.set(edge.to_node_id, []);
            }
            adjacency.get(edge.to_node_id).push({ toNodeId: edge.from_node_id, edgeType: edge.edge_type });
        }
        return DependencyGraph.walkFromAdjacency(nodeID, adjacency, maxDepth);
    }
}

module.exports = {
    DependencyGraph,
};
