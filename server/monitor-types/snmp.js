const { MonitorType } = require("./monitor-type");
const { UP, log, evaluateJsonQuery } = require("../../src/util");
const snmp = require("net-snmp");
const { R } = require("redbean-node");
const dayjs = require("dayjs");

// Standard MIB-II / IF-MIB OIDs (RFC 1213 / RFC 2863) - work on virtually any
// SNMP-capable network device, no vendor-specific enterprise OIDs needed.
// Note: these are the *table* OIDs (one level above the entry/row OID) -
// net-snmp's Session#tableColumns appends ".1.<column>" itself.
const IF_TABLE = "1.3.6.1.2.1.2.2";
const IF_DESCR = 2;
const IF_SPEED = 5; // bits/sec, 32-bit - fallback when ifXTable is unavailable
const IF_OPER_STATUS = 8;
const IF_IN_OCTETS = 10; // 32-bit counter - fallback
const IF_IN_ERRORS = 14;
const IF_OUT_OCTETS = 16; // 32-bit counter - fallback
const IF_OUT_ERRORS = 20;
const OPER_STATUS_NAMES = { 1: "up", 2: "down", 3: "testing", 4: "unknown", 5: "dormant", 6: "notPresent", 7: "lowerLayerDown" };

// ifXTable (RFC 2863) - preferred when available: named interfaces and
// 64-bit "high capacity" counters, which don't wrap on multi-gigabit links
// the way the 32-bit ifTable counters do.
const IFX_TABLE = "1.3.6.1.2.1.31.1.1";
const IFX_NAME = 1;
const IFX_HC_IN_OCTETS = 6;
const IFX_HC_OUT_OCTETS = 10;
const IFX_HIGH_SPEED = 15; // Mbits/sec

const COUNTER32_MAX = 2 ** 32;

class SNMPMonitorType extends MonitorType {
    name = "snmp";

    /**
     * @inheritdoc
     */
    async check(monitor, heartbeat, _server) {
        if (monitor.snmpMode === "interfaces") {
            return this.checkInterfaces(monitor, heartbeat);
        }
        return this.checkOid(monitor, heartbeat);
    }

    /**
     * Open an SNMP session for this monitor, per its configured version/credentials
     * @param {Monitor} monitor Monitor providing SNMP connection details
     * @returns {import("net-snmp").Session} An open SNMP session
     */
    createSession(monitor) {
        const sessionOptions = {
            port: monitor.port || "161",
            retries: monitor.maxretries,
            timeout: monitor.timeout * 1000,
            version: snmp.Version[monitor.snmpVersion],
        };

        if (monitor.snmpVersion === "3") {
            if (!monitor.snmp_v3_username) {
                throw new Error("SNMPv3 username is required");
            }
            // SNMPv3 currently defaults to noAuthNoPriv.
            // Supporting authNoPriv / authPriv requires additional inputs
            // (auth/priv protocols, passwords), validation, secure storage,
            // and database migrations, which is intentionally left for
            // a follow-up PR to keep this change scoped.
            sessionOptions.securityLevel = snmp.SecurityLevel.noAuthNoPriv;
            sessionOptions.username = monitor.snmp_v3_username;
            return snmp.createV3Session(monitor.hostname, monitor.snmp_v3_username, sessionOptions);
        }

        return snmp.createSession(monitor.hostname, monitor.radiusPassword, sessionOptions);
    }

