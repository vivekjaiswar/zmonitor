const NotificationProvider = require("./notification-provider");
const axios = require("axios");
const { Settings } = require("../settings");

const defaultNotificationService = "notify";

class HomeAssistant extends NotificationProvider {
    name = "HomeAssistant";

    /**
     * @inheritdoc
     */
    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        const okMsg = "Sent Successfully.";

        const notificationService = notification?.notificationService || defaultNotificationService;

        try {
            let config = {
                headers: {
                    Authorization: `Bearer ${notification.longLivedAccessToken}`,
                    "Content-Type": "application/json",
                },
            };
            config = this.getAxiosConfigWithProxy(config);
            const appName = await Settings.getAppName();
            await axios.post(
                `${notification.homeAssistantUrl.trim().replace(/\/*$/, "")}/api/services/notify/${notificationService}`,
                {
                    title: appName,
                    message: msg,
                    ...(notificationService !== "persistent_notification" && {
                        data: {
                            name: monitorJSON?.name,
                            status: heartbeatJSON?.status,
                            channel: appName,
                            icon_url: "https://raw.githubusercontent.com/vivekjaiswar/zmonitor/main/public/icon.png",
                        },
                    }),
                },
                config
            );

            return okMsg;
        } catch (error) {
            this.throwGeneralAxiosError(error);
        }
    }
}

module.exports = HomeAssistant;
