const { describe, test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

/**
 * Verifies the customer/service schema migration (component audit S0.1 -
 * this data model didn't exist before) creates the expected tables and
 * columns, using the same isolated-throwaway-database pattern as
 * test-migration.js: a fresh temp SQLite file, cleaned up after itself,
 * never touching db/kuma.db.
 */
describe("Customer/service schema", () => {
    test("customer and service tables exist with expected columns after migration", async () => {
        const testDbPath = path.join(__dirname, "../../data/test-customer-service-schema.db");
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

            const customerColumns = await R.knex("customer").columnInfo();
            for (const expected of ["id", "user_id", "name", "contact", "status", "created_at", "updated_at"]) {
                assert.ok(expected in customerColumns, `customer table is missing column "${expected}"`);
            }

            const serviceColumns = await R.knex("service").columnInfo();
            for (const expected of [
                "id",
                "customer_id",
                "monitor_id",
                "status",
                "plan",
                "ip_address",
                "mac_address",
                "vlan",
                "created_at",
                "updated_at",
            ]) {
                assert.ok(expected in serviceColumns, `service table is missing column "${expected}"`);
            }

            // Confirm the actual relationship works end to end, not just that
            // the columns exist: insert a user, a customer under it, and a
            // service under that customer, then read the chain back.
            const userID = await R.knex("user").insert({ username: "test-user", password: "x" });
            const customerID = await R.knex("customer").insert({
                user_id: userID[0],
                name: "Test ISP Customer",
            });
            await R.knex("service").insert({
                customer_id: customerID[0],
                status: "active",
                plan: "100Mbps",
            });

            const service = await R.knex("service").where({ customer_id: customerID[0] }).first();
            assert.strictEqual(service.plan, "100Mbps");
            assert.strictEqual(service.monitor_id, null, "monitor_id must be nullable - a service can exist before an ONU is assigned");
        } finally {
            await R.knex.destroy();
            if (fs.existsSync(testDbPath)) {
                fs.unlinkSync(testDbPath);
            }
        }
    });
});
