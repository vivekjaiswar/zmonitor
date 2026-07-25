const NotificationProvider = require("./notification-provider");
const axios = require("axios");
const { DOWN, UP } = require("../../src/util");
const { Settings } = require("../settings");

class ServerChan extends NotificationProvider {
    name = "ServerChan";

    /**
     * @inheritdoc
     */
    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        const okMsg = "Sent Successfully.";

        // serverchan3 requires sending via ft07.com
        const matchResult = String(notification.serverChanSendKey).match(/^sctp(\d+)t/i);
        const url =
            matchResult && matchResult[1]
                ? `https://${matchResult[1]}.push.ft07.com/send/${notification.serverChanSendKey}.send`
                : `https://sctapi.ftqq.com/${notification.serverChanSendKey}.send`;

        try {
            let config = this.getAxiosConfigWithProxy({});
            await axios.post(
                url,
                {
                    title: await this.checkStatus(heartbeatJSON, monitorJSON),
                    desp: msg,
                },
                config
            );

            return okMsg;
        } catch (error) {
            this.throwGeneralAxiosError(error);
        }
    }

    /**
     * Get the formatted title for message
     * @param {?object} heartbeatJSON Heartbeat details (For Up/Down only)
     * @param {?object} monitorJSON Monitor details (For Up/Down only)
     * @returns {Promise<string>} Formatted title
     */
    async checkStatus(heartbeatJSON, monitorJSON) {
        const appName = await Settings.getAppName();
        let title = `${appName} Message`;
        if (heartbeatJSON != null && heartbeatJSON["status"] === UP) {
            title = `${appName} Monitor Up ` + monitorJSON["name"];
        }
        if (heartbeatJSON != null && heartbeatJSON["status"] === DOWN) {
            title = `${appName} Monitor Down ` + monitorJSON["name"];
        }
        return title;
    }
}

module.exports = ServerChan;
