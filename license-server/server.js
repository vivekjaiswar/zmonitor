const express = require("express");
const sqlite3 = require("@louislam/sqlite3").verbose();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const PORT = process.env.LICENSE_SERVER_PORT || 4001;
const DB_PATH = process.env.LICENSE_SERVER_DB || path.join(__dirname, "license.db");
const PRIVATE_KEY = fs.readFileSync(
    process.env.LICENSE_SERVER_PRIVATE_KEY || path.join(__dirname, "keys/private.pem"),
    "utf8"
);
// bcrypt hash of the single ZennialHub admin password. No default - refuses to
// start without it (CM-Eng-1: standalone service, own lightweight single-admin
// auth, not Fleet Admin - that doesn't exist).
const ADMIN_PASSWORD_HASH = process.env.LICENSE_SERVER_ADMIN_PASSWORD_HASH;
if (!ADMIN_PASSWORD_HASH) {
    console.error("LICENSE_SERVER_ADMIN_PASSWORD_HASH is required. Generate one with:");
    console.error('  node -e "console.log(require(\'bcryptjs\').hashSync(process.argv[1], 10))" "your-password"');
    process.exit(1);
}

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // short-lived, frequent refresh (CM-Eng-8/6A) - closes the replay-after-cancel window

const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS installs (
        install_id TEXT PRIMARY KEY,
        paid_through_date TEXT,
        created_at TEXT NOT NULL,
        last_checkin_at TEXT NOT NULL
    )`);
    db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
const dbRun = (sql, params = []) =>
    new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));

async function getKillSwitch() {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'killSwitch'");
    return row?.value === "true";
}

const app = express();
app.use(express.json());

// Client check-in - no auth on installId itself (not a secret); the signed
// response is what the client actually trusts.
app.post("/check-in", async (req, res, next) => {
    try {
        const { installId } = req.body;
        if (!installId || typeof installId !== "string") {
            return res.status(400).json({ error: "installId required" });
        }

        const now = new Date().toISOString();
        await dbRun(
            `INSERT INTO installs (install_id, created_at, last_checkin_at) VALUES (?, ?, ?)
             ON CONFLICT(install_id) DO UPDATE SET last_checkin_at = excluded.last_checkin_at`,
            [installId, now, now]
        );
        const install = await dbGet("SELECT paid_through_date FROM installs WHERE install_id = ?", [installId]);
        const killSwitchActive = await getKillSwitch();

        const token = jwt.sign(
            {
                installId,
                paidThroughDate: install.paid_through_date || null,
                killSwitchActive,
                serverTime: now,
            },
            PRIVATE_KEY,
            { algorithm: "RS256", expiresIn: TOKEN_TTL_SECONDS }
        );

        res.json({ token });
    } catch (err) {
        next(err);
    }
});

function requireAdmin(req, res, next) {
    const password = req.headers["x-admin-password"];
    if (!password || !bcrypt.compareSync(String(password), ADMIN_PASSWORD_HASH)) {
        return res.status(401).json({ error: "unauthorized" });
    }
    next();
}

// Fleet health view (8A). ponytail: JSON, not an HTML dashboard - nobody's
// asked to look at a rendered page yet, and a curl/browser JSON view already
// answers "who's checked in, who hasn't" for a solo-founder operation. Add a
// UI when someone actually wants to look at this daily instead of on-incident.
app.get("/admin/installs", requireAdmin, async (req, res, next) => {
    try {
        const installs = await dbAll("SELECT install_id, paid_through_date, last_checkin_at FROM installs ORDER BY last_checkin_at DESC");
        res.json({ installs, killSwitchActive: await getKillSwitch() });
    } catch (err) {
        next(err);
    }
});

app.post("/admin/installs/:installId/paid-through", requireAdmin, async (req, res, next) => {
    try {
        const { date } = req.body; // ISO date string, or null to clear
        const result = await dbRun("UPDATE installs SET paid_through_date = ? WHERE install_id = ?", [date || null, req.params.installId]);
        if (result.changes === 0) return res.status(404).json({ error: "install not found" });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

app.post("/admin/kill-switch", requireAdmin, async (req, res, next) => {
    try {
        const active = !!req.body.active;
        await dbRun(
            "INSERT INTO settings (key, value) VALUES ('killSwitch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [active ? "true" : "false"]
        );
        res.json({ killSwitchActive: active });
    } catch (err) {
        next(err);
    }
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "internal error" });
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`license-server listening on :${PORT}`));
}

module.exports = { app, db };
