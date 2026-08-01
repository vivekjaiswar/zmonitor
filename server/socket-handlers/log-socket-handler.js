const { checkAdmin } = require("../util-server");
const { getLogDir } = require("../../src/util");

const DEFAULT_TAIL_LINES = 500;

/**
 * List rotated log file names (app.log, app.log.1, ...) that currently exist
 * on disk, oldest last (i.e. app.log is the most recent).
 * @param {string} dir Log directory
 * @returns {Array<string>} File names that exist, most recent first
 */
function listExistingLogFiles(dir) {
    const fs = require("fs");
    const path = require("path");

    const names = ["app.log", "app.log.1", "app.log.2", "app.log.3", "app.log.4", "app.log.5"];
    return names.filter((name) => fs.existsSync(path.join(dir, name)));
}

/**
 * Handlers for admin viewing/downloading of the persisted application log.
 * @param {Socket} socket Socket.io instance
 * @returns {void}
 */
module.exports.logSocketHandler = (socket) => {
    // Returns the most recent lines from the current log file, for on-screen viewing.
    socket.on("getLogs", async (callback) => {
        try {
            checkAdmin(socket);

            const fs = require("fs");
            const path = require("path");
            const dir = getLogDir();
            const filePath = path.join(dir, "app.log");

            let lines = [];
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, "utf8");
                lines = content.split("\n").filter((line) => line.length > 0);
                lines = lines.slice(-DEFAULT_TAIL_LINES);
            }

            callback({
                ok: true,
                lines,
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });

    // Returns the full raw content of every log file on disk (current + rotated),
    // oldest first, for the frontend to package into a single downloadable file.
    socket.on("downloadLogs", async (callback) => {
        try {
            checkAdmin(socket);

            const fs = require("fs");
            const path = require("path");
            const dir = getLogDir();

            const existing = listExistingLogFiles(dir).reverse();
            const content = existing
                .map((name) => fs.readFileSync(path.join(dir, name), "utf8"))
                .join("");

            callback({
                ok: true,
                content,
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });
};
