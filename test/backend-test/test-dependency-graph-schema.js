const { describe, test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

/**
 * Verifies the dependency graph migration and the DB-touching parts of
 * DependencyGraph (getOrCreateNode, addEdge, walkDownstream, walkUpstream)
 * against an isolated throwaway SQLite file - same pattern as
 * test-migration.js and test-customer-service-schema.js, never touching
 * db/kuma.db.
 */
describe("Dependency graph schema + DB-backed traversal", () => {
    test("graph_node/graph_edge migrate cleanly and support a real OLT->PON->ONU walk", async () => {
        const testDbPath = path.join(__dirname, "../../data/test-dependency-graph.db");
        const testDbDir = path.dirname(testDbPath);

        if (!fs.existsSync(testDbDir)) {
            fs.mkdirSync(testDbDir, { recursive: true });
        }
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        const Dialect = require("knex/lib/dialects/sqlite3/index.js");
        Dialect.prototype._driver = () => require("@louislam/sqlite3");

        const knexLib = require("knex");
        const db = knexLib({
            client: Dialect,
            connection: {
                filename: testDbPath,
            },
            useNullAsDefault: true,
        });

        const { R } = require("redbean-node");
        R.setup(db);

        try {
            const { createTables } = require("../../db/knex_init_db.js");
            await createTables();
            await R.knex.migrate.latest({
                directory: path.join(__dirname, "../../db/knex_migrations"),
            });

            // Re-require after R.setup so the module's R reference is bound
            // to this test's isolated connection.
            const { DependencyGraph } = require("../../server/dependency-graph");

            const userID = await R.knex("user").insert({ username: "test-user", password: "x" });
            const uid = Array.isArray(userID) ? userID[0] : userID;

            const monitorID = await R.knex("monitor").insert({ name: "OLT-TEST-01", type: "snmp", user_id: uid });
            const oltID = Array.isArray(monitorID) ? monitorID[0] : monitorID;

            const customerID = await R.knex("customer").insert({ user_id: uid, name: "Test Customer" });
            const cid = Array.isArray(customerID) ? customerID[0] : customerID;
            const serviceID = await R.knex("service").insert({ customer_id: cid, status: "active" });
            const sid = Array.isArray(serviceID) ? serviceID[0] : serviceID;

            const oltNode = await DependencyGraph.getOrCreateNode(uid, DependencyGraph.NODE_TYPES.OLT, "monitor", oltID);
            const serviceNode = await DependencyGraph.getOrCreateNode(
                uid,
                DependencyGraph.NODE_TYPES.SERVICE,
                "service",
                sid
            );

            // getOrCreateNode is idempotent - calling it again for the same
            // (refTable, refId) must return the same node, not create a duplicate.
            const oltNodeAgain = await DependencyGraph.getOrCreateNode(
                uid,
                DependencyGraph.NODE_TYPES.OLT,
                "monitor",
                oltID
            );
            assert.strictEqual(oltNodeAgain, oltNode, "getOrCreateNode must be idempotent");

            await DependencyGraph.addEdge(oltNode, serviceNode, DependencyGraph.EDGE_TYPES.SERVES);
            // addEdge is idempotent too - a duplicate call must not throw or duplicate the row.
            await DependencyGraph.addEdge(oltNode, serviceNode, DependencyGraph.EDGE_TYPES.SERVES);

            const edgeCount = await R.getCell("SELECT COUNT(*) FROM graph_edge");
            assert.strictEqual(edgeCount, 1, "duplicate addEdge calls must not create duplicate rows");

            const downstream = await DependencyGraph.walkDownstream(oltNode);
            assert.strictEqual(downstream.length, 1);
            assert.strictEqual(downstream[0].nodeId, serviceNode);

            const upstream = await DependencyGraph.walkUpstream(serviceNode);
            assert.strictEqual(upstream.length, 1);
            assert.strictEqual(upstream[0].nodeId, oltNode);
        } finally {
            await R.knex.destroy();
            if (fs.existsSync(testDbPath)) {
                fs.unlinkSync(testDbPath);
            }
        }
    });
});
