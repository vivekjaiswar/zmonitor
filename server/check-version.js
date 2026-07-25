const { setSetting } = require("./util-server");

exports.version = require("../package.json").version;
// No update-check service of our own exists yet, so the "new version
// available" banner stays off rather than comparing against an unrelated
// project's release stream.
exports.latestVersion = null;

let interval;

exports.startInterval = () => {
    // No-op until ZMonitor has its own version-check endpoint.
};

/**
 * Enable the check update feature
 * @param {boolean} value Should the check update feature be enabled?
 * @returns {Promise<void>}
 */
exports.enableCheckUpdate = async (value) => {
    await setSetting("checkUpdate", value);

    clearInterval(interval);

    if (value) {
        exports.startInterval();
    }
};

exports.socket = null;
