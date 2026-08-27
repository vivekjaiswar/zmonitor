const snmp = require("net-snmp");

const SYS_DESCR_OID = "1.3.6.1.2.1.1.1.0";
const SYS_NAME_OID = "1.3.6.1.2.1.1.5.0";
// LLDP-MIB (RFC 2922 / IEEE 802.1AB) - standard, not vendor-specific. Only
// walked for devices that already responded to the sysName/sysDescr probe,
// as a best-effort enrichment (many devices simply don't run LLDP).
const LLDP_REM_SYS_NAME = "1.0.8802.1.1.2.1.4.1.1.9";

/**
 * Probe a single IP for SNMP reachability and basic identity.
 * @param {string} ip Target IP address
 * @param {object} options SNMP connection options
 * @param {string} options.community Community string (v1/v2c)
 * @param {string} options.version "1" | "2c" | "3"
 * @param {number} options.port UDP port, usually 161
 * @param {number} options.timeoutMs Per-request timeout in milliseconds
 * @returns {Promise<?{ip: string, sysName: string, sysDescr: string, lldpNeighbors: string[]}>} Device info, or null if unreachable/not SNMP-capable
 */
async function probeDevice(ip, options) {
    const session = snmp.createSession(ip, options.community, {
        port: options.port || 161,
        version: snmp.Version[options.version || "2c"],
        timeout: options.timeoutMs,
        retries: 0,
    });
    session.on("error", () => {});

    try {
        const varbinds = await new Promise((resolve, reject) => {
            session.get([SYS_DESCR_OID, SYS_NAME_OID], (error, varbinds) => {
                error ? reject(error) : resolve(varbinds);
            });
        });

        if (varbinds.some((vb) => snmp.isVarbindError(vb))) {
            return null;
        }

        const sysDescr = varbinds[0].value?.toString() || "";
        const sysName = varbinds[1].value?.toString() || "";
        const lldpNeighbors = await walkLldpNeighbors(session);

        return { ip, sysName, sysDescr, lldpNeighbors };
    } catch (_e) {
        return null;
    } finally {
        session.close();
    }
}

/**
 * Best-effort walk of LLDP remote-system names visible from this device.
 * Never throws - devices without LLDP simply return an empty list.
 * @param {import("net-snmp").Session} session Open SNMP session (already probed as reachable)
 * @returns {Promise<string[]>} Names of LLDP neighbors, if any
 */
function walkLldpNeighbors(session) {
    return new Promise((resolve) => {
        const names = [];
        session.subtree(
            LLDP_REM_SYS_NAME,
            20,
            (varbinds) => {
                for (const vb of varbinds) {
                    if (!snmp.isVarbindError(vb) && vb.value) {
                        names.push(vb.value.toString());
                    }
                }
            },
            (error) => resolve(error ? [] : names)
        );
    });
}

/**
 * Probe a list of IPs for SNMP reachability, with bounded concurrency.
 * @param {string[]} ips IP addresses to probe
 * @param {object} options SNMP connection options, see probeDevice
 * @param {number} concurrency Maximum number of in-flight probes at once
 * @param {(done: number, total: number) => void} onProgress Called after each probe completes
 * @returns {Promise<Array<{ip: string, sysName: string, sysDescr: string, lldpNeighbors: string[]}>>} Devices that responded
 */
async function scanSubnet(ips, options, concurrency, onProgress) {
    const found = [];
    let nextIndex = 0;
    let done = 0;

    /**
     * Pull the next unprobed IP from the shared queue until it's empty
     * @returns {Promise<void>}
     */
    async function worker() {
        while (nextIndex < ips.length) {
            const ip = ips[nextIndex++];
            const result = await probeDevice(ip, options);
            if (result) {
                found.push(result);
            }
            done++;
            onProgress?.(done, ips.length);
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, ips.length) }, () => worker());
    await Promise.all(workers);

    return found;
}

module.exports = {
    probeDevice,
    scanSubnet,
};