    /**
     * Single-OID poll-and-compare check (the original SNMP monitor behaviour)
     * @param {Monitor} monitor Monitor to check
     * @param {Heartbeat} heartbeat Monitor heartbeat to update
     * @returns {Promise<void>}
     */
    async checkOid(monitor, heartbeat) {
        let session;
        try {
            session = this.createSession(monitor);

            // Handle errors during session creation
            session.on("error", (error) => {
                throw new Error(`Error creating SNMP session: ${error.message}`);
            });

            const varbinds = await new Promise((resolve, reject) => {
                session.get([monitor.snmpOid], (error, varbinds) => {
                    error ? reject(error) : resolve(varbinds);
                });
            });
            log.debug(
                this.name,
                `SNMP: Received varbinds (Type: ${snmp.ObjectType[varbinds[0].type]} Value: ${varbinds[0].value})`
            );

            if (varbinds.length === 0) {
                throw new Error(`No varbinds returned from SNMP session (OID: ${monitor.snmpOid})`);
            }

            if (varbinds[0].type === snmp.ObjectType.NoSuchInstance) {
                throw new Error(`The SNMP query returned that no instance exists for OID ${monitor.snmpOid}`);
            }

            // We restrict querying to one OID per monitor, therefore `varbinds[0]` will always contain the value we're interested in.
            const value = varbinds[0].value;

            const { status, response } = await evaluateJsonQuery(
                value,
                monitor.jsonPath,
                monitor.jsonPathOperator,
                monitor.expectedValue
            );

            if (status) {
                heartbeat.status = UP;
                heartbeat.msg = `JSON query passes (comparing ${response} ${monitor.jsonPathOperator} ${monitor.expectedValue})`;
            } else {
                throw new Error(
                    `JSON query does not pass (comparing ${response} ${monitor.jsonPathOperator} ${monitor.expectedValue})`
                );
            }
        } finally {
            if (session) {
                session.close();
            }
        }
    }

    /**
     * Bulk-poll every interface on the device via IF-MIB/ifXTable, store
     * per-interface bandwidth samples, and mark the heartbeat up if the poll
     * itself succeeded (this monitor type reports device/poll reachability,
     * not any single interface's up/down state).
     * @param {Monitor} monitor Monitor to check
     * @param {Heartbeat} heartbeat Monitor heartbeat to update
     * @returns {Promise<void>}
     */
    async checkInterfaces(monitor, heartbeat) {
        let session;
        try {
            session = this.createSession(monitor);
            session.on("error", (error) => {
                throw new Error(`Error creating SNMP session: ${error.message}`);
            });

            const ifTable = await this.tableColumns(session, IF_TABLE, [
                IF_DESCR,
                IF_SPEED,
                IF_OPER_STATUS,
                IF_IN_OCTETS,
                IF_IN_ERRORS,
                IF_OUT_OCTETS,
                IF_OUT_ERRORS,
            ]);

            // ifXTable is standard but not universally implemented on older/simple
            // agents - degrade gracefully to the 32-bit ifTable counters rather
            // than failing the whole poll.
            let ifXTable = {};
            try {
                ifXTable = await this.tableColumns(session, IFX_TABLE, [IFX_NAME, IFX_HC_IN_OCTETS, IFX_HC_OUT_OCTETS, IFX_HIGH_SPEED]);
            } catch (e) {
                log.debug(this.name, `ifXTable unavailable for ${monitor.hostname}, falling back to ifTable only: ${e.message}`);
            }

            const ifIndexes = Object.keys(ifTable);
            if (ifIndexes.length === 0) {
                throw new Error("SNMP poll returned no interfaces (empty ifTable)");
            }

            const now = dayjs().unix();
            let polled = 0;

            for (const ifIndex of ifIndexes) {
                const row = ifTable[ifIndex];
                const xRow = ifXTable[ifIndex] || {};

                const hasHC = xRow[IFX_HC_IN_OCTETS] !== undefined && xRow[IFX_HC_OUT_OCTETS] !== undefined;
                const inOctets = hasHC ? this.toBigInt(xRow[IFX_HC_IN_OCTETS]) : this.toBigInt(row[IF_IN_OCTETS]);
                const outOctets = hasHC ? this.toBigInt(xRow[IFX_HC_OUT_OCTETS]) : this.toBigInt(row[IF_OUT_OCTETS]);
                if (inOctets === null || outOctets === null) {
                    continue;
                }

                const ifName = xRow[IFX_NAME]?.toString() || row[IF_DESCR]?.toString() || `if${ifIndex}`;
                const ifSpeed = xRow[IFX_HIGH_SPEED] !== undefined ? Number(xRow[IFX_HIGH_SPEED]) * 1_000_000 : Number(row[IF_SPEED]) || null;
                const operStatus = OPER_STATUS_NAMES[row[IF_OPER_STATUS]] || "unknown";

                let iface = await R.findOne("monitor_interface", " monitor_id = ? AND if_index = ? ", [monitor.id, ifIndex]);
                if (!iface) {
                    iface = R.dispense("monitor_interface");
                    iface.monitor_id = monitor.id;
                    iface.if_index = ifIndex;
                }

                // SQLite/RedBean hands booleans back as 0/1, not real booleans - compare loosely.
                const hadPreviousPoll = iface.last_poll_at && Boolean(iface.last_counters_are_hc) === hasHC;
                if (hadPreviousPoll) {
                    const elapsedSeconds = now - iface.last_poll_at;
                    if (elapsedSeconds > 0) {
                        const inDelta = this.counterDelta(iface.last_in_octets, inOctets, hasHC);
                        const outDelta = this.counterDelta(iface.last_out_octets, outOctets, hasHC);

                        const sample = R.dispense("interface_sample");
                        sample.interface_id = iface.id;
                        sample.timestamp = now;
                        sample.in_bps = (Number(inDelta) * 8) / elapsedSeconds;
                        sample.out_bps = (Number(outDelta) * 8) / elapsedSeconds;
                        sample.in_errors = Number(row[IF_IN_ERRORS]) || 0;
                        sample.out_errors = Number(row[IF_OUT_ERRORS]) || 0;
                        await R.store(sample);
                    }
                }

                iface.if_name = ifName;
                iface.if_speed = ifSpeed;
                iface.if_oper_status = operStatus;
                iface.last_in_octets = inOctets.toString();
                iface.last_out_octets = outOctets.toString();
                iface.last_counters_are_hc = hasHC;
                iface.last_poll_at = now;
                await R.store(iface);

                polled++;
            }

            heartbeat.status = UP;
            heartbeat.msg = `Polled ${polled} interface${polled === 1 ? "" : "s"}`;
        } finally {
            if (session) {
                session.close();
            }
        }
    }

