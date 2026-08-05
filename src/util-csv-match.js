/**
 * Find the single existing monitor matching a CSV row, by exact hostname/URL
 * first, falling back to exact name. Returns null (caller skips the row) on
 * zero or multiple matches - an ambiguous match is never guessed at.
 * @param {Array<object>} monitors Existing monitors to match against
 * @param {string} hostnameValue Hostname/URL value from the CSV row
 * @param {string} nameValue Name value from the CSV row
 * @returns {?object} The matched monitor, or null if none/ambiguous
 */
export function findMonitorMatch(monitors, hostnameValue, nameValue) {
    if (hostnameValue) {
        const byHost = monitors.filter((m) => m.hostname === hostnameValue || m.url === hostnameValue);
        if (byHost.length === 1) {
            return byHost[0];
        }
        if (byHost.length > 1) {
            return null; // ambiguous - do not guess
        }
    }

    if (nameValue) {
        const byName = monitors.filter((m) => m.name === nameValue);
        if (byName.length === 1) {
            return byName[0];
        }
    }

    return null;
}
