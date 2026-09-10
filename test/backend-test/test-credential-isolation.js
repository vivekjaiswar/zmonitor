const { describe, test } = require("node:test");
const assert = require("node:assert");
const Monitor = require("../../server/model/monitor");

/**
 * Builds a Monitor instance without touching the database, following the
 * Object.create(Monitor.prototype) pattern used elsewhere in this suite
 * (see test-monitor-response.js).
 * @param {object} overrides Fields to override on the built monitor
 * @returns {Monitor} A Monitor instance suitable for calling toJSON() on
 */
function buildMonitor(overrides = {}) {
    const monitor = Object.create(Monitor.prototype);
    Object.assign(
        monitor,
        {
            id: 1,
            name: "Test SNMP Monitor",
            type: "snmp",
            accepted_statuscodes_json: "[]",
            kafkaProducerBrokers: "[]",
            rabbitmqNodes: "[]",
            conditions: "[]",
            kafkaProducerSaslOptions: "{}",
            // Sensitive fields - one representative per category from the
            // includeSensitiveData block in Monitor.toJSON().
            radiusPassword: "public-v2c-community-string",
            radiusSecret: "shared-secret",
            basic_auth_pass: "hunter2",
            oauth_client_secret: "oauth-secret",
            bearer_token: "bearer-token",
            mqttPassword: "mqtt-pass",
            tlsKey: "-----BEGIN PRIVATE KEY-----",
            rabbitmqPassword: "rabbit-pass",
            pushToken: "push-token",
            databaseConnectionString: "postgres://user:pass@host/db",
        },
        overrides
    );
    return monitor;
}

const preloadData = {
    paths: new Map(),
    childrenIDs: new Map(),
    activeStatus: new Map(),
    forceInactive: new Map(),
    notifications: new Map(),
    tags: new Map(),
    maintenanceStatus: new Map(),
};

describe("Monitor.toJSON credential isolation", () => {
    test("defaults to excluding sensitive data when includeSensitiveData is omitted", () => {
        const monitor = buildMonitor();
        const json = monitor.toJSON(preloadData);

        assert.strictEqual(json.includeSensitiveData, false);
        assert.strictEqual(json.radiusPassword, undefined, "SNMP community string must not leak by default");
        assert.strictEqual(json.basic_auth_pass, undefined);
        assert.strictEqual(json.databaseConnectionString, undefined);
        assert.strictEqual(json.tlsKey, undefined);
    });

    test("excludes sensitive data for a read-only/employee-scoped request", () => {
        const monitor = buildMonitor();
        const json = monitor.toJSON(preloadData, false);

        for (const key of [
            "radiusPassword",
            "radiusSecret",
            "basic_auth_pass",
            "oauth_client_secret",
            "bearer_token",
            "mqttPassword",
            "tlsKey",
            "rabbitmqPassword",
            "pushToken",
            "databaseConnectionString",
        ]) {
            assert.strictEqual(json[key], undefined, `${key} must not be present for a non-admin request`);
        }
    });

    test("includes sensitive data only when explicitly requested (admin path)", () => {
        const monitor = buildMonitor();
        const json = monitor.toJSON(preloadData, true);

        assert.strictEqual(json.includeSensitiveData, true);
        assert.strictEqual(json.radiusPassword, "public-v2c-community-string");
        assert.strictEqual(json.basic_auth_pass, "hunter2");
        assert.strictEqual(json.databaseConnectionString, "postgres://user:pass@host/db");
    });

    test("non-sensitive fields are present regardless of includeSensitiveData", () => {
        const monitor = buildMonitor();
        const jsonSafe = monitor.toJSON(preloadData, false);
        const jsonFull = monitor.toJSON(preloadData, true);

        assert.strictEqual(jsonSafe.name, "Test SNMP Monitor");
        assert.strictEqual(jsonFull.name, "Test SNMP Monitor");
        assert.strictEqual(jsonSafe.type, "snmp");
    });
});
