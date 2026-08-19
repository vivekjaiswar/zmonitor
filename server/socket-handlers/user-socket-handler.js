const { R } = require("redbean-node");
const { checkAdmin } = require("../util-server");
const { passwordStrength } = require("check-password-strength");
const passwordHash = require("../password-hash");
const TranslatableError = require("../translatable-error");
const { log } = require("../../src/util");

/**
 * Replace an employee's tag-access grants with the given list of tag IDs
 * @param {number} userID ID of the employee user
 * @param {Array<number>} tagIDs Tag IDs to grant access to
 * @returns {Promise<void>}
 */
async function setUserTagAccess(userID, tagIDs) {
    await R.exec("DELETE FROM user_tag_access WHERE user_id = ?", [userID]);

    for (const tagID of tagIDs) {
        let grant = R.dispense("user_tag_access");
        grant.user_id = userID;
        grant.tag_id = tagID;
        await R.store(grant);
    }
}

/**
 * Replace an employee's direct per-monitor access grants with the given list
 * of monitor IDs
 * @param {number} userID ID of the employee user
 * @param {Array<number>} monitorIDs Monitor IDs to grant access to
 * @returns {Promise<void>}
 */
async function setUserMonitorAccess(userID, monitorIDs) {
    await R.exec("DELETE FROM user_monitor_access WHERE user_id = ?", [userID]);

    for (const monitorID of monitorIDs) {
        let grant = R.dispense("user_monitor_access");
        grant.user_id = userID;
        grant.monitor_id = monitorID;
        await R.store(grant);
    }
}

/**
 * Handlers for admin management of employee user accounts and their
 * Location-scoped and/or directly-granted monitor visibility.
 * @param {Socket} socket Socket.io instance
 * @returns {void}
 */
module.exports.userSocketHandler = (socket) => {
    socket.on("getUserList", async (callback) => {
        try {
            checkAdmin(socket);

            const users = await R.getAll(
                "SELECT id, username, active, role, full_monitor_access FROM `user` ORDER BY username"
            );
            const tagGrants = await R.getAll("SELECT user_id, tag_id FROM user_tag_access");
            const monitorGrants = await R.getAll("SELECT user_id, monitor_id FROM user_monitor_access");

            const result = users.map((user) => ({
                id: user.id,
                username: user.username,
                active: !!user.active,
                role: user.role || "admin",
                fullMonitorAccess: !!user.full_monitor_access,
                tagIDs: tagGrants.filter((grant) => grant.user_id === user.id).map((grant) => grant.tag_id),
                monitorIDs: monitorGrants
                    .filter((grant) => grant.user_id === user.id)
                    .map((grant) => grant.monitor_id),
            }));

            callback({
                ok: true,
                users: result,
            });
        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });

    socket.on("addUser", async (data, callback) => {
        try {
            checkAdmin(socket);

            const username = (data.username || "").trim();
            if (!username) {
                throw new Error("Username is required.");
            }

            if (passwordStrength(data.password).value === "Too weak") {
                throw new TranslatableError("passwordTooWeak");
            }

            const existing = await R.findOne("user", " username = ? ", [username]);
            if (existing) {
                throw new Error("That username is already taken.");
            }

            let bean = R.dispense("user");
            bean.username = username;
            bean.password = await passwordHash.generate(data.password);
            bean.role = "employee";
            bean.active = true;
            bean.full_monitor_access = !!data.fullMonitorAccess;
            await R.store(bean);

            if (!data.fullMonitorAccess) {
                if (Array.isArray(data.tagIDs) && data.tagIDs.length > 0) {
                    await setUserTagAccess(bean.id, data.tagIDs);
                }

                if (Array.isArray(data.monitorIDs) && data.monitorIDs.length > 0) {
                    await setUserMonitorAccess(bean.id, data.monitorIDs);
                }
            }

            log.info("auth", `Admin ${socket.userID} created employee account ${username} (id ${bean.id})`);

            callback({
                ok: true,
                msg: "successAdded",
                msgi18n: true,
                userID: bean.id,
            });
        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
                msgi18n: !!e.msgi18n,
            });
        }
    });

    socket.on("editUser", async (data, callback) => {
        try {
            checkAdmin(socket);

            let bean = await R.findOne("user", " id = ? ", [data.id]);
            if (!bean) {
                throw new Error("User not found.");
            }

            if (bean.role === "admin") {
                throw new Error("Admin accounts cannot be edited here.");
            }

            if (typeof data.active === "boolean") {
                bean.active = data.active;
            }

            if (typeof data.fullMonitorAccess === "boolean") {
                bean.full_monitor_access = data.fullMonitorAccess;
            }

            if (data.password) {
                if (passwordStrength(data.password).value === "Too weak") {
                    throw new TranslatableError("passwordTooWeak");
                }
                bean.password = await passwordHash.generate(data.password);
            }

            await R.store(bean);

            if (!bean.full_monitor_access) {
                if (Array.isArray(data.tagIDs)) {
                    await setUserTagAccess(bean.id, data.tagIDs);
                }

                if (Array.isArray(data.monitorIDs)) {
                    await setUserMonitorAccess(bean.id, data.monitorIDs);
                }
            }

            callback({
                ok: true,
                msg: "successEdited",
                msgi18n: true,
            });
        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
                msgi18n: !!e.msgi18n,
            });
        }
    });

    socket.on("deleteUser", async (userID, callback) => {
        try {
            checkAdmin(socket);

            if (userID === socket.userID) {
                throw new Error("You cannot delete your own account.");
            }

            const target = await R.findOne("user", " id = ? ", [userID]);
            if (!target) {
                throw new Error("User not found.");
            }
            if (target.role === "admin") {
                throw new Error("Admin accounts cannot be deleted here.");
            }

            await R.exec("DELETE FROM user WHERE id = ?", [userID]);

            log.info("auth", `Admin ${socket.userID} deleted employee account id ${userID}`);

            callback({
                ok: true,
                msg: "successDeleted",
                msgi18n: true,
            });
        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });
};
