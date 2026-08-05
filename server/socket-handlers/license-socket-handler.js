const { checkAdmin } = require("../util-server");
const license = require("../license/client");

/**
 * Handlers for admin viewing of license status (map/optical-power features
 * later, banner today). Mirrors log-socket-handler.js's shape - request/
 * response over an existing admin-checked socket, no new transport.
 * @param {Socket} socket Socket.io instance
 * @returns {void}
 */
module.exports.licenseSocketHandler = (socket) => {
    socket.on("getLicenseStatus", async (callback) => {
        try {
            checkAdmin(socket);
            callback({
                ok: true,
                ...(await license.getStatus()),
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });
};
