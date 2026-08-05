/*
 * ZMonitor Server
 * node "server/server.js"
 * DO NOT require("./server") in other modules, it likely creates circular dependency!
 */
console.log("Welcome to ZMonitor");

// As the log function need to use dayjs, it should be very top
const dayjs = require("dayjs");
dayjs.extend(require("dayjs/plugin/utc"));
dayjs.extend(require("./modules/dayjs/plugin/timezone"));
dayjs.extend(require("dayjs/plugin/customParseFormat"));

// Load environment variables from `.env`
require("dotenv").config();

// Check Node.js Version
const nodeVersion = process.versions.node;

// Get the required Node.js version from package.json
const requiredNodeVersions = require("../package.json").engines.node;
const bannedNodeVersions = " < 18 || 20.0.* || 20.1.* || 20.2.* || 20.3.* ";
console.log(`Your Node.js version: ${nodeVersion}`);

const semver = require("semver");
const requiredNodeVersionsComma = requiredNodeVersions
    .split("||")
    .map((version) => version.trim())
    .join(", ");

// Exit ZMonitor immediately if the Node.js version is banned
if (semver.satisfies(nodeVersion, bannedNodeVersions)) {
    console.error(
        "\x1b[31m%s\x1b[0m",
        `Error: Your Node.js version: ${nodeVersion} is not supported, please upgrade your Node.js to ${requiredNodeVersionsComma}.`
    );
    process.exit(-1);
}

// Warning if the Node.js version is not in the support list, but it maybe still works
if (!semver.satisfies(nodeVersion, requiredNodeVersions)) {
    console.warn(
        "\x1b[31m%s\x1b[0m",
        `Warning: Your Node.js version: ${nodeVersion} is not officially supported, please upgrade your Node.js to ${requiredNodeVersionsComma}.`
    );
}

const args = require("args-parser")(process.argv);
const { sleep, log, getRandomInt, genSecret, isDev } = require("../src/util");
const config = require("./config");

process.title = "uptime-kuma";

log.debug("server", "Arguments");
log.debug("server", args);

if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "production";
}

if (!process.env.ZMONITOR_WS_ORIGIN_CHECK) {
    process.env.ZMONITOR_WS_ORIGIN_CHECK = "cors-like";
}

log.info("server", "Env: " + process.env.NODE_ENV);
log.debug("server", "Inside Container: " + (process.env.ZMONITOR_IS_CONTAINER === "1"));

if (process.env.ZMONITOR_WS_ORIGIN_CHECK === "bypass") {
    log.warn("server", "WebSocket Origin Check: " + process.env.ZMONITOR_WS_ORIGIN_CHECK);
}

const checkVersion = require("./check-version");
log.info("server", "ZMonitor Version:", checkVersion.version);

const license = require("./license/client");

log.info("server", "Loading modules");

log.debug("server", "Importing express");
const express = require("express");
const expressStaticGzip = require("express-static-gzip");
log.debug("server", "Importing redbean-node");
const { R } = require("redbean-node");
log.debug("server", "Importing jsonwebtoken");
const jwt = require("jsonwebtoken");
log.debug("server", "Importing http-graceful-shutdown");
const gracefulShutdown = require("http-graceful-shutdown");
log.debug("server", "Importing prometheus-api-metrics");
const prometheusAPIMetrics = require("prometheus-api-metrics");
const { passwordStrength } = require("check-password-strength");
const TranslatableError = require("./translatable-error");

log.debug("server", "Importing 2FA Modules");
const notp = require("notp");
const base32 = require("thirty-two");

const { ZMonitorServer } = require("./zmonitor-server");
const server = ZMonitorServer.getInstance();
const io = (module.exports.io = server.io);
const app = server.app;

log.debug("server", "Importing Monitor");
const Monitor = require("./model/monitor");
const User = require("./model/user");

log.debug("server", "Importing Settings");
const {
    getSettings,
    setSettings,
    setting,
    initJWTSecret,
    checkLogin,
    checkAdmin,
    doubleCheckPassword,
    shake256,
    SHAKE256_LENGTH,
    allowDevAllOrigin,
    printServerUrls,
} = require("./util-server");

log.debug("server", "Importing Notification");
const { Notification } = require("./notification");
Notification.init();
const { camelCaseToUnderscore } = require("redbean-node/dist/lib/helper/string-helper");

// Real columns on the "monitor" table. Backup imports (ours or a real Uptime
// Kuma export) carry monitor.toJSON()-shaped objects, which include several
// computed/derived fields (e.g. forceInactive, screenshot, status,
// maintenance) that don't exist as columns - passing those into bean.import()
// throws "table monitor has no column named ...". Filtering against this
// allowlist (rather than growing a denylist every time a new export format
// surfaces one more computed field) keeps the import handler robust across
// different Uptime Kuma versions/forks.
const MONITOR_TABLE_COLUMNS = new Set([
    "name", "active", "interval", "url", "type", "weight", "hostname", "port", "keyword", "maxretries",
    "ignore_tls", "upside_down", "maxredirects", "accepted_statuscodes_json", "dns_resolve_type",
    "dns_resolve_server", "dns_last_result", "retry_interval", "push_token", "method", "body", "headers",
    "basic_auth_user", "basic_auth_pass", "docker_host", "docker_container", "proxy_id", "expiry_notification",
    "mqtt_topic", "mqtt_success_message", "mqtt_username", "mqtt_password", "database_connection_string",
    "database_query", "auth_method", "auth_domain", "auth_workstation", "grpc_url", "grpc_protobuf", "grpc_body",
    "grpc_metadata", "grpc_method", "grpc_service_name", "grpc_enable_tls", "radius_username", "radius_password",
    "radius_calling_station_id", "radius_called_station_id", "radius_secret", "resend_interval", "packet_size",
    "game", "http_body_encoding", "description", "tls_ca", "tls_cert", "tls_key", "parent", "invert_keyword",
    "json_path", "expected_value", "kafka_producer_topic", "kafka_producer_brokers", "kafka_producer_sasl_options",
    "kafka_producer_message", "oauth_client_id", "oauth_client_secret", "oauth_token_url", "oauth_scopes",
    "oauth_auth_method", "timeout", "gamedig_given_port_only", "kafka_producer_ssl",
    "kafka_producer_allow_auto_topic_creation", "mqtt_check_type", "remote_browser", "snmp_oid", "snmp_version",
    "json_path_operator", "cache_bust", "conditions", "rabbitmq_nodes", "rabbitmq_username", "rabbitmq_password",
    "smtp_security", "ws_ignore_sec_websocket_accept_header", "ws_subprotocol", "ping_count", "ping_numeric",
    "ping_per_request_timeout", "ip_family", "oauth_audience", "mqtt_websocket_path", "domain_expiry_notification",
    "save_response", "save_error_response", "response_max_length", "system_service_name", "subtype", "location",
    "protocol", "snmp_v3_username", "expected_tls_alert", "screenshot_delay", "bearer_token", "gamedig_token",
    "ntp_stratum_threshold", "ntp_time_offset_threshold", "ntp_root_dispersion_threshold", "lat", "lng",
]);

// Socket events an "employee" role account is allowed to call. Everything else is
// rejected by default (fail closed) - a new socket handler added later stays
// blocked for employee accounts until explicitly added here, rather than being
// implicitly exposed. Employees are read-only viewers scoped to monitors covered
// by a tag/monitor grant (see Monitor.getAccessibleMonitorIdsSQL); this list only
// covers auth/session actions and read-only monitor data.
const EMPLOYEE_ALLOWED_EVENTS = new Set([
    "loginByToken", "login", "logout", "verifyToken", "twoFAStatus", "needSetup",
    "prepare2FA", "save2FA", "disable2FA", "changePassword",
    "getMonitorList", "getMonitor", "getMonitorBeats", "getMonitorChartData",
    "monitorImportantHeartbeatListCount", "monitorImportantHeartbeatListPaged",
    "getTags", "getWebpushVapidPublicKey", "initServerTimezone", "disconnectOtherSocketClients",
]);

log.debug("server", "Importing Web-Push");
const webpush = require("web-push");

log.debug("server", "Importing Database");
const Database = require("./database");
const ImageDataURI = require("./image-data-uri");

log.debug("server", "Importing Background Jobs");
const { initBackgroundJobs, stopBackgroundJobs } = require("./jobs");
const { loginRateLimiter, twoFaRateLimiter } = require("./rate-limiter");

const { apiAuth } = require("./auth");
const { login } = require("./auth");
const passwordHash = require("./password-hash");

const { Prometheus } = require("./prometheus");
const { UptimeCalculator } = require("./uptime-calculator");

