const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { expandCidr } = require("../../server/util-cidr");

describe("expandCidr()", () => {
    test("expands a /24 into 256 addresses starting at the network address", () => {
        const ips = expandCidr("192.168.1.0/24", 1000);
        assert.strictEqual(ips.length, 256);
        assert.strictEqual(ips[0], "192.168.1.0");
        assert.strictEqual(ips[255], "192.168.1.255");
    });

    test("normalizes a non-network-aligned base address to its containing subnet", () => {
        const ips = expandCidr("192.168.1.130/24", 1000);
        assert.strictEqual(ips[0], "192.168.1.0");
        assert.strictEqual(ips.length, 256);
    });

    test("expands a /30 into exactly 4 addresses", () => {
        const ips = expandCidr("10.0.0.0/30", 10);
        assert.deepStrictEqual(ips, ["10.0.0.0", "10.0.0.1", "10.0.0.2", "10.0.0.3"]);
    });

    test("expands a /32 into a single address", () => {
        assert.deepStrictEqual(expandCidr("10.0.0.5/32", 10), ["10.0.0.5"]);
    });

    test("refuses a range larger than the host cap", () => {
        assert.throws(() => expandCidr("10.0.0.0/16", 100), /more than the 100 limit/);
    });

    test("rejects a non-IPv4 base address", () => {
        assert.throws(() => expandCidr("::1/64", 100), /IPv4/);
    });

    test("rejects a malformed CIDR string", () => {
        assert.throws(() => expandCidr("not-a-cidr", 100), /Invalid CIDR/);
        assert.throws(() => expandCidr("10.0.0.0/33", 100), /prefix must be 0-32/);
        assert.throws(() => expandCidr("10.0.0.0/-1", 100), /prefix must be 0-32/);
    });
});
