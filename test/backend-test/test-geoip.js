const { describe, test } = require("node:test");
const assert = require("node:assert");
const { isPrivateOrReservedIp } = require("../../server/util-geoip");

// Pure logic behind auto-locate: a private/reserved IP must never trigger
// an external lookup (wasted request, and it would just fail anyway).
describe("GeoIP - isPrivateOrReservedIp()", () => {
    test("flags RFC1918 and other private/reserved IPv4 ranges", () => {
        assert.strictEqual(isPrivateOrReservedIp("10.0.0.1"), true);
        assert.strictEqual(isPrivateOrReservedIp("172.16.0.1"), true);
        assert.strictEqual(isPrivateOrReservedIp("172.31.255.255"), true);
        assert.strictEqual(isPrivateOrReservedIp("192.168.1.1"), true);
        assert.strictEqual(isPrivateOrReservedIp("127.0.0.1"), true);
        assert.strictEqual(isPrivateOrReservedIp("169.254.1.1"), true);
        assert.strictEqual(isPrivateOrReservedIp("0.0.0.0"), true);
    });

    test("does not flag public IPv4 addresses, including the 172.x boundary", () => {
        assert.strictEqual(isPrivateOrReservedIp("8.8.8.8"), false);
        assert.strictEqual(isPrivateOrReservedIp("1.1.1.1"), false);
        assert.strictEqual(isPrivateOrReservedIp("172.15.255.255"), false);
        assert.strictEqual(isPrivateOrReservedIp("172.32.0.0"), false);
    });

    test("flags private/reserved IPv6 addresses", () => {
        assert.strictEqual(isPrivateOrReservedIp("::1"), true);
        assert.strictEqual(isPrivateOrReservedIp("fe80::1"), true);
        assert.strictEqual(isPrivateOrReservedIp("fc00::1"), true);
        assert.strictEqual(isPrivateOrReservedIp("fd12::1"), true);
    });

    test("does not flag hostnames (not IPs) or public IPv6", () => {
        assert.strictEqual(isPrivateOrReservedIp("example.com"), false);
        assert.strictEqual(isPrivateOrReservedIp("2606:4700:4700::1111"), false);
    });
});
