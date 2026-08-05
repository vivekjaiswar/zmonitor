const jwt = require("jsonwebtoken");
const dayjs = require("dayjs");
const { randomUUID } = require("crypto");
const { log } = require("../../src/util");
const { Settings } = require("../settings");

// Shipped in the release, rotate by generating a new pair and shipping the
// new public key with a transition window (CM-Eng-5) - never fetched at
// runtime, so an already-deployed self-hosted instance never has to trust a
// key it just downloaded.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkpD10VxrYAfPR3R7EzvD
5tgeHNWjvqGjv8To2ap3bBjudJXDLLss+bQ97pjp8PCpf04plQKYQSGma6/NtWJH
Eb+83Z0yh27bFlvvJ6fevtBfjHNsRFb5PH6sfzvoQr+XY+5fdqp5HGvqOkf41FbK
zIPm/3QiWPfX34Wl3SKhz3TmqpBXa2cxAIrrMzJf9b5QdNogKxU1acY//y8SuHQn
XJcj83nbF5Y5r6EDvLp9JI4Voidm1ELqVKnv3Mu2jSwH85gTlD1xV3XaQb2lV3iQ
lxVtV6oSB1BY9XoPkm4Kge3IVwIePcnESkng2Wr5ToAwOGTqGcykRQ5yS15a7pmw
XwIDAQAB
-----END PUBLIC KEY-----
`;

const GRACE_DAYS = 14;
const CHECK_IN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h - well inside the 24h token TTL, so a couple of missed attempts still land before expiry
const NEVER_CHECKED_IN_THRESHOLD_HOURS = 24; // below this, a fresh install just hasn't had its first chance yet - not a config problem

let checkInTimer = null;

/**
 * Pure function: license state from cached claims + now. Single enum, not
 * boolean flags (VALID/GRACE_PERIOD/SOFT_LOCKED) - avoids the impossible
 * SOFT_LOCKED -> GRACE_PERIOD-without-a-check-in transition boolean creep invites.
 *
 * The grace clock is "days since paidThroughDate", not "days since we last
 * reached the server" - paidThroughDate only advances on a SUCCESSFUL
 * check-in, so a customer blocking the license-server hostname at their
 * firewall can't reset or extend it (CM-Eng-2). Retries are a no-op for
 * this clock by construction, not by a separate rule to remember.
 * @param {?object} claims Decoded+verified token claims, or null if none cached yet
 * @param {Date} [now] Injectable for tests
 * @returns {"VALID"|"GRACE_PERIOD"|"SOFT_LOCKED"} Current license state
 */
function computeState(claims, now = new Date()) {
    if (!claims) {
        return "VALID"; // fresh install, no key configured yet (4A)
    }
    if (claims.killSwitchActive) {
        return "VALID"; // 1A: fleet-wide override for a license-server logic bug
    }
    if (!claims.paidThroughDate) {
        return "VALID"; // no plan assigned yet = trial
    }
    const daysSince = dayjs(now).diff(dayjs(claims.paidThroughDate), "day", true);
    if (daysSince <= 0) {
        return "VALID";
    }
    if (daysSince <= GRACE_DAYS) {
        return "GRACE_PERIOD";
    }
    return "SOFT_LOCKED";
}

async function getOrCreateInstallId() {
    let installId = await Settings.get("licenseInstallId");
    if (!installId) {
        installId = randomUUID();
        await Settings.set("licenseInstallId", installId, "general");
    }
    return installId;
}

/**
 * One check-in attempt. Verifies the response is actually signed by us
 * before trusting it - a network response isn't proof of authenticity on
 * its own. On any failure this is a no-op: the last cached claims (if any)
 * keep governing computeState(), which is what makes retries safe.
 * @returns {Promise<void>}
 */
async function checkIn() {
    const url = process.env.ZMONITOR_LICENSE_SERVER_URL;
    if (!url) {
        return; // not configured - stay on whatever cached/default state exists
    }

    if (!(await Settings.get("licenseFirstAttemptAt"))) {
        await Settings.set("licenseFirstAttemptAt", dayjs().toISOString(), "general");
    }

    try {
        const installId = await getOrCreateInstallId();
        const res = await fetch(`${url.replace(/\/$/, "")}/check-in`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ installId }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            throw new Error(`check-in failed: HTTP ${res.status}`);
        }
        const { token } = await res.json();

        // RS256 verify only - never accept an unsigned/self-signed claim,
        // that's the whole point of the client never holding the private key.
        const claims = jwt.verify(token, PUBLIC_KEY, { algorithms: [ "RS256" ] });
        await Settings.set("licenseClaims", claims, "general");
        await Settings.set("licenseLastCheckinOk", dayjs().toISOString(), "general");
    } catch (err) {
        // Fail open by design (CM-Eng-2/CM1): a network hiccup or a down
        // license server never advances paidThroughDate, so it can only
        // ever move the customer toward GRACE_PERIOD on its own schedule,
        // never lock them out faster than an actual expired plan would.
        log.warn("license", `Check-in failed, using cached state: ${err.message}`);
    }
}

/**
 * Current license state for the UI banner. Reads whatever was last cached
 * by checkIn() - never blocks on a network call.
 *
 * `staleNeverCheckedIn` is deliberately separate from `state`: a customer
 * whose firewall blocks the license-server hostname from day one has no
 * claims, so computeState() correctly reads VALID/trial (4A) - but that's
 * not the same as "healthy," it's "never actually reached us." Without this
 * flag that customer gets no banner at all until some future paid-plan
 * assignment makes the silence visible weeks later (CM-Eng-6).
 * @returns {Promise<{state: string, paidThroughDate: ?string, everCheckedIn: boolean, staleNeverCheckedIn: boolean}>} Current state for the banner
 */
async function getStatus() {
    const claims = await Settings.get("licenseClaims");
    const everCheckedIn = !!(await Settings.get("licenseLastCheckinOk"));
    const firstAttemptAt = await Settings.get("licenseFirstAttemptAt");
    const staleNeverCheckedIn =
        !everCheckedIn && !!firstAttemptAt && dayjs().diff(dayjs(firstAttemptAt), "hour") >= NEVER_CHECKED_IN_THRESHOLD_HOURS;

    return {
        state: computeState(claims),
        paidThroughDate: claims?.paidThroughDate || null,
        everCheckedIn,
        staleNeverCheckedIn,
    };
}

function startCheckInLoop() {
    checkIn(); // fire immediately on boot, then on the interval
    checkInTimer = setInterval(checkIn, CHECK_IN_INTERVAL_MS);
}

function stopCheckInLoop() {
    clearInterval(checkInTimer);
}

module.exports = { computeState, checkIn, getStatus, startCheckInLoop, stopCheckInLoop };