    /**
     * Promise wrapper around net-snmp's Session#tableColumns bulk-walk
     * @param {import("net-snmp").Session} session Open SNMP session
     * @param {string} oid Base table OID (e.g. ifTable)
     * @param {number[]} columns Column numbers, relative to the table's row OID
     * @returns {Promise<object>} Table keyed by row index, then by column number
     */
    tableColumns(session, oid, columns) {
        return new Promise((resolve, reject) => {
            session.tableColumns(oid, columns, (error, table) => {
                error ? reject(error) : resolve(table);
            });
        });
    }

    /**
     * Parse an SNMP counter value (which net-snmp may hand back as a Buffer for
     * 64-bit Counter64 values, or a plain number for 32-bit counters) into a BigInt
     * @param {number|Buffer|undefined} value Raw SNMP counter value
     * @returns {bigint|null} Parsed value, or null if missing/unparseable
     */
    toBigInt(value) {
        if (value === undefined || value === null) {
            return null;
        }
        if (Buffer.isBuffer(value)) {
            return BigInt(`0x${value.toString("hex") || "0"}`);
        }
        return BigInt(Math.trunc(Number(value)));
    }

    /**
     * Compute the delta between two counter readings, correcting for a single
     * wraparound of the 32-bit counters (64-bit HC counters wrap so rarely on
     * real interface speeds that we don't attempt to correct for it).
     * @param {string|number} previousValue Previous raw counter reading
     * @param {bigint} currentValue Current raw counter reading
     * @param {boolean} isHC Whether these are 64-bit HC counters
     * @returns {bigint} Non-negative delta in the counter's units
     */
    counterDelta(previousValue, currentValue, isHC) {
        const previous = BigInt(previousValue ?? 0);
        if (currentValue >= previous) {
            return currentValue - previous;
        }
        if (isHC) {
            // A decrease on a 64-bit counter almost certainly means the device
            // rebooted/reset the counter, not a real wrap - treat as unknown.
            return 0n;
        }
        return BigInt(COUNTER32_MAX) - previous + currentValue;
    }
}

module.exports = {
    SNMPMonitorType,
};
