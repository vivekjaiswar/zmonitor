const { describe, test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

/**
 * Verifies the nms_incident schema and CorrelationEngine.onTransition
 * against an isolated throwaway SQLite file - same pattern as
 * test-migration.js, test-customer-service-schema.js, and
 * test-dependency-graph-schema.js, never touching db/kuma.db.
 *
 * Models the spec's own example: OLT-01 DOWN -> one root incident with
 * every downstream node (PONs, ONUs, services, customers) recorded as
 * impact, not one alert per leaf. Then: a repeat DOWN doesn't duplicate
 * the incident, and recovery resolves it.
 */
describe("Correlation engine - DB-backed", () => {
    test("OLT down creates one incident with full downstream impact; repeat DOWN doesn't duplicate; recovery resolves it", async () => {
        const testDbPath = path.join(__dirname, "../../data/test-correlation-engine.db");
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
            connection: { filename: testDbPath },
            useNullAsDefault: true,
        });

        const { R } = require("redbean-node");
        R.setup(db);

        try {
            const { createTables } = require("../../db/knex_init_db.js");
            await createTables();
            await R.knex.migrate.latest({ directory: path.join(__dirname, "../../db/knex_migrations") });

            const { DependencyGraph } = require("../../server/dependency-graph");
            const { CorrelationEngine } = require("../../server/correlation-engine");
            const { UP, DOWN } = require("../../src/util");

            const userIDResult = await R.knex("user").insert({ username: "test-user", password: "x" });
            const uid = Array.isArray(userIDResult) ? userIDResult[0] : userIDResult;

            // Build the chain: OLT -> 2 PONs -> 2 ONUs each -> 1 service -> 1 customer
            // (mirrors the spec's own OLT-01/PON/ONU/customer example, scaled down).
            const oltMonitor = await R.knex("monitor").insert({ name: "OLT-01", type: "snmp", user_id: uid });
            const oltMonitorID = Array.isArray(oltMonitor) ? oltMonitor[0] : oltMonitor;
            const oltNode = await DependencyGraph.getOrCreateNode(uid, DependencyGraph.NODE_TYPES.OLT, "monitor", oltMonitorID);

            const affectedNodeIds = [];
            for (let i = 0; i < 2; i++) {
                const ponMonitor = await R.knex("monitor").insert({ name: `PON-${i}`, type: "snmp", user_id: uid });
                const ponMonitorID = Array.isArray(ponMonitor) ? ponMonitor[0] : ponMonitor;
                const ponNode = await DependencyGraph.getOrCreateNode(uid, DependencyGraph.NODE_TYPES.PON, "monitor", ponMonitorID);
                await DependencyGraph.addEdge(oltNode, ponNode, DependencyGraph.EDGE_TYPES.CONTAINS);
                affectedNodeIds.push(ponNode);

                for (let j = 0; j < 2; j++) {
                    const onuMonitor = await R.knex("monitor").insert({ name: `ONU-${i}-${j}`, type: "snmp", user_id: uid });
                    const onuMonitorID = Array.isArray(onuMonitor) ? onuMonitor[0] : onuMonitor;
                    const onuNode = await DependencyGraph.getOrCreateNode(uid, DependencyGraph.NODE_TYPES.ONU, "monitor", onuMonitorID);
                    await DependencyGraph.addEdge(ponNode, onuNode, DependencyGraph.EDGE_TYPES.CONTAINS);
                    affectedNodeIds.push(onuNode);
                }
            }

            const customer = await R.knex("customer").insert({ user_id: uid, name: "Test Customer" });
            const customerID = Array.isArray(customer) ? customer[0] : customer;
            const service = await R.knex("service").insert({ customer_id: customerID, status: "active" });
            const serviceID = Array.isArray(service) ? service[0] : service;
            const serviceNode = await DependencyGraph.getOrCreateNode(uid, DependencyGraph.NODE_TYPES.SERVICE, "service", serviceID);
            // Wire the service under the first ONU (affectedNodeIds[1] is ONU-0-0).
            await DependencyGraph.addEdge(affectedNodeIds[1], serviceNode, DependencyGraph.EDGE_TYPES.SERVES);
            affectedNodeIds.push(serviceNode);

            const customerNode = await DependencyGraph.getOrCreateNode(uid, DependencyGraph.NODE_TYPES.CUSTOMER, "customer", customerID);
            await DependencyGraph.addEdge(serviceNode, customerNode, DependencyGraph.EDGE_TYPES.SERVES);
            affectedNodeIds.push(customerNode);

            // --- OLT goes DOWN ---
            const first = await CorrelationEngine.onTransition(uid, oltNode, DOWN, "OLT-01 DOWN");
            assert.strictEqual(first.action, "CREATE");
            assert.ok(first.incidentId, "an incident id must be returned");

            const impactRows = await R.getAll("SELECT node_id FROM nms_incident_impact WHERE incident_id = ?", [
                first.incidentId,
            ]);
            const impactedNodeIds = impactRows.map((r) => r.node_id).sort((a, b) => a - b);
            assert.deepStrictEqual(
                impactedNodeIds,
                [...affectedNodeIds].sort((a, b) => a - b),
                "every downstream node (2 PONs, 4 ONUs, 1 service, 1 customer = 8) must be recorded as impact - not one incident per leaf"
            );

            const eventCount = await R.getCell("SELECT COUNT(*) FROM nms_incident_event WHERE incident_id = ?", [
                first.incidentId,
            ]);
            assert.strictEqual(eventCount, 1, "one DETECTED timeline event");

            // --- Repeat DOWN beat (e.g. still down on next poll) must NOT create a second incident ---
            const second = await CorrelationEngine.onTransition(uid, oltNode, DOWN, "OLT-01 DOWN");
            assert.strictEqual(second.action, "IGNORE");
            assert.strictEqual(second.incidentId, first.incidentId);

            const totalIncidents = await R.getCell("SELECT COUNT(*) FROM nms_incident WHERE root_node_id = ?", [oltNode]);
            assert.strictEqual(totalIncidents, 1, "a repeat DOWN must not duplicate the incident");

            // --- OLT recovers ---
            const third = await CorrelationEngine.onTransition(uid, oltNode, UP, "OLT-01 UP");
            assert.strictEqual(third.action, "RESOLVE");
            assert.strictEqual(third.incidentId, first.incidentId);

            const resolved = await R.getRow("SELECT status, resolved_at FROM nms_incident WHERE id = ?", [
                first.incidentId,
            ]);
            assert.strictEqual(resolved.status, "RESOLVED");
            assert.ok(resolved.resolved_at, "resolved_at must be set");

            // --- A new DOWN after resolution must create a NEW incident, not reopen the resolved one ---
            const fourth = await CorrelationEngine.onTransition(uid, oltNode, DOWN, "OLT-01 DOWN again");
            assert.strictEqual(fourth.action, "CREATE");
            assert.notStrictEqual(fourth.incidentId, first.incidentId, "a new failure after resolution must open a new incident");
        } finally {
            await R.knex.destroy();
            if (fs.existsSync(testDbPath)) {
                fs.unlinkSync(testDbPath);
            }
        }
    });
});
