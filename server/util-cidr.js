const net = require("net");

/**
 * Expand an IPv4 CIDR block into every address in its range.
 * @param {string} cidr CIDR notation, e.g. "192.168.1.0/24"
 * @param {number} maxHosts Refuse to expand a range larger than this
 * @returns {string[]} Every IPv4 address in the range, including network/broadcast
 * @throws {Error} If the CIDR is malformed, not IPv4, or larger than maxHosts
 */
function expandCidr(cidr, maxHosts) {
    const parts = String(cidr).split("/");
    if (parts.length !== 2) {
        throw new Error(`Invalid CIDR: ${cidr}`);
    }
    const [base, prefixStr] = parts;
    if (!net.isIPv4(base)) {
        throw new Error(`Invalid CIDR: ${cidr} (only IPv4 is supported)`);
    }
    const prefix = Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
        throw new Error(`Invalid CIDR: ${cidr} (prefix must be 0-32)`);
    }

    const hostBits = 32 - prefix;
    const count = 2 ** hostBits;
    if (count > maxHosts) {
        throw new Error(`CIDR ${cidr} covers ${count} addresses, which is more than the ${maxHosts} limit`);
    }

    const baseInt = ipToInt(base);
    // hostBits can be up to 32, and `<<` only works on 32-bit ints in JS, so
    // compute the mask with real arithmetic instead of a bit-shift.
    const networkInt = baseInt - (baseInt % (2 ** hostBits));

    const addresses = [];
    for (let i = 0; i < count; i++) {
        addresses.push(intToIp(networkInt + i));
    }
    return addresses;
}

/**
 * Convert a dotted-quad IPv4 address to its 32-bit integer form
 * @param {string} ip IPv4 address, e.g. "192.168.1.1"
 * @returns {number} Integer representation
 */
function ipToInt(ip) {
    return ip.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

/**
 * Convert a 32-bit integer back to dotted-quad IPv4 notation
 * @param {number} int Integer representation of an IPv4 address
 * @returns {string} Dotted-quad IPv4 address
 */
function intToIp(int) {
    return [24, 16, 8, 0].map((shift) => Math.floor(int / 2 ** shift) % 256).join(".");
}

module.exports = {
    expandCidr,
};
