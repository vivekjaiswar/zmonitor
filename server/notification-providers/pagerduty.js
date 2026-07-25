const NotificationProvider = require("./notification-provider");
const axios = require("axios");
const { UP, DOWN, getMonitorRelativeURL } = require("../../src/util");
const { Settings } = require("../settings");
let successMessage = "Sent Successfully.";

class PagerDuty extends NotificationProvider {
    name = "PagerDuty";

    /**
     * @inheritdoc
     */
    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        try {
            const appName = await Settings.getAppName();
            if (heartbeatJSON == null) {
                const title = `${appName} Alert`;
                const monitor = {
                    type: "ping",
                    url: `${appName} Test Button`,
                };
                return this.postNotification(notification, title, msg, monitor);
            }

            if (heartbeatJSON.status === UP) {
                const title = `${appName} Monitor ✅ Up`;
                return this.postNotification(notification, title, heartbeatJSON.msg, monitorJSON, "resolve");
            }

            if (heartbeatJSON.status === DOWN) {
                const title = `${appName} Monitor 🔴 Down`;
                return this.postNotification(notification, title, heartbeatJSON.msg, monitorJSON, "trigger");
            }
        } catch (error) {
            this.throwGeneralAxiosError(error);
        }
    }

    /**
     * Check if result is successful, result code should be in range 2xx
     * @param {object} result Axios response object
     * @returns {void}
     * @throws {Error} The status code is not in range 2xx
     */
    checkResult(result) {
        if (result.status == null) {
            throw new Error("PagerDuty notification failed with invalid response!");
        }
        if (result.status < 200 || result.status >= 300) {
            throw new Error("PagerDuty notification failed with status code " + result.status);
        }
    }

    /**
     * Send the message
     * @param {BeanModel} notification Message title
     * @param {string} title Message title
     * @param {string} body Message
     * @param {object} monitorInfo Monitor details (For Up/Down only)
     * @param {?string} eventAction Action event for PagerDuty (trigger, acknowledge, resolve)
     * @returns {Promise<string>} Success message
     */
    async postNotification(notification, title, body, monitorInfo, eventAction = "trigger") {
        const appName = await Settings.getAppName();
        let monitorUrl;
        if (monitorInfo.type === "port") {
            monitorUrl = monitorInfo.hostname;
            if (monitorInfo.port) {
                monitorUrl += ":" + monitorInfo.port;
            }
        } else if (monitorInfo.hostname != null) {
            monitorUrl = monitorInfo.hostname;
        } else {
            monitorUrl = monitorInfo.url;
        }

        if (eventAction === "resolve") {
            if (notification.pagerdutyAutoResolve === "0") {
                return "no action required";
            }
            eventAction = notification.pagerdutyAutoResolve;
        }

        const options = {
            method: "POST",
            url: notification.pagerdutyIntegrationUrl,
            headers: { "Content-Type": "application/json" },
            data: {
                payload: {
                    summary: monitorInfo.name ? `[${title}] [${monitorInfo.name}] ${body}` : `[${title}] ${body}`,
                    severity: notification.pagerdutyPriority || "warning",
                    source: monitorUrl,
                },
                routing_key: notification.pagerdutyIntegrationKey,
                event_action: eventAction,
                dedup_key: monitorInfo.id ? appName + "/" + monitorInfo.id : appName + "/test",
            },
        };

        const baseURL = await Settings.get("primaryBaseURL");
        if (baseURL && monitorInfo) {
            options.client = appName;
            options.client_url = baseURL + getMonitorRelativeURL(monitorInfo.id);
        }

        let result = await axios.request(options);
        this.checkResult(result);
        if (result.statusText != null) {
            return "PagerDuty notification succeed: " + result.statusText;
        }

        return successMessage;
    }
}

module.exports = PagerDuty;
