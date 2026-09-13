const { describe, test } = require("node:test");
const assert = require("node:assert");
const { DependencyGraph } = require("../../server/dependency-graph");

/**
 * DependencyGraph.walkFromAdjacency is pure (no database access), so it's
 * covered directly here with a hand-built adjacency map modeling the
 * spec's own example chain: OLT -> PON -> ONU -> Service -> Customer.
 * getOrCreateNode/addEdge/walkDownstream/walkUpstream need a live DB
 * connection and are not exercised in this pass.
 */
describe("DependencyGraph.walkFromAdjacency", () => {
    // Node ids standing in for: 1=OLT, 2=PON-A, 3=PON-B, 4=ONU-1 (under PON-A),
    // 5=ONU-2 (under PON-A), 6=Service-1 (under ONU-1), 7=Customer-1 (under Service-1).
    const chainAdjacency = new Map([
        [1, [{ toNodeId: 2, edgeType: "CONTAINS" }, { toNodeId: 3, edgeType: "CONTAINS" }]],
        [2, [{ toNodeId: 4, edgeType: "CONTAINS" }, { toNodeId: 5, edgeType: "CONTAINS" }]],
        [4, [{ toNodeId: 6, edgeType: "SERVES" }]],
        [6, [{ toNodeId: 7, edgeType: "SERVES" }]],
    ]);

    test("walks the full downstream chain from the root (OLT down affects everything under it)", () => {
        const reachable = DependencyGraph.walkFromAdjacency(1, chainAdjacency);
        const nodeIds = reachable.map((r) => r.nodeId).sort();

        assert.deepStrictEqual(nodeIds, [2, 3, 4, 5, 6, 7]);
    });

    test("depth increases correctly along the chain", () => {
        const reachable = DependencyGraph.walkFromAdjacency(1, chainAdjacency);
        const byNode = Object.fromEntries(reachable.map((r) => [r.nodeId, r.depth]));

        assert.strictEqual(byNode[2], 1, "PON-A is 1 hop from OLT");
        assert.strictEqual(byNode[4], 2, "ONU-1 is 2 hops from OLT");
        assert.strictEqual(byNode[6], 3, "Service-1 is 3 hops from OLT");
        assert.strictEqual(byNode[7], 4, "Customer-1 is 4 hops from OLT");
    });

    test("walking from a leaf PON only reaches its own descendants, not siblings", () => {
        const reachable = DependencyGraph.walkFromAdjacency(2, chainAdjacency);
        const nodeIds = reachable.map((r) => r.nodeId).sort();

        // PON-A's descendants (4, 5, 6, 7), never PON-B (3) or the OLT (1).
        assert.deepStrictEqual(nodeIds, [4, 5, 6, 7]);
    });

    test("a node with no outgoing edges (a leaf) reaches nothing", () => {
        const reachable = DependencyGraph.walkFromAdjacency(7, chainAdjacency);
        assert.deepStrictEqual(reachable, []);
    });

    test("a cycle does not cause an infinite loop", () => {
        const cyclic = new Map([
            [1, [{ toNodeId: 2, edgeType: "DEPENDS_ON" }]],
            [2, [{ toNodeId: 3, edgeType: "DEPENDS_ON" }]],
            [3, [{ toNodeId: 1, edgeType: "DEPENDS_ON" }]], // cycles back to the start
        ]);

        const reachable = DependencyGraph.walkFromAdjacency(1, cyclic);
        const nodeIds = reachable.map((r) => r.nodeId).sort();

        // Visits 2 and 3 once each; never revisits 1 (the start) or loops forever.
        assert.deepStrictEqual(nodeIds, [2, 3]);
    });

    test("maxDepth cuts off traversal before reaching the full chain", () => {
        const reachable = DependencyGraph.walkFromAdjacency(1, chainAdjacency, 2);
        const nodeIds = reachable.map((r) => r.nodeId).sort();

        // Only 2 hops allowed: reaches PON-A/PON-B (depth 1) and ONU-1/ONU-2
        // (depth 2), not Service-1 or Customer-1 (depth 3-4).
        assert.deepStrictEqual(nodeIds, [2, 3, 4, 5]);
    });

    test("a diamond (two paths to the same node) visits that node only once", () => {
        // 1 -> 2, 1 -> 3, both 2 and 3 -> 4
        const diamond = new Map([
            [1, [{ toNodeId: 2, edgeType: "DEPENDS_ON" }, { toNodeId: 3, edgeType: "DEPENDS_ON" }]],
            [2, [{ toNodeId: 4, edgeType: "DEPENDS_ON" }]],
            [3, [{ toNodeId: 4, edgeType: "DEPENDS_ON" }]],
        ]);

        const reachable = DependencyGraph.walkFromAdjacency(1, diamond);
        const occurrencesOf4 = reachable.filter((r) => r.nodeId === 4).length;

        assert.strictEqual(occurrencesOf4, 1, "node 4 must appear exactly once despite two paths reaching it");
    });
});
