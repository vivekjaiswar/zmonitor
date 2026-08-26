const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { GenericContainer } = require("testcontainers");
const { SNMPMonitorType } = require("../../server/monitor-types/snmp");
const { UP } = require("../../src/util");
const snmp = require("net-snmp");

describe("SNMPMonitorType", () => {
    test(
        "check() sets heartbeat to UP when SNMP agent responds",
        {
            skip: !!process.env.CI && (process.platform !== "linux" || process.arch !== "x64"),
        },
        async () => {
            const container = await new GenericContainer("polinux/snmpd").withExposedPorts("161/udp").start();

            try {
                // Get the mapped UDP port
                const hostPort = container.getMappedPort("161/udp");
                const hostIp = container.getHost();

                // UDP service small wait to ensure snmpd is ready inside container
                await new Promise((r) => setTimeout(r, 2000));

                const monitor = {
                    type: "snmp",
                    hostname: hostIp,
                    port: hostPort,
                    snmpVersion: "2c",
                    radiusPassword: "public",
                    snmpOid: "1.3.6.1.2.1.1.1.0",
                    timeout: 5,
                    maxretries: 1,
                    jsonPath: "$",
                    jsonPathOperator: "!=",
                    expectedValue: "",
                };

                const snmpMonitor = new SNMPMonitorType();
                const heartbeat = {};

                await snmpMonitor.check(monitor, heartbeat);

                assert.strictEqual(heartbeat.status, UP);
                assert.match(heartbeat.msg, /JSON query passes/);
            } finally {
                await container.stop();
            }
        }
    );

    test(
        "check() throws when SNMP agent does not respond",
        {
            skip: !!process.env.CI && (process.platform !== "linux" || process.arch !== "x64"),
        },
        async () => {
            const monitor = {
                type: "snmp",
                hostname: "127.0.0.1",
                port: 65530, // Assuming no SNMP agent is running here
                snmpVersion: "2c",
                radiusPassword: "public",
                snmpOid: "1.3.6.1.2.1.1.1.0",
                timeout: 1,
                maxretries: 1,
            };

            const snmpMonitor = new SNMPMonitorType();
            const heartbeat = {};

            await assert.rejects(() => snmpMonitor.check(monitor, heartbeat), /timeout|RequestTimedOutError/i);
        }
    );

    test("check() uses SNMPv3 noAuthNoPriv session when version is 3", async () => {
        const originalCreateV3Session = snmp.createV3Session;
        const originalCreateSession = snmp.createSession;

        let createV3Called = false;
        let createSessionCalled = false;
        let receivedOptions = null;

        // Stub createV3Session
        snmp.createV3Session = function (_host, _username, options) {
            createV3Called = true;
            receivedOptions = options;

            return {
                on: () => {},
                close: () => {},
                // Stop execution after session creation to avoid real network I/O.
                get: (_oids, cb) => cb(new Error("stop test here")),
            };
        };

        // Stub createSession
        snmp.createSession = function () {
            createSessionCalled = true;
            return {};
        };

        const monitor = {
            type: "snmp",
            hostname: "127.0.0.1",
            port: 161,
            timeout: 5,
            maxretries: 1,
            snmpVersion: "3",
            snmp_v3_username: "testuser",
            snmpOid: "1.3.6.1.2.1.1.1.0",
        };

        const snmpMonitor = new SNMPMonitorType();
        const heartbeat = {};

        await assert.rejects(() => snmpMonitor.check(monitor, heartbeat), /stop test here/);

        // Assertions
        assert.strictEqual(createV3Called, true);
        assert.strictEqual(createSessionCalled, false);
        assert.strictEqual(receivedOptions.securityLevel, snmp.SecurityLevel.noAuthNoPriv);

        // Restore originals
        snmp.createV3Session = originalCreateV3Session;
        snmp.createSession = originalCreateSession;
    });

    test("checkInterfaces() walks ifTable/ifXTable at their *table* OIDs, not one level too deep", async () => {
        // Regression guard: net-snmp's Session#tableColumns appends ".1.<column>"
        // to whatever OID it's given, so it must be called with the table OID
        // (e.g. 1.3.6.1.2.1.2.2), not the entry OID one level deeper
        // (1.3.6.1.2.1.2.2.1) - passing the entry OID silently walks the wrong
        // branch and comes back with zero rows instead of erroring, so this is
        // easy to get wrong and have it look like it's working against a real
        // device that happens to have nothing else nearby in the tree.
        const calledOids = [];
        const fakeSession = {
            on: () => {},
            close: () => {},
            tableColumns: (oid, _columns, cb) => {
                calledOids.push(oid);
                if (oid === "1.3.6.1.2.1.2.2") {
                    cb(null, {
                        1: { 2: Buffer.from("lo"), 5: 10000000, 8: 1, 10: 100, 14: 0, 16: 100, 20: 0 },
                    });
                } else {
                    cb(null, {});
                }
            },
        };

        const snmpMonitor = new SNMPMonitorType();
        snmpMonitor.createSession = () => fakeSession;

        const { R } = require("redbean-node");
        const originalFindOne = R.findOne;
        const originalDispense = R.dispense;
        const originalStore = R.store;
        R.findOne = async () => null;
        R.dispense = (type) => ({ type });
        R.store = async () => {};

        const monitor = { id: 1, snmpMode: "interfaces", hostname: "unused", snmpVersion: "2c", radiusPassword: "public", timeout: 5, maxretries: 1 };
        const heartbeat = {};

        try {
            await snmpMonitor.checkInterfaces(monitor, heartbeat);
        } finally {
            R.findOne = originalFindOne;
            R.dispense = originalDispense;
            R.store = originalStore;
        }

        assert.deepStrictEqual(calledOids, ["1.3.6.1.2.1.2.2", "1.3.6.1.2.1.31.1.1"]);
        assert.strictEqual(heartbeat.status, UP);
        assert.strictEqual(heartbeat.msg, "Polled 1 interface");
    });

    describe("counterDelta()", () => {
        const snmpMonitor = new SNMPMonitorType();

        test("no wrap: returns the plain difference", () => {
            assert.strictEqual(snmpMonitor.counterDelta(100n, 150n, false), 50n);
        });

        test("32-bit wrap: accounts for the rollover at 2^32", () => {
            const max32 = 2n ** 32n;
            const previous = max32 - 10n;
            const current = 5n;
            assert.strictEqual(snmpMonitor.counterDelta(previous, current, false), 15n);
        });

        test("64-bit HC counter decrease: treated as a reset, not a wrap", () => {
            assert.strictEqual(snmpMonitor.counterDelta(1000n, 10n, true), 0n);
        });

        test("handles a string previous value (as read back from SQLite)", () => {
            assert.strictEqual(snmpMonitor.counterDelta("100", 250n, false), 150n);
        });
    });

    describe("toBigInt()", () => {
        const snmpMonitor = new SNMPMonitorType();

        test("converts a plain number", () => {
            assert.strictEqual(snmpMonitor.toBigInt(12345), 12345n);
        });

        test("converts a Buffer (as Counter64 values arrive)", () => {
            assert.strictEqual(snmpMonitor.toBigInt(Buffer.from([0x01, 0x00])), 256n);
        });

        test("returns null for undefined/null", () => {
            assert.strictEqual(snmpMonitor.toBigInt(undefined), null);
            assert.strictEqual(snmpMonitor.toBigInt(null), null);
        });
    });
});
