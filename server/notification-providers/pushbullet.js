const NotificationProvider = require("./notification-provider");
const axios = require("axios");

const { DOWN, UP } = require("../../src/util");
const { Settings } = require("../settings");

class Pushbullet extends NotificationProvider {
    name = "pushbullet";

    /**
     * @inheritdoc
     */
    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        const okMsg = "Sent Successfully.";
        const url = "https://api.pushbullet.com/v2/pushes";

        try {
            let config = {
                headers: {
                    "Access-Token": notification.pushbulletAccessToken,
                    "Content-Type": "application/json",
                },
            };
            config = this.getAxiosConfigWithProxy(config);
            const appName = await Settings.getAppName();
            if (heartbeatJSON == null) {
                let data = {
                    type: "note",
                    title: `${appName} Alert`,
                    body: msg,
                };
                await axios.post(url, data, config);
            } else if (heartbeatJSON["status"] === DOWN) {
                let downData = {
                    type: "note",
                    title: `${appName} Alert: ` + monitorJSON["name"],
                    body:
                        "[🔴 Down] " +
                        heartbeatJSON["msg"] +
                        `\nTime (${heartbeatJSON["timezone"]}): ${heartbeatJSON["localDateTime"]}`,
                };
                await axios.post(url, downData, config);
            } else if (heartbeatJSON["status"] === UP) {
                let upData = {
                    type: "note",
                    title: `${appName} Alert: ` + monitorJSON["name"],
                    body:
                        "[✅ Up] " +
                        heartbeatJSON["msg"] +
                        `\nTime (${heartbeatJSON["timezone"]}): ${heartbeatJSON["localDateTime"]}`,
                };
                await axios.post(url, upData, config);
            }
            return okMsg;
        } catch (error) {
            this.throwGeneralAxiosError(error);
        }
    }
}

module.exports = Pushbullet;
