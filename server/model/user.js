const { BeanModel } = require("redbean-node/dist/bean-model");
const passwordHash = require("../password-hash");
const { R } = require("redbean-node");
const jwt = require("jsonwebtoken");
const { shake256, SHAKE256_LENGTH } = require("../util-server");

class User extends BeanModel {
    /**
     * Reset user password
     * Fix #1510, as in the context reset-password.js, there is no auto model mapping. Call this static function instead.
     * @param {number} userID ID of user to update
     * @param {string} newPassword Users new password
     * @returns {Promise<void>}
     */
    static async resetPassword(userID, newPassword) {
        await R.exec("UPDATE `user` SET password = ? WHERE id = ? ", [
            await passwordHash.generate(newPassword),
            userID,
        ]);
    }

    /**
     * Reset this users password
     * @param {string} newPassword Users new password
     * @returns {Promise<void>}
     */
    async resetPassword(newPassword) {
        const hashedPassword = await passwordHash.generate(newPassword);

        await R.exec("UPDATE `user` SET password = ? WHERE id = ? ", [hashedPassword, this.id]);

        this.password = hashedPassword;
    }

    /**
     * Create a new JWT for a user
     * @param {User} user The User to create a JsonWebToken for
     * @param {string} jwtSecret The key used to sign the JsonWebToken
     * @returns {string} the JsonWebToken as a string
     */
    static createJWT(user, jwtSecret) {
        return jwt.sign(
            {
                username: user.username,
                role: user.role || "admin",
                h: shake256(user.password, SHAKE256_LENGTH),
            },
            jwtSecret
        );
    }

    /**
     * Get the role of a user, defaulting to "admin" for any pre-RBAC row
     * @param {number} userID ID of the user
     * @returns {Promise<string>} "admin" or "employee"
     */
    static async getRole(userID) {
        const role = await R.getCell("SELECT role FROM `user` WHERE id = ?", [userID]);
        return role || "admin";
    }
}

module.exports = User;
