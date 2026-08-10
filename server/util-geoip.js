const net = require("net");
const axios = require("axios");
const { log } = require("../src/util");

// ponytail: free ip-api.com tier (no key, ~45 req/min, non-commercial ToS).
// Fine for a single ISP's own monitor list; swap for a paid geolocation
// provider or a self-hosted MaxMind GeoLite2 DB if usage grows past that.
const GEOIP_API_URL = "http://ip-api.com/json/";
const GEOIP_TIMEOUT_MS = 5000;

/**
 * Whether an IP address is private/reserved and therefore has no
 * meaningful public geolocation (RFC 1918, loopback, link-local, etc).
 * @param {string} ip IPv4 or IPv6 address
 * @returns {boolean} True if private/reserved
 */
function isPrivateOrReservedIp(ip) {
    if (net.isIPv4(ip)) {
        return (
            /^10\./.test(ip) ||
            /^127\./.test(ip) ||
            /^169\.254\./.test(ip) ||
            /^192\.168\./.test(ip) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
            ip === "0.0.0.0"
        );
    }
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
    }
    return false;
}

/**
 * Look up the approximate geographic coordinates for a monitor's
 * hostname/IP via a free public geolocation API. Never throws - a
 * lookup failure (private IP, unresolvable host, network error, rate
 * limit) just means no coordinates, which is a normal, expected state
 * for a monitor (it's an optional field).
 * @param {string} hostname Hostname or IP address to locate
 * @returns {Promise<{lat: number, lng: number} | null>} Coordinates, or null if unavailable
 */
async function lookupIpLocation(hostname) {
    if (!hostname) {
        return null;
    }

    if (net.isIP(hostname) && isPrivateOrReservedIp(hostname)) {
        return null;
    }

    try {
        const res = await axios.get(GEOIP_API_URL + encodeURIComponent(hostname), {
            params: { fields: "status,lat,lon" },
            timeout: GEOIP_TIMEOUT_MS,
        });

        if (res.data?.status === "success" && typeof res.data.lat === "number" && typeof res.data.lon === "number") {
            return { lat: res.data.lat, lng: res.data.lon };
        }
        return null;
    } catch (e) {
        log.debug("geoip", `Lookup failed for ${hostname}: ${e.message}`);
        return null;
    }
}

module.exports = {
    lookupIpLocation,
    isPrivateOrReservedIp,
};
