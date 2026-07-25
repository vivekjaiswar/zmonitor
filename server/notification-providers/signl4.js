const NotificationProvider = require("./notification-provider");
const axios = require("axios");
const { UP, DOWN } = require("../../src/util");
const { Settings } = require("../settings");

class SIGNL4 extends NotificationProvider {
    name = "SIGNL4";

    /**
     * @inheritdoc
     */
    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        const okMsg = "Sent Successfully.";

        try {
            const appName = await Settings.getAppName();
            const appNameSlug = appName.toLowerCase().replace(/\s+/g, "-");
            let data = {
                heartbeat: heartbeatJSON,
                monitor: monitorJSON,
                msg,
                // Source system
                "X-S4-SourceSystem": appName,
                monitorUrl: this.extractAddress(monitorJSON),
            };

            let config = {
                headers: {
                    "Content-Type": "application/json",
                },
            };
            config = this.getAxiosConfigWithProxy(config);

            if (heartbeatJSON == null) {
                // Test alert
                data.title = `${appName} Alert`;
                data.message = msg;
            } else if (heartbeatJSON.status === UP) {
                data.title = `${appName} Monitor ✅ Up`;
                data["X-S4-ExternalID"] = `${appNameSlug}-` + monitorJSON.monitorID;
                data["X-S4-Status"] = "resolved";
            } else if (heartbeatJSON.status === DOWN) {
                data.title = `${appName} Monitor 🔴 Down`;
                data["X-S4-ExternalID"] = `${appNameSlug}-` + monitorJSON.monitorID;
                data["X-S4-Status"] = "new";
            }

            await axios.post(notification.webhookURL, data, config);
            return okMsg;
        } catch (error) {
            this.throwGeneralAxiosError(error);
        }
    }
}

module.exports = SIGNL4;