const hostname = config.hostname;

if (hostname) {
    log.info("server", "Custom hostname: " + hostname);
}

const port = config.port;

const disableFrameSameOrigin =
    !!process.env.ZMONITOR_DISABLE_FRAME_SAMEORIGIN || args["disable-frame-sameorigin"] || false;
const cloudflaredToken = args["cloudflared-token"] || process.env.ZMONITOR_CLOUDFLARED_TOKEN || undefined;

// 2FA / notp verification defaults
const twoFAVerifyOptions = {
    window: 1,
    time: 30,
};

/**
 * Run unit test after the server is ready
 * @type {boolean}
 */
const testMode = !!args["test"] || false;

// Must be after io instantiation
const {
    sendNotificationList,
    sendHeartbeatList,
    sendInfo,
    sendProxyList,
    sendDockerHostList,
    sendAPIKeyList,
    sendRemoteBrowserList,
    sendMonitorTypeList,
} = require("./client");
const { statusPageSocketHandler } = require("./socket-handlers/status-page-socket-handler");
const { databaseSocketHandler } = require("./socket-handlers/database-socket-handler");
const { remoteBrowserSocketHandler } = require("./socket-handlers/remote-browser-socket-handler");
const TwoFA = require("./2fa");
const StatusPage = require("./model/status_page");
const {
    cloudflaredSocketHandler,
    autoStart: cloudflaredAutoStart,
    stop: cloudflaredStop,
} = require("./socket-handlers/cloudflared-socket-handler");
const { proxySocketHandler } = require("./socket-handlers/proxy-socket-handler");
const { dockerSocketHandler } = require("./socket-handlers/docker-socket-handler");
const { maintenanceSocketHandler } = require("./socket-handlers/maintenance-socket-handler");
const { apiKeySocketHandler } = require("./socket-handlers/api-key-socket-handler");
const { userSocketHandler } = require("./socket-handlers/user-socket-handler");
const { logSocketHandler } = require("./socket-handlers/log-socket-handler");
const { licenseSocketHandler } = require("./socket-handlers/license-socket-handler");
const { generalSocketHandler } = require("./socket-handlers/general-socket-handler");
const { Settings } = require("./settings");
const apicache = require("./modules/apicache");
const { resetChrome } = require("./monitor-types/real-browser-monitor-type");
const { EmbeddedMariaDB } = require("./embedded-mariadb");
const { SetupDatabase } = require("./setup-database");
const { chartSocketHandler } = require("./socket-handlers/chart-socket-handler");

app.use(express.json());

// Global Middleware
app.use(function (req, res, next) {
    if (!disableFrameSameOrigin) {
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
    }
    res.removeHeader("X-Powered-By");
    next();
});

/**
 * Show Setup Page
 * @type {boolean}
 */
let needSetup = false;

(async () => {
    // Create a data directory
    Database.initDataDir(args);

    // Check if is chosen a database type
    let setupDatabase = new SetupDatabase(args, server);
    if (setupDatabase.isNeedSetup()) {
        // Hold here and start a special setup page until user choose a database type
        await setupDatabase.start(hostname, port);
    }

    // Connect to database
    try {
        await initDatabase(testMode);
    } catch (e) {
        log.error("server", "Failed to prepare your database: " + e.message);
        process.exit(1);
    }

    // Database should be ready now
    await server.initAfterDatabaseReady();
    server.entryPage = await Settings.get("entryPage");
    await StatusPage.loadDomainMappingList();

    log.debug("server", "Initializing Prometheus");
    await Prometheus.init();

    log.debug("server", "Adding route");

    // ***************************
    // Normal Router here
    // ***************************

    // Entry Page
    app.get("/", async (request, response) => {
        let hostname = request.hostname;
        if (await setting("trustProxy")) {
            const proxy = request.headers["x-forwarded-host"];
            if (proxy) {
                hostname = proxy;
            }
        }

        log.debug("entry", `Request Domain: ${hostname}`);

        const uptimeKumaEntryPage = server.entryPage;
        if (hostname in StatusPage.domainMappingList) {
            log.debug("entry", "This is a status page domain");

            let slug = StatusPage.domainMappingList[hostname];
            await StatusPage.handleStatusPageResponse(response, server.indexHTML, slug);
        } else if (uptimeKumaEntryPage && uptimeKumaEntryPage.startsWith("statusPage-")) {
            response.redirect("/status/" + uptimeKumaEntryPage.replace("statusPage-", ""));
        } else {
            response.redirect("/dashboard");
        }
    });

    app.get("/setup-database-info", (request, response) => {
        allowDevAllOrigin(response);
        response.json({
            runningSetup: false,
            needSetup: false,
        });
    });

    if (isDev) {
        app.use(express.urlencoded({ extended: true }));
        app.post("/test-webhook", async (request, response) => {
            log.debug("test", request.headers);
            log.debug("test", request.body);
            response.send("OK");
        });

        app.post("/test-x-www-form-urlencoded", async (request, response) => {
            log.debug("test", request.headers);
            log.debug("test", request.body);
            response.send("OK");
        });

        const fs = require("fs");

        app.get("/_e2e/take-sqlite-snapshot", async (request, response) => {
            await Database.close();
            try {
                fs.cpSync(Database.sqlitePath, `${Database.sqlitePath}.e2e-snapshot`);
            } catch (err) {
                throw new Error("Unable to copy SQLite DB.");
            }
            await Database.connect();

            response.send("Snapshot taken.");
        });

        app.get("/_e2e/restore-sqlite-snapshot", async (request, response) => {
            if (!fs.existsSync(`${Database.sqlitePath}.e2e-snapshot`)) {
                throw new Error("Snapshot doesn't exist.");
            }

            await Database.close();
            try {
                fs.cpSync(`${Database.sqlitePath}.e2e-snapshot`, Database.sqlitePath);
            } catch (err) {
                throw new Error("Unable to copy snapshot file.");
            }
            await Database.connect();

            response.send("Snapshot restored.");
        });
    }

    // Robots.txt
    app.get("/robots.txt", async (_request, response) => {
        let txt = "User-agent: *\nDisallow:";
        if (!(await setting("searchEngineIndex"))) {
            txt += " /";
        }
        response.setHeader("Content-Type", "text/plain");
        response.send(txt);
    });

    // Basic Auth Router here

    // Prometheus API metrics  /metrics
    // With Basic Auth using the first user's username/password
    app.get("/metrics", apiAuth, prometheusAPIMetrics());

    app.use(
        "/",
        expressStaticGzip("dist", {
            enableBrotli: true,
        })
    );

    // ./data/upload
    app.use("/upload", express.static(Database.uploadDir));

    app.get("/.well-known/change-password", async (_, response) => {
        response.redirect("mailto:info@zennialhub.in");
    });

    // API Router
    const apiRouter = require("./routers/api-router");
    app.use(apiRouter);

    // Status Page Router
    const statusPageRouter = require("./routers/status-page-router");
    app.use(statusPageRouter);

    // Universal Route Handler, must be at the end of all express routes.
    app.get("*", async (_request, response) => {
        if (_request.originalUrl.startsWith("/upload/")) {
            response.status(404).send("File not found.");
        } else {
            response.send(server.indexHTML);
        }
    });

    log.debug("server", "Adding socket handler");
    io.on("connection", async (socket) => {
        // Fail-closed guard for the "employee" role: wrap every socket.on
        // registration made on this connection (including the ones registered by
        // the socket-handlers/*.js files further below, since they all register on
        // this same socket object) so an employee-role account can only reach the
        // explicitly allow-listed read-only events.
        const rawSocketOn = socket.on.bind(socket);
        socket.on = (event, listener) => {
            return rawSocketOn(event, async (...args) => {
                if (socket.userRole === "employee" && !EMPLOYEE_ALLOWED_EVENTS.has(event)) {
                    log.warn("auth", `Blocked employee user ${socket.userID} from restricted event: ${event}`);
                    const callback = args[args.length - 1];
                    if (typeof callback === "function") {
                        callback({
                            ok: false,
                            msg: "You do not have permission to perform this action.",
                        });
                    }
                    return;
                }
                return listener(...args);
            });
        };

        await sendInfo(socket, true);

        if (needSetup) {
            log.info("server", "Redirect to setup page");
            socket.emit("setup");
        }

        // ***************************
        // Public Socket API
        // ***************************

        socket.on("loginByToken", async (token, callback) => {
            const clientIP = await server.getClientIP(socket);

            log.info("auth", `Login by token. IP=${clientIP}`);

            try {
                let decoded = jwt.verify(token, server.jwtSecret);

                log.info("auth", "Username from JWT: " + decoded.username);

                let user = await R.findOne("user", " username = ? AND active = 1 ", [decoded.username]);

                if (user) {
                    // Check if the password changed
                    if (decoded.h !== shake256(user.password, SHAKE256_LENGTH)) {
                        throw new Error("The token is invalid due to password change or old token");
                    }

                    log.debug("auth", "afterLogin");
                    await afterLogin(socket, user);
                    log.debug("auth", "afterLogin ok");

                    log.info("auth", `Successfully logged in user ${decoded.username}. IP=${clientIP}`);

                    callback({
                        ok: true,
                    });
                } else {
                    log.info("auth", `Inactive or deleted user ${decoded.username}. IP=${clientIP}`);

                    callback({
                        ok: false,
                        msg: "authUserInactiveOrDeleted",
                        msgi18n: true,
                    });
                }
            } catch (error) {
                log.error("auth", `Invalid token. IP=${clientIP}`);
                if (error.message) {
                    log.error("auth", error.message, `IP=${clientIP}`);
                }
                callback({
                    ok: false,
                    msg: "authInvalidToken",
                    msgi18n: true,
                });
            }
        });

        socket.on("login", async (data, callback) => {
            const clientIP = await server.getClientIP(socket);

            log.info("auth", `Login by username + password. IP=${clientIP}`);

            // Checking
            if (typeof callback !== "function") {
                return;
            }

            if (!data) {
                return;
            }

            // Login Rate Limit
            if (!(await loginRateLimiter.pass(callback))) {
                log.info("auth", `Too many failed requests for user ${data.username}. IP=${clientIP}`);
                return;
            }

            let user = await login(data.username, data.password);

            if (user) {
                if (user.twofa_status === 0) {
                    await afterLogin(socket, user);

                    log.info("auth", `Successfully logged in user ${data.username}. IP=${clientIP}`);

                    callback({
                        ok: true,
                        token: User.createJWT(user, server.jwtSecret),
                    });
                }

                if (user.twofa_status === 1 && !data.token) {
                    log.info("auth", `2FA token required for user ${data.username}. IP=${clientIP}`);

                    callback({
                        tokenRequired: true,
                    });
                }

                if (data.token) {
                    let verify = notp.totp.verify(data.token, user.twofa_secret, twoFAVerifyOptions);

                    if (user.twofa_last_token !== data.token && verify) {
                        await afterLogin(socket, user);

                        await R.exec("UPDATE `user` SET twofa_last_token = ? WHERE id = ? ", [
                            data.token,
                            socket.userID,
                        ]);

                        log.info("auth", `Successfully logged in user ${data.username}. IP=${clientIP}`);

                        callback({
                            ok: true,
                            token: User.createJWT(user, server.jwtSecret),
                        });
                    } else {
                        log.warn("auth", `Invalid token provided for user ${data.username}. IP=${clientIP}`);

                        callback({
                            ok: false,
                            msg: "authInvalidToken",
                            msgi18n: true,
                        });
                    }
                }
            } else {
                log.warn("auth", `Incorrect username or password for user ${data.username}. IP=${clientIP}`);

                callback({
                    ok: false,
                    msg: "authIncorrectCreds",
                    msgi18n: true,
                });
            }
        });

        socket.on("logout", async (callback) => {
            // Rate Limit
            if (!(await loginRateLimiter.pass(callback))) {
                return;
            }

            socket.leave(socket.userID);
            socket.userID = null;
            socket.userRole = null;

            if (typeof callback === "function") {
                callback();
            }
        });

        socket.on("prepare2FA", async (currentPassword, callback) => {
            try {
                if (!(await twoFaRateLimiter.pass(callback))) {
                    return;
                }

                checkLogin(socket);
                await doubleCheckPassword(socket, currentPassword);

                let user = await R.findOne("user", " id = ? AND active = 1 ", [socket.userID]);

                if (user.twofa_status === 0) {
                    let newSecret = genSecret();
                    let encodedSecret = base32.encode(newSecret);

                    // Google authenticator doesn't like equal signs
                    // The fix is found at https://github.com/guyht/notp
                    // Related issue: https://github.com/louislam/uptime-kuma/issues/486
                    encodedSecret = encodedSecret.toString().replace(/=/g, "");

                    let uri = `otpauth://totp/Uptime%20Kuma:${user.username}?secret=${encodedSecret}`;

                    await R.exec("UPDATE `user` SET twofa_secret = ? WHERE id = ? ", [newSecret, socket.userID]);

                    callback({
                        ok: true,
                        uri: uri,
                    });
                } else {
                    callback({
                        ok: false,
                        msg: "2faAlreadyEnabled",
                        msgi18n: true,
                    });
                }
            } catch (error) {
                callback({
                    ok: false,
                    msg: error.message,
                });
            }
        });

        socket.on("save2FA", async (currentPassword, callback) => {
            const clientIP = await server.getClientIP(socket);

            try {
                if (!(await twoFaRateLimiter.pass(callback))) {
                    return;
                }

                checkLogin(socket);
                await doubleCheckPassword(socket, currentPassword);

                await R.exec("UPDATE `user` SET twofa_status = 1 WHERE id = ? ", [socket.userID]);

                log.info("auth", `Saved 2FA token. IP=${clientIP}`);

                callback({
                    ok: true,
                    msg: "2faEnabled",
                    msgi18n: true,
                });
            } catch (error) {
                log.error("auth", `Error changing 2FA token. IP=${clientIP}`);

                callback({
                    ok: false,
                    msg: error.message,
                });
            }
        });

        socket.on("disable2FA", async (currentPassword, callback) => {
            const clientIP = await server.getClientIP(socket);

            try {
                if (!(await twoFaRateLimiter.pass(callback))) {
                    return;
                }

                checkLogin(socket);
                await doubleCheckPassword(socket, currentPassword);
                await TwoFA.disable2FA(socket.userID);

                log.info("auth", `Disabled 2FA token. IP=${clientIP}`);

                callback({
                    ok: true,
                    msg: "2faDisabled",
                    msgi18n: true,
                });
            } catch (error) {
                log.error("auth", `Error disabling 2FA token. IP=${clientIP}`);

                callback({
                    ok: false,
                    msg: error.message,
                });
            }
        });

        socket.on("verifyToken", async (token, currentPassword, callback) => {
            try {
                checkLogin(socket);
                await doubleCheckPassword(socket, currentPassword);

                let user = await R.findOne("user", " id = ? AND active = 1 ", [socket.userID]);

                let verify = notp.totp.verify(token, user.twofa_secret, twoFAVerifyOptions);

                if (user.twofa_last_token !== token && verify) {
                    callback({
                        ok: true,
                        valid: true,
                    });
                } else {
                    callback({
                        ok: false,
                        msg: "authInvalidToken",
                        msgi18n: true,
                        valid: false,
                    });
                }
            } catch (error) {
                callback({
                    ok: false,
                    msg: error.message,
                });
            }
        });

        socket.on("twoFAStatus", async (callback) => {
            try {
                checkLogin(socket);

                let user = await R.findOne("user", " id = ? AND active = 1 ", [socket.userID]);

                if (user.twofa_status === 1) {
                    callback({
                        ok: true,
                        status: true,
                    });
                } else {
                    callback({
                        ok: true,
                        status: false,
                    });
                }
            } catch (error) {
                callback({
                    ok: false,
                    msg: error.message,
                });
            }
        });

        socket.on("needSetup", async (callback) => {
            callback(needSetup);
        });

        socket.on("setup", async (username, password, callback) => {
            try {
                if (passwordStrength(password).value === "Too weak") {
                    throw new TranslatableError("passwordTooWeak");
                }

                if ((await R.knex("user").count("id as count").first()).count !== 0) {
                    throw new Error(
                        "ZMonitor has been initialized. If you want to run setup again, please delete the database."
                    );
                }

                let user = R.dispense("user");
                user.username = username;
                user.password = await passwordHash.generate(password);
                await R.store(user);

                needSetup = false;

                callback({
                    ok: true,
                    msg: "successAdded",
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

        // ***************************
        // Auth Only API
        // ***************************

        // Add a new monitor
        socket.on("add", async (monitor, callback) => {
            try {
                checkLogin(socket);
                let bean = R.dispense("monitor");

                let notificationIDList = monitor.notificationIDList;
                delete monitor.notificationIDList;

                // Ensure status code ranges are strings
                if (!monitor.accepted_statuscodes.every((code) => typeof code === "string")) {
                    throw new Error("Accepted status codes are not all strings");
                }
                monitor.accepted_statuscodes_json = JSON.stringify(monitor.accepted_statuscodes);
                delete monitor.accepted_statuscodes;

                monitor.kafkaProducerBrokers = JSON.stringify(monitor.kafkaProducerBrokers);
                monitor.kafkaProducerSaslOptions = JSON.stringify(monitor.kafkaProducerSaslOptions);

                monitor.conditions = JSON.stringify(monitor.conditions);

                monitor.rabbitmqNodes = JSON.stringify(monitor.rabbitmqNodes);

                /*
                 * List of frontend-only properties that should not be saved to the database.
                 * Should clean up before saving to the database.
                 */
                const frontendOnlyProperties = [
                    "humanReadableInterval",
                    "globalpingdnsresolvetypeoptions",
                    "responsecheck",
                ];
                for (const prop of frontendOnlyProperties) {
                    if (prop in monitor) {
                        delete monitor[prop];
                    }
                }

                bean.import(monitor);
                // Map camelCase frontend property to snake_case database column
                if (monitor.retryOnlyOnStatusCodeFailure !== undefined) {
                    bean.retry_only_on_status_code_failure = monitor.retryOnlyOnStatusCodeFailure;
                }
                bean.user_id = socket.userID;

                bean.validate();

                await R.store(bean);

                await updateMonitorNotification(bean.id, notificationIDList);

                await server.sendUpdateMonitorIntoList(socket, bean.id);

                if (monitor.active !== false) {
                    await startMonitor(socket.userID, bean.id);
                }

                log.info("monitor", `Added Monitor: ${bean.id} User ID: ${socket.userID}`);

                callback({
                    ok: true,
                    msg: "successAdded",
                    msgi18n: true,
                    monitorID: bean.id,
                });
            } catch (e) {
                log.error("monitor", `Error adding Monitor: ${monitor.id} User ID: ${socket.userID}`);

                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        // Restore monitors + notifications from an exported backup JSON file.
        // Accepts files from this project as well as real Uptime Kuma exports,
        // since customers migrating in bring the latter.
        socket.on("uploadBackup", async (uploadedJSON, importHandle, callback) => {
            try {
                checkLogin(socket);

                let backupData;
                try {
                    backupData = JSON.parse(uploadedJSON);
                } catch (e) {
                    throw new Error("This doesn't look like a valid backup file (not valid JSON).");
                }

                if (!Array.isArray(backupData.monitorList)) {
                    throw new Error("This doesn't look like a valid backup file (missing monitorList).");
                }

                log.info(
                    "backup",
                    `Restoring backup for User ID: ${socket.userID}, mode: ${importHandle}, ${backupData.monitorList.length} monitor(s), ${(backupData.notificationList || []).length} notification(s)`
                );

                if (importHandle === "overwrite") {
                    const existing = await R.getAll("SELECT id, parent FROM monitor WHERE user_id = ? ", [
                        socket.userID,
                    ]);
                    for (const row of existing) {
                        if (row.parent === null) {
                            await Monitor.deleteMonitorRecursively(row.id, socket.userID);
                        }
                    }
                    await R.exec("DELETE FROM notification WHERE user_id = ? ", [socket.userID]);
                }

                // 1. Notifications first, so monitors can reference the new IDs
                const notificationIDMap = {};
                for (const oldNotification of backupData.notificationList || []) {
                    let config;
                    try {
                        config = JSON.parse(oldNotification.config);
                    } catch (e) {
                        continue;
                    }

                    if (importHandle === "skip") {
                        const existing = await R.findOne("notification", " name = ? AND user_id = ? ", [
                            config.name,
                            socket.userID,
                        ]);
                        if (existing) {
                            notificationIDMap[oldNotification.id] = existing.id;
                            continue;
                        }
                    }

                    config.applyExisting = false;
                    const bean = await Notification.save(config, null, socket.userID);
                    notificationIDMap[oldNotification.id] = bean.id;
                }
                await sendNotificationList(socket);

                // 2. Monitors. Two passes: create everything first (parent unset), then
                // re-link parent/child (group) relationships once every new ID is known.
                const monitorIDMap = {};
                let importedCount = 0;
                let skippedCount = 0;

                for (const oldMonitor of backupData.monitorList) {
                    if (importHandle === "skip") {
                        const existing = await R.findOne("monitor", " name = ? AND user_id = ? ", [
                            oldMonitor.name,
                            socket.userID,
                        ]);
                        if (existing) {
                            skippedCount++;
                            continue;
                        }
                    }

                    const monitor = { ...oldMonitor };
                    const oldID = monitor.id;
                    const oldParent = monitor.parent;
                    const tags = monitor.tags || [];
                    const retryOnlyOnStatusCodeFailure = monitor.retryOnlyOnStatusCodeFailure;

                    const oldNotificationIDList = monitor.notificationIDList || {};
                    const notificationIDList = {};
                    for (const oldNotifID in oldNotificationIDList) {
                        if (oldNotificationIDList[oldNotifID] && notificationIDMap[oldNotifID]) {
                            notificationIDList[notificationIDMap[oldNotifID]] = true;
                        }
                    }
                    delete monitor.notificationIDList;

                    // Fields not present in older/upstream exports need defaults so
                    // JSON.stringify() below doesn't write "undefined" into the DB.
                    monitor.parent = null;
                    monitor.accepted_statuscodes = Array.isArray(monitor.accepted_statuscodes)
                        ? monitor.accepted_statuscodes
                        : ["200-299"];
                    monitor.kafkaProducerBrokers = monitor.kafkaProducerBrokers || [];
                    monitor.kafkaProducerSaslOptions = monitor.kafkaProducerSaslOptions || {};
                    monitor.conditions = monitor.conditions || [];
                    monitor.rabbitmqNodes = monitor.rabbitmqNodes || [];

                    let bean = R.dispense("monitor");

                    monitor.accepted_statuscodes_json = JSON.stringify(monitor.accepted_statuscodes);
                    delete monitor.accepted_statuscodes;
                    monitor.kafkaProducerBrokers = JSON.stringify(monitor.kafkaProducerBrokers);
                    monitor.kafkaProducerSaslOptions = JSON.stringify(monitor.kafkaProducerSaslOptions);
                    monitor.conditions = JSON.stringify(monitor.conditions);
                    monitor.rabbitmqNodes = JSON.stringify(monitor.rabbitmqNodes);

                    // Drop anything that isn't a real column (id, tags, notificationIDList,
                    // path/pathName/childrenIDs, and computed fields like forceInactive,
                    // screenshot, maintenance, status - see MONITOR_TABLE_COLUMNS above).
                    for (const key of Object.keys(monitor)) {
                        if (!MONITOR_TABLE_COLUMNS.has(camelCaseToUnderscore(key))) {
                            delete monitor[key];
                        }
                    }

                    bean.import(monitor);
                    // Same explicit mapping the "add" handler uses - the multiple capitals in this
                    // one trip up automatic camelCase-to-snake_case bean field conversion.
                    if (retryOnlyOnStatusCodeFailure !== undefined) {
                        bean.retry_only_on_status_code_failure = retryOnlyOnStatusCodeFailure;
                    }
                    bean.user_id = socket.userID;
                    bean.validate();
                    await R.store(bean);

                    monitorIDMap[oldID] = { newID: bean.id, oldParent };

                    await updateMonitorNotification(bean.id, notificationIDList);

                    for (const t of tags) {
                        let tagBean = await R.findOne("tag", " name = ? ", [t.name]);
                        if (!tagBean) {
                            tagBean = R.dispense("tag");
                            tagBean.name = t.name;
                            tagBean.color = t.color;
                            await R.store(tagBean);
                        }
                        await R.exec("INSERT INTO monitor_tag (tag_id, monitor_id, value) VALUES (?, ?, ?)", [
                            tagBean.id,
                            bean.id,
                            t.value,
                        ]);
                    }

                    importedCount++;
                }

                // Re-link group/parent relationships now that every new ID exists
                for (const oldID in monitorIDMap) {
                    const { newID, oldParent } = monitorIDMap[oldID];
                    if (oldParent !== null && oldParent !== undefined && monitorIDMap[oldParent]) {
                        await R.exec("UPDATE monitor SET parent = ? WHERE id = ? ", [
                            monitorIDMap[oldParent].newID,
                            newID,
                        ]);
                    }
                }

                // Start any imported monitor that was active in the source backup
                for (const oldID in monitorIDMap) {
                    const { newID } = monitorIDMap[oldID];
                    const bean = await R.findOne("monitor", " id = ? ", [newID]);
                    if (bean && bean.active) {
                        await startMonitor(socket.userID, newID);
                    }
                }

                await server.sendMonitorList(socket);

                log.info(
                    "backup",
                    `Backup restore complete for User ID: ${socket.userID}: ${importedCount} imported, ${skippedCount} skipped`
                );

                callback({
                    ok: true,
                    msg: "successBackupRestored",
                    msgi18n: true,
                });
            } catch (e) {
                log.error("backup", `Error restoring backup for User ID: ${socket.userID}: ${e.message}`);
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        // Set lat/lng on an existing monitor (map/CSV-import path). Deliberately
        // separate from editMonitor, which requires a full monitor payload and
        // would overwrite every other field with whatever the caller happens to
        // send - a bulk CSV row only knows lat/lng, not the monitor's full config.
        socket.on("setMonitorLatLng", async (data, callback) => {
            try {
                checkAdmin(socket);

                const bean = await R.findOne("monitor", " id = ? ", [data.id]);
                if (!bean) {
                    throw new Error("Monitor not found");
                }
                if (bean.user_id !== socket.userID) {
                    throw new Error("Permission denied.");
                }

                bean.lat = data.lat === null || data.lat === undefined ? null : Number(data.lat);
                bean.lng = data.lng === null || data.lng === undefined ? null : Number(data.lng);
                await R.store(bean);

                callback({ ok: true });
            } catch (e) {
                callback({ ok: false, msg: e.message });
            }
        });

        // Edit a monitor
        socket.on("editMonitor", async (monitor, callback) => {
            try {
                let removeGroupChildren = false;
                checkLogin(socket);

                let bean = await R.findOne("monitor", " id = ? ", [monitor.id]);

                if (bean.user_id !== socket.userID) {
                    throw new Error("Permission denied.");
                }

                // Check if Parent is Descendant (would cause endless loop)
                if (monitor.parent !== null) {
                    const childIDs = await Monitor.getAllChildrenIDs(monitor.id);
                    if (childIDs.includes(monitor.parent)) {
                        throw new Error("Invalid Monitor Group");
                    }
                }

                // Remove children if monitor type has changed (from group to non-group)
                if (bean.type === "group" && monitor.type !== bean.type) {
                    removeGroupChildren = true;
                }

                // Ensure status code ranges are strings
                if (!monitor.accepted_statuscodes.every((code) => typeof code === "string")) {
                    throw new Error("Accepted status codes are not all strings");
                }

                bean.name = monitor.name;
                bean.description = monitor.description;
                bean.lat = monitor.lat === null || monitor.lat === undefined ? null : Number(monitor.lat);
                bean.lng = monitor.lng === null || monitor.lng === undefined ? null : Number(monitor.lng);
                bean.parent = monitor.parent;
                bean.type = monitor.type;
                bean.subtype = monitor.subtype;
                bean.url = monitor.url;
                bean.wsIgnoreSecWebsocketAcceptHeader = monitor.wsIgnoreSecWebsocketAcceptHeader;
                bean.wsSubprotocol = monitor.wsSubprotocol;
                bean.method = monitor.method;
                bean.body = monitor.body;
                bean.ipFamily = monitor.ipFamily;
                bean.headers = monitor.headers;
                bean.basic_auth_user = monitor.basic_auth_user;
                bean.basic_auth_pass = monitor.basic_auth_pass;
                bean.bearer_token = monitor.bearer_token;
                bean.timeout = monitor.timeout;
                bean.oauth_client_id = monitor.oauth_client_id;
                bean.oauth_client_secret = monitor.oauth_client_secret;
                bean.oauth_auth_method = monitor.oauth_auth_method;
                bean.oauth_token_url = monitor.oauth_token_url;
                bean.oauth_scopes = monitor.oauth_scopes;
                bean.oauth_audience = monitor.oauth_audience;
                bean.tlsCa = monitor.tlsCa;
                bean.tlsCert = monitor.tlsCert;
                bean.tlsKey = monitor.tlsKey;
                bean.interval = monitor.interval;
                bean.retryInterval = monitor.retryInterval;
                bean.resendInterval = monitor.resendInterval;
                bean.hostname = monitor.hostname;
                bean.game = monitor.game;
                bean.maxretries = monitor.maxretries;
                bean.port = parseInt(monitor.port);
                bean.location = monitor.location;
                bean.protocol = monitor.protocol;

                if (isNaN(bean.port)) {
                    bean.port = null;
                }

                bean.keyword = monitor.keyword;
                bean.invertKeyword = monitor.invertKeyword;
                bean.ignoreTls = monitor.ignoreTls;
                bean.expiryNotification = monitor.expiryNotification;
                bean.domainExpiryNotification = monitor.domainExpiryNotification;
                bean.upsideDown = monitor.upsideDown;
                bean.packetSize = monitor.packetSize;
                bean.maxredirects = monitor.maxredirects;
                bean.accepted_statuscodes_json = JSON.stringify(monitor.accepted_statuscodes);
                bean.save_response = monitor.saveResponse;
                bean.save_error_response = monitor.saveErrorResponse;
                bean.response_max_length = monitor.responseMaxLength;
                bean.dns_resolve_type = monitor.dns_resolve_type;
                bean.dns_resolve_server = monitor.dns_resolve_server;
                bean.pushToken = monitor.pushToken;
                bean.docker_container = monitor.docker_container;
                bean.docker_host = monitor.docker_host;
                bean.proxyId = Number.isInteger(monitor.proxyId) ? monitor.proxyId : null;
                bean.mqttUsername = monitor.mqttUsername;
                bean.mqttPassword = monitor.mqttPassword;
                bean.mqttTopic = monitor.mqttTopic;
                bean.mqttSuccessMessage = monitor.mqttSuccessMessage;
                bean.mqttCheckType = monitor.mqttCheckType;
                bean.mqttWebsocketPath = monitor.mqttWebsocketPath;
                bean.databaseConnectionString = monitor.databaseConnectionString;
                bean.databaseQuery = monitor.databaseQuery;
                bean.authMethod = monitor.authMethod;
                bean.authWorkstation = monitor.authWorkstation;
                bean.authDomain = monitor.authDomain;
                bean.grpcUrl = monitor.grpcUrl;
                bean.grpcProtobuf = monitor.grpcProtobuf;
                bean.grpcServiceName = monitor.grpcServiceName;
                bean.grpcMethod = monitor.grpcMethod;
                bean.grpcBody = monitor.grpcBody;
                bean.grpcMetadata = monitor.grpcMetadata;
                bean.grpcEnableTls = monitor.grpcEnableTls;
                bean.radiusUsername = monitor.radiusUsername;
                bean.radiusPassword = monitor.radiusPassword;
                bean.radiusCalledStationId = monitor.radiusCalledStationId;
                bean.radiusCallingStationId = monitor.radiusCallingStationId;
                bean.radiusSecret = monitor.radiusSecret;
                bean.httpBodyEncoding = monitor.httpBodyEncoding;
                bean.expectedValue = monitor.expectedValue;
                bean.jsonPath = monitor.jsonPath;
                bean.kafkaProducerTopic = monitor.kafkaProducerTopic;
                bean.kafkaProducerBrokers = JSON.stringify(monitor.kafkaProducerBrokers);
                bean.kafkaProducerAllowAutoTopicCreation = monitor.kafkaProducerAllowAutoTopicCreation;
                bean.kafkaProducerSaslOptions = JSON.stringify(monitor.kafkaProducerSaslOptions);
                bean.kafkaProducerMessage = monitor.kafkaProducerMessage;
                bean.cacheBust = monitor.cacheBust;
                bean.kafkaProducerSsl = monitor.kafkaProducerSsl;
                bean.kafkaProducerAllowAutoTopicCreation = monitor.kafkaProducerAllowAutoTopicCreation;
                bean.gamedigGivenPortOnly = monitor.gamedigGivenPortOnly;
                bean.gamedigToken = monitor.gamedigToken;
                bean.remote_browser = monitor.remote_browser;
                bean.smtpSecurity = monitor.smtpSecurity;
                bean.snmpVersion = monitor.snmpVersion;
                bean.snmpOid = monitor.snmpOid;
                bean.jsonPathOperator = monitor.jsonPathOperator;
                bean.retry_only_on_status_code_failure = Boolean(monitor.retryOnlyOnStatusCodeFailure);
                bean.timeout = monitor.timeout;
                bean.rabbitmqNodes = JSON.stringify(monitor.rabbitmqNodes);
                bean.rabbitmqUsername = monitor.rabbitmqUsername;
                bean.rabbitmqPassword = monitor.rabbitmqPassword;
                bean.conditions = JSON.stringify(monitor.conditions);
                bean.manual_status = monitor.manual_status;
                bean.system_service_name = monitor.system_service_name;
                bean.expected_tls_alert = monitor.expectedTlsAlert;
                bean.ntp_stratum_threshold = monitor.ntpStratumThreshold;
                bean.ntp_time_offset_threshold = monitor.ntpTimeOffsetThreshold;
                bean.ntp_root_dispersion_threshold = monitor.ntpRootDispersionThreshold;

                // ping advanced options
                bean.ping_numeric = monitor.ping_numeric;
                bean.ping_count = monitor.ping_count;
                bean.ping_per_request_timeout = monitor.ping_per_request_timeout;

                bean.validate();

                await R.store(bean);

                if (removeGroupChildren) {
                    await Monitor.unlinkAllChildren(monitor.id);
                }

                await updateMonitorNotification(bean.id, monitor.notificationIDList);

                if (await Monitor.isActive(bean.id, bean.active)) {
                    await restartMonitor(socket.userID, bean.id);
                }

                await server.sendUpdateMonitorIntoList(socket, bean.id);

                callback({
                    ok: true,
                    msg: "Saved.",
                    msgi18n: true,
                    monitorID: bean.id,
                });
            } catch (e) {
                log.error("monitor", e);
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("getMonitorList", async (callback) => {
            try {
                checkLogin(socket);
                await server.sendMonitorList(socket);
                callback({
                    ok: true,
                });
            } catch (e) {
                log.error("monitor", e);
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("getMonitor", async (monitorID, callback) => {
            try {
                checkLogin(socket);

                log.info("monitor", `Get Monitor: ${monitorID} User ID: ${socket.userID}`);

                const accessible = await Monitor.getAccessibleMonitorIdsSQL(socket.userID);
                let monitor = await R.findOne("monitor", ` id = ? AND id IN (${accessible.sql}) `, [
                    monitorID,
                    ...accessible.params,
                ]);
                if (!monitor) {
                    throw new Error("You do not have access to this monitor.");
                }
                const monitorData = [{ id: monitor.id, active: monitor.active }];
                const preloadData = await Monitor.preparePreloadData(monitorData);
                callback({
                    ok: true,
                    monitor: monitor.toJSON(preloadData),
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        // partial { type, url, hostname, grpcUrl }
        socket.on("checkDomain", async (partial, callback) => {
            try {
                checkLogin(socket);
                const DomainExpiry = require("./model/domain_expiry");
                const supportInfo = await DomainExpiry.checkSupport(partial);
                callback({
                    ok: true,
                    domain: supportInfo.domain,
                    tld: supportInfo.tld,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                    msgi18n: !!e.msgi18n,
                    meta: e.meta ?? {},
                });
            }
        });

        socket.on("getMonitorBeats", async (monitorID, period, callback) => {
            try {
                checkLogin(socket);

                log.info("monitor", `Get Monitor Beats: ${monitorID} User ID: ${socket.userID}`);

                if (period == null) {
                    throw new Error("Invalid period.");
                }

                if (!(await Monitor.userCanAccess(socket.userID, monitorID))) {
                    throw new Error("You do not have access to this monitor.");
                }

                const sqlHourOffset = Database.sqlHourOffset();

                let list = await R.getAll(
                    `
                    SELECT *
                    FROM heartbeat
                    WHERE monitor_id = ?
                      AND time > ${sqlHourOffset}
                    ORDER BY time ASC
                `,
                    [monitorID, -period]
                );

                callback({
                    ok: true,
                    data: list,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        // Start or Resume the monitor
        socket.on("resumeMonitor", async (monitorID, callback) => {
            try {
                checkLogin(socket);
                await startMonitor(socket.userID, monitorID);
                await server.sendUpdateMonitorIntoList(socket, monitorID);

                callback({
                    ok: true,
                    msg: "successResumed",
                    msgi18n: true,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("pauseMonitor", async (monitorID, callback) => {
            try {
                checkLogin(socket);
                await pauseMonitor(socket.userID, monitorID);
                await server.sendUpdateMonitorIntoList(socket, monitorID);

                callback({
                    ok: true,
                    msg: "successPaused",
                    msgi18n: true,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("deleteMonitor", async (monitorID, deleteChildren, callback) => {
            try {
                // Backward compatibility: if deleteChildren is omitted, the second parameter is the callback
                if (typeof deleteChildren === "function") {
                    callback = deleteChildren;
                    deleteChildren = false;
                }

                checkLogin(socket);

                const startTime = Date.now();

                // Check if this is a group monitor
                const monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [monitorID, socket.userID]);

                // Log with context about deletion type
                if (monitor && monitor.type === "group") {
                    if (deleteChildren) {
                        log.info("manage", `Delete Group and Children: ${monitorID} User ID: ${socket.userID}`);
                    } else {
                        log.info("manage", `Delete Group (unlink children): ${monitorID} User ID: ${socket.userID}`);
                    }
                } else {
                    log.info("manage", `Delete Monitor: ${monitorID} User ID: ${socket.userID}`);
                }

                if (monitor && monitor.type === "group") {
                    // Get all children before processing
                    const children = await Monitor.getChildren(monitorID);

                    if (deleteChildren) {
                        // Delete all child monitors recursively
                        if (children && children.length > 0) {
                            for (const child of children) {
                                await Monitor.deleteMonitorRecursively(child.id, socket.userID);
                                await server.sendDeleteMonitorFromList(socket, child.id);
                            }
                        }
                    } else {
                        // Unlink all children from the group (set parent to null)
                        await Monitor.unlinkAllChildren(monitorID);

                        // Notify frontend to update each child monitor's parent to null
                        if (children && children.length > 0) {
                            for (const child of children) {
                                await server.sendUpdateMonitorIntoList(socket, child.id);
                            }
                        }
                    }
                }

                // Delete the monitor itself
                await Monitor.deleteMonitor(monitorID, socket.userID);

                // Fix #2880
                apicache.clear();

                const endTime = Date.now();

                // Log completion with context about children handling
                if (monitor && monitor.type === "group") {
                    if (deleteChildren) {
                        log.info(
                            "DB",
                            `Delete Monitor completed (group and children deleted) in: ${endTime - startTime} ms`
                        );
                    } else {
                        log.info(
                            "DB",
                            `Delete Monitor completed (group deleted, children unlinked) in: ${endTime - startTime} ms`
                        );
                    }
                } else {
                    log.info("DB", `Delete Monitor completed in: ${endTime - startTime} ms`);
                }

                callback({
                    ok: true,
                    msg: "successDeleted",
                    msgi18n: true,
                });
                await server.sendDeleteMonitorFromList(socket, monitorID);
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("getTags", async (callback) => {
            try {
                checkLogin(socket);

                const list = await R.findAll("tag");

                callback({
                    ok: true,
                    tags: list.map((bean) => bean.toJSON()),
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("addTag", async (tag, callback) => {
            try {
                checkLogin(socket);

                let bean = R.dispense("tag");
                bean.name = tag.name;
                bean.color = tag.color;
                await R.store(bean);

                callback({
                    ok: true,
                    tag: await bean.toJSON(),
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("editTag", async (tag, callback) => {
            try {
                checkLogin(socket);

                let bean = await R.findOne("tag", " id = ? ", [tag.id]);
                if (bean == null) {
                    callback({
                        ok: false,
                        msg: "tagNotFound",
                        msgi18n: true,
                    });
                    return;
                }
                bean.name = tag.name;
                bean.color = tag.color;
                await R.store(bean);

                callback({
                    ok: true,
                    msg: "Saved.",
                    msgi18n: true,
                    tag: await bean.toJSON(),
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("deleteTag", async (tagID, callback) => {
            try {
                checkLogin(socket);

                await R.exec("DELETE FROM tag WHERE id = ? ", [tagID]);

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

        socket.on("addMonitorTag", async (tagID, monitorID, value, callback) => {
            try {
                checkLogin(socket);

                await R.exec("INSERT INTO monitor_tag (tag_id, monitor_id, value) VALUES (?, ?, ?)", [
                    tagID,
                    monitorID,
                    value,
                ]);

                await server.sendUpdateMonitorIntoList(socket, monitorID);

                callback({
                    ok: true,
                    msg: "successAdded",
                    msgi18n: true,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("editMonitorTag", async (tagID, monitorID, value, callback) => {
            try {
                checkLogin(socket);

                await R.exec("UPDATE monitor_tag SET value = ? WHERE tag_id = ? AND monitor_id = ?", [
                    value,
                    tagID,
                    monitorID,
                ]);

                await server.sendUpdateMonitorIntoList(socket, monitorID);

                callback({
                    ok: true,
                    msg: "successEdited",
                    msgi18n: true,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("deleteMonitorTag", async (tagID, monitorID, value, callback) => {
            try {
                checkLogin(socket);

                await R.exec("DELETE FROM monitor_tag WHERE tag_id = ? AND monitor_id = ? AND value = ?", [
                    tagID,
                    monitorID,
                    value,
                ]);

                await server.sendUpdateMonitorIntoList(socket, monitorID);

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

        socket.on("monitorImportantHeartbeatListCount", async (monitorID, callback) => {
            try {
                checkLogin(socket);

                let count;
                if (monitorID == null) {
                    const accessible = await Monitor.getAccessibleMonitorIdsSQL(socket.userID);
                    count = await R.count(
                        "heartbeat",
                        `important = 1 AND monitor_id IN (${accessible.sql})`,
                        accessible.params
                    );
                } else {
                    if (!(await Monitor.userCanAccess(socket.userID, monitorID))) {
                        throw new Error("You do not have access to this monitor.");
                    }
                    count = await R.count("heartbeat", "monitor_id = ? AND important = 1", [monitorID]);
                }

                callback({
                    ok: true,
                    count: count,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("monitorImportantHeartbeatListPaged", async (monitorID, offset, count, callback) => {
            try {
                checkLogin(socket);

                let list;
                if (monitorID == null) {
                    const accessible = await Monitor.getAccessibleMonitorIdsSQL(socket.userID);
                    list = await R.find(
                        "heartbeat",
                        `
                        important = 1
                        AND monitor_id IN (${accessible.sql})
                        ORDER BY time DESC
                        LIMIT ?
                        OFFSET ?
                    `,
                        [...accessible.params, count, offset]
                    );
                } else {
                    if (!(await Monitor.userCanAccess(socket.userID, monitorID))) {
                        throw new Error("You do not have access to this monitor.");
                    }
                    list = await R.find(
                        "heartbeat",
                        `
                        monitor_id = ?
                        AND important = 1
                        ORDER BY time DESC
                        LIMIT ?
                        OFFSET ?
                    `,
                        [monitorID, count, offset]
                    );
                }

                callback({
                    ok: true,
                    data: list,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("changePassword", async (password, callback) => {
            try {
                checkLogin(socket);

                if (!password.newPassword) {
                    throw new Error("Invalid new password");
                }

                if (passwordStrength(password.newPassword).value === "Too weak") {
                    throw new TranslatableError("passwordTooWeak");
                }

                let user = await doubleCheckPassword(socket, password.currentPassword);
                await user.resetPassword(password.newPassword);

                server.disconnectAllSocketClients(user.id, socket.id);

                callback({
                    ok: true,
                    token: User.createJWT(user, server.jwtSecret),
                    msg: "successAuthChangePassword",
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

        socket.on("getSettings", async (callback) => {
            try {
                checkLogin(socket);
                const data = await getSettings("general");

                if (!data.serverTimezone) {
                    data.serverTimezone = await server.getTimezone();
                }

                callback({
                    ok: true,
                    data: data,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("setSettings", async (data, currentPassword, callback) => {
            try {
                checkLogin(socket);

                // If currently is disabled auth, don't need to check
                // Disabled Auth + Want to Disable Auth => No Check
                // Disabled Auth + Want to Enable Auth => No Check
                // Enabled Auth + Want to Disable Auth => Check!!
                // Enabled Auth + Want to Enable Auth => No Check
                const currentDisabledAuth = await setting("disableAuth");
                if (!currentDisabledAuth && data.disableAuth) {
                    await doubleCheckPassword(socket, currentPassword);
                }

                // Log out all clients if enabling auth
                // GHSA-23q2-5gf8-gjpp
                if (currentDisabledAuth && !data.disableAuth) {
                    server.disconnectAllSocketClients(socket.userID, socket.id);
                }

                const previousChromeExecutable = await Settings.get("chromeExecutable");
                const previousNSCDStatus = await Settings.get("nscd");

                // White-label branding logo: if a fresh upload (base64 data URL), write it to
                // disk and store the path instead of the raw data in the settings table.
                if (data.customLogoUrl && data.customLogoUrl.startsWith("data:")) {
                    const header = "data:image/png;base64,";
                    if (!data.customLogoUrl.startsWith(header)) {
                        throw new Error("Only PNG logos are supported.");
                    }
                    const filename = "custom-logo.png";
                    await ImageDataURI.outputFile(data.customLogoUrl, Database.uploadDir + filename);
                    data.customLogoUrl = `/upload/${filename}?t=` + Date.now();
                }

                await setSettings("general", data);
                server.entryPage = data.entryPage;

                // Also need to apply timezone globally
                if (data.serverTimezone) {
                    await server.setTimezone(data.serverTimezone);
                }

                // If Chrome Executable is changed, need to reset the browser
                if (previousChromeExecutable !== data.chromeExecutable) {
                    log.info("settings", "Chrome executable is changed. Resetting Chrome...");
                    await resetChrome();
                }

                // Update nscd status
                if (previousNSCDStatus !== data.nscd) {
                    if (data.nscd) {
                        await server.startNSCDServices();
                    } else {
                        await server.stopNSCDServices();
                    }
                }

                callback({
                    ok: true,
                    msg: "Saved.",
                    msgi18n: true,
                });

                await sendInfo(socket);
                await server.sendMaintenanceList(socket);
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        // Add or Edit
        socket.on("addNotification", async (notification, notificationID, callback) => {
            try {
                checkLogin(socket);

                let notificationBean = await Notification.save(notification, notificationID, socket.userID);
                await sendNotificationList(socket);

                callback({
                    ok: true,
                    msg: "Saved.",
                    msgi18n: true,
                    id: notificationBean.id,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("deleteNotification", async (notificationID, callback) => {
            try {
                checkLogin(socket);

                await Notification.delete(notificationID, socket.userID);
                await sendNotificationList(socket);

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

        socket.on("testNotification", async (notification, callback) => {
            try {
                checkLogin(socket);

                let msg = await Notification.send(notification, notification.name + " Testing");

                callback({
                    ok: true,
                    msg,
                });
            } catch (e) {
                log.error("server", e);

                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("checkApprise", async (callback) => {
            try {
                checkLogin(socket);
                callback(await Notification.checkApprise());
            } catch (e) {
                callback(false);
            }
        });

        socket.on("getWebpushVapidPublicKey", async (callback) => {
            try {
                let publicVapidKey = await Settings.get("webpushPublicVapidKey");

                if (!publicVapidKey) {
                    log.debug("webpush", "Generating new VAPID keys");
                    const vapidKeys = webpush.generateVAPIDKeys();

                    await Settings.set("webpushPublicVapidKey", vapidKeys.publicKey);
                    await Settings.set("webpushPrivateVapidKey", vapidKeys.privateKey);

                    publicVapidKey = vapidKeys.publicKey;
                }

                callback({
                    ok: true,
                    msg: publicVapidKey,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("clearEvents", async (monitorID, callback) => {
            try {
                checkLogin(socket);

                log.info("manage", `Clear Events Monitor: ${monitorID} User ID: ${socket.userID}`);

                await R.exec("UPDATE heartbeat SET msg = ?, important = ? WHERE monitor_id = ? ", ["", "0", monitorID]);

                callback({
                    ok: true,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("clearHeartbeats", async (monitorID, callback) => {
            try {
                checkLogin(socket);

                log.info("manage", `Clear Heartbeats Monitor: ${monitorID} User ID: ${socket.userID}`);

                await UptimeCalculator.clearStatistics(monitorID);

                if (monitorID in server.monitorList) {
                    const monitor = server.monitorList[monitorID];
                    if (monitor.active) {
                        await restartMonitor(socket.userID, monitorID);
                    }
                }

                await sendHeartbeatList(socket, monitorID, true, true);

                callback({
                    ok: true,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        socket.on("clearStatistics", async (callback) => {
            try {
                checkLogin(socket);

                log.info("manage", `Clear Statistics User ID: ${socket.userID}`);

                await UptimeCalculator.clearAllStatistics();

                // Restart all monitors to reset the stats
                for (let monitorID in server.monitorList) {
                    const monitor = server.monitorList[monitorID];
                    if (monitor.active) {
                        await restartMonitor(socket.userID, monitorID);
                    }
                }

                callback({
                    ok: true,
                });
            } catch (e) {
                callback({
                    ok: false,
                    msg: e.message,
                });
            }
        });

        // Status Page Socket Handler for admin only
        statusPageSocketHandler(socket);
        cloudflaredSocketHandler(socket);
        databaseSocketHandler(socket);
        proxySocketHandler(socket);
        dockerSocketHandler(socket);
        maintenanceSocketHandler(socket);
        apiKeySocketHandler(socket);
        userSocketHandler(socket);
        logSocketHandler(socket);
        licenseSocketHandler(socket);
        remoteBrowserSocketHandler(socket);
        generalSocketHandler(socket, server);
        chartSocketHandler(socket);

        log.debug("server", "added all socket handlers");

        // ***************************
        // Better do anything after added all socket handlers here
        // ***************************

        log.debug("auth", "check auto login");
        if (await setting("disableAuth")) {
            log.info("auth", "Disabled Auth: auto login to admin");
            await afterLogin(socket, await R.findOne("user"));
            socket.emit("autoLogin");
        } else {
            socket.emit("loginRequired");
            log.debug("auth", "need auth");
        }
    });

    log.debug("server", "Init the server");

    server.httpServer.once("error", async (err) => {
        log.error("server", "Cannot listen: " + err.message);
        await shutdownFunction();
        process.exit(1);
    });

    await server.start();

    server.httpServer.listen(port, hostname, async () => {
        printServerUrls("server", port, hostname, config.isSSL);

        await startMonitors();

        // Put this here. Start background jobs after the db and server is ready to prevent clear up during db migration.
        await initBackgroundJobs();

        checkVersion.startInterval();
        license.startCheckInLoop();
    });

    // Start cloudflared at the end if configured
    await cloudflaredAutoStart(cloudflaredToken);
})();

/**
 * Update notifications for a given monitor
 * @param {number} monitorID ID of monitor to update
 * @param {number[]} notificationIDList List of new notification
 * providers to add
 * @returns {Promise<void>}
 */
async function updateMonitorNotification(monitorID, notificationIDList) {
    await R.exec("DELETE FROM monitor_notification WHERE monitor_id = ? ", [monitorID]);

    for (let notificationID in notificationIDList) {
        if (notificationIDList[notificationID]) {
            let relation = R.dispense("monitor_notification");
            relation.monitor_id = monitorID;
            relation.notification_id = notificationID;
            await R.store(relation);
        }
    }
}

/**
 * Check if a given user owns a specific monitor
 * @param {number} userID ID of user to check
 * @param {number} monitorID ID of monitor to check
 * @returns {Promise<void>}
 * @throws {Error} The specified user does not own the monitor
 */
async function checkOwner(userID, monitorID) {
    let row = await R.getRow("SELECT id FROM monitor WHERE id = ? AND user_id = ? ", [monitorID, userID]);

    if (!row) {
        throw new Error("You do not own this monitor.");
    }
}

/**
 * Function called after user login
 * This function is used to send the heartbeat list of a monitor.
 * @param {Socket} socket Socket.io instance
 * @param {object} user User object
 * @returns {Promise<void>}
 */
async function afterLogin(socket, user) {
    socket.userID = user.id;
    socket.userRole = user.role || "admin";
    socket.join(user.id);

    let monitorList = await server.sendMonitorList(socket);
    await Promise.allSettled([
        sendInfo(socket),
        server.sendMaintenanceList(socket),
        sendNotificationList(socket),
        sendProxyList(socket),
        sendDockerHostList(socket),
        sendAPIKeyList(socket),
        sendRemoteBrowserList(socket),
        sendMonitorTypeList(socket),
    ]);

    await StatusPage.sendStatusPageList(io, socket);

    const monitorPromises = [];
    for (let monitorID in monitorList) {
        monitorPromises.push(sendHeartbeatList(socket, monitorID));
        monitorPromises.push(Monitor.sendStats(io, monitorID, user.id));
    }

    await Promise.all(monitorPromises);

    // Set server timezone from client browser if not set
    // It should be run once only
    if (!(await Settings.get("initServerTimezone"))) {
        log.debug("server", "emit initServerTimezone");
        socket.emit("initServerTimezone");
    }
}

/**
 * Initialize the database
 * @param {boolean} testMode Should the connection be
 * started in test mode?
 * @returns {Promise<void>}
 */
async function initDatabase(testMode = false) {
    log.debug("server", "Connecting to the database");
    await Database.connect(testMode);
    log.info("server", "Connected to the database");

    // Patch the database
    await Database.patch(port, hostname);

    let jwtSecretBean = await R.findOne("setting", " `key` = ? ", ["jwtSecret"]);

    if (!jwtSecretBean) {
        log.info("server", "JWT secret is not found, generate one.");
        jwtSecretBean = await initJWTSecret();
        log.info("server", "Stored JWT secret into database");
    } else {
        log.debug("server", "Load JWT secret from database.");
    }

    // If there is no record in user table, it is a new ZMonitor instance, need to setup
    if ((await R.knex("user").count("id as count").first()).count === 0) {
        log.info("server", "No user, need setup");
        needSetup = true;
    }

    server.jwtSecret = jwtSecretBean.value;
}

/**
 * Start the specified monitor
 * @param {number} userID ID of user who owns monitor
 * @param {number} monitorID ID of monitor to start
 * @returns {Promise<void>}
 */
async function startMonitor(userID, monitorID) {
    await checkOwner(userID, monitorID);

    log.info("manage", `Resume Monitor: ${monitorID} User ID: ${userID}`);

    await R.exec("UPDATE monitor SET active = 1 WHERE id = ? AND user_id = ? ", [monitorID, userID]);

    let monitor = await R.findOne("monitor", " id = ? ", [monitorID]);

    if (monitor.id in server.monitorList) {
        await server.monitorList[monitor.id].stop();
    }

    server.monitorList[monitor.id] = monitor;
    await monitor.start(io);
}

/**
 * Restart a given monitor
 * @param {number} userID ID of user who owns monitor
 * @param {number} monitorID ID of monitor to start
 * @returns {Promise<void>}
 */
async function restartMonitor(userID, monitorID) {
    return await startMonitor(userID, monitorID);
}

/**
 * Pause a given monitor
 * @param {number} userID ID of user who owns monitor
 * @param {number} monitorID ID of monitor to start
 * @returns {Promise<void>}
 */
async function pauseMonitor(userID, monitorID) {
    await checkOwner(userID, monitorID);

    log.info("manage", `Pause Monitor: ${monitorID} User ID: ${userID}`);

    await R.exec("UPDATE monitor SET active = 0 WHERE id = ? AND user_id = ? ", [monitorID, userID]);

    if (monitorID in server.monitorList) {
        await server.monitorList[monitorID].stop();
        server.monitorList[monitorID].active = 0;
    }
}

/**
 * Resume active monitors
 * @returns {Promise<void>}
 */
async function startMonitors() {
    let list = await R.find("monitor", " active = 1 ");

    for (let monitor of list) {
        server.monitorList[monitor.id] = monitor;
    }

    for (let monitor of list) {
        try {
            await monitor.start(io);
        } catch (e) {
            log.error("monitor", e);
        }
        // Give some delays, so all monitors won't make request at the same moment when just start the server.
        await sleep(getRandomInt(300, 1000));
    }
}

/**
 * Shutdown the application
 * Stops all monitors and closes the database connection.
 * @param {string} signal The signal that triggered this function to be called.
 * @returns {Promise<void>}
 */
async function shutdownFunction(signal) {
    log.info("server", "Shutdown requested");
    log.info("server", "Called signal: " + signal);

    await server.stop();

    log.info("server", "Stopping all monitors");
    for (let id in server.monitorList) {
        let monitor = server.monitorList[id];
        await monitor.stop();
    }
    await sleep(2000);
    await Database.close();

    if (EmbeddedMariaDB.hasInstance()) {
        EmbeddedMariaDB.getInstance().stop();
    }

    stopBackgroundJobs();
    await cloudflaredStop();
    Settings.stopCacheCleaner();
}

/**
 * Final function called before application exits
 * @returns {void}
 */
function finalFunction() {
    log.info("server", "Graceful shutdown successful!");
}

gracefulShutdown(server.httpServer, {
    signals: "SIGINT SIGTERM",
    timeout: 30000, // timeout: 30 secs
    development: false, // not in dev mode
    forceExit: true, // triggers process.exit() at the end of shutdown process
    onShutdown: shutdownFunction, // shutdown function (async) - e.g. for cleanup DB, ...
    finally: finalFunction, // finally function (sync) - e.g. for logging
});

// Catch unexpected errors here
let unexpectedErrorHandler = (error, promise) => {
    console.trace(error);
    ZMonitorServer.errorLog(error, false);
    console.error("If you keep encountering errors, please report to https://github.com/vivekjaiswar/zmonitor/issues");
};
process.addListener("unhandledRejection", unexpectedErrorHandler);
process.addListener("uncaughtException", unexpectedErrorHandler);
