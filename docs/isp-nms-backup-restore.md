# ZMonitor Backup & Restore

Generated 2026-09-11. Companion to `docs/isp-nms-production-readiness.md` (rows G, H) and `docs/isp-nms-prd.md` §5.11. This document exists because it didn't before — `docs/isp-nms-component-audit.md` §12 confirmed no backup/restore procedure was documented anywhere, and no automated verification existed.

## Two separate mechanisms — don't conflate them

ZMonitor has two independent backup paths that cover different things. Neither is a full disaster-recovery solution on its own.

### 1. Application-level JSON export/import (Settings → Backup)

**What it covers:** monitors and notifications, scoped to the logged-in user (`WHERE user_id = ?` — confirmed in `server/server.js`'s `uploadBackup` handler). Tags travel embedded inside each monitor's own JSON (`Monitor.toJSON()`'s `tags` field), not as a separate top-level list.

**What it does NOT cover:** users/accounts, RBAC role assignments and tag/monitor access grants, application settings, licensing state, maintenance windows, audit history, heartbeat/uptime history. A restore from this JSON file recreates monitor *definitions* and notification *configs* — it does not reconstruct the rest of the application state.

**Credential handling — known limitation, not new:** an admin's export includes full plaintext credentials (SNMP community strings, device passwords, API tokens — the same fields `docs/isp-nms-component-audit.md` §0.2 flagged, now correctly withheld from read-only accounts per the credential-isolation fix, but still present in an admin's own export since that's what lets a restore recreate working monitors). A downloaded backup JSON file is therefore sensitive and should be handled like a credentials file, not a casual export — store and transmit it accordingly.

**Restore modes** (`src/components/settings/Backup.vue`):
- **Keep both** — adds imported monitors/notifications alongside existing ones (duplicates possible).
- **Skip existing** — matches by name; skips anything already present.
- **Overwrite** — deletes the current user's existing monitors and notifications first, then imports. Destructive — only use when you actually want to replace, not merge.

**Restore procedure:**
1. Log in as the account whose data you're restoring (import is scoped to the logged-in user — an admin restoring on behalf of someone else needs to be logged in as that user, not just be an admin).
2. Settings → Backup → Import Backup.
3. Choose a restore mode (above). **Overwrite is destructive — confirm you mean it before selecting it.**
4. Select the `.json` backup file and confirm.
5. **Verify**: check the imported monitor count and spot-check a few monitors' configuration (host, credentials, thresholds) against what you expected. The import handler logs a summary line (`log.info("backup", ...)` — imported/skipped counts) to the application log — check `Settings → Logs` if the UI count looks off.

**Compatibility:** the import handler explicitly accepts both ZMonitor's own export format and genuine upstream Uptime Kuma exports (per the code comment at `server/server.js:843-845`) — useful for customers migrating in from plain Uptime Kuma.

### 2. Raw database file backup (disaster recovery)

**What it covers:** everything — the full SQLite database (`db/kuma.db` in production, or the configured `DATA_DIR`), including users, RBAC grants, settings, licensing state, full heartbeat/uptime history. This is the actual disaster-recovery path; the JSON export above is not a substitute for it.

**Procedure (manual, not yet automated by this project):**
1. Stop the ZMonitor process (or accept a brief write-consistency risk if backing up while running — SQLite handles concurrent reads reasonably but a stop-first backup is safer).
2. Copy the SQLite file (and its `-wal`/`-shm` companion files if present) to backup storage.
3. To restore: stop ZMonitor, replace the database file with the backup copy, restart, confirm the application starts and monitors/users appear as expected.

**Separately, the license server has its own working backup mechanism** — `license-server/` runs a daily cron job backing up `license.db` (confirmed live and running in this environment — 35+ consecutive daily entries in its log before that log was cleaned up as part of this session's housekeeping). This is scoped to the license server only, not the main application database.

## What's been verified this session, and what hasn't

| Item | Status | Evidence |
|---|---|---|
| Fresh-install migration succeeds against an isolated SQLite database | **PASS** | `test/backend-test/test-migration.js`'s "SQLite migrations run successfully from fresh database" test — pre-existing in the codebase, not written this session, but not previously confirmed executed in this session either. Run this session: passed, ~1.4s, against a throwaway file (`data/test-migration.db`), cleaned up automatically. Does not touch `db/kuma.db`. |
| Fresh-install migration against MariaDB/MySQL | **Not run this session** | Same test file has container-based MariaDB/MySQL variants (via `testcontainers`) — not exercised, would need Docker container support in the execution environment, not attempted. |
| Migration against a representative *existing/populated* database (upgrade path, not fresh install) | **BLOCKED** | No test exists for this. The fresh-install test proves schema creation works; it doesn't prove upgrading a database that already has real monitors/heartbeats/users in it works cleanly. |
| JSON export/import round-trip (the actual `uploadBackup` restore logic) | **BLOCKED** | Not extracted into an independently-testable function — it's an inline Socket.IO handler in `server.js`, same shape as the `beat()` function Phase 3 deliberately didn't touch. Testing it properly needs either a refactor (risk on a data-integrity-sensitive path, not attempted without deeper review) or a fuller integration-test harness (a real Express+Socket.IO server against an isolated DB, a test client, a logged-in session) — larger scope than this pass, tracked as the next increment. |
| Raw SQLite file backup/restore procedure | **Documented, not automated** | The procedure above is accurate to how the app actually stores its database (confirmed via `server/database.js`'s `dataDir`/`sqlitePath` handling), but no script performs or verifies it automatically. Matches the PRD's own framing: "document... and verify... Automate if practical" — documentation is done, verification/automation is not. |

## Recommended next increment (not done in this pass)

An integration test that: starts an isolated instance (temp `DATA_DIR`, fresh migrated DB, no real network/scheduler side effects), creates a monitor via the normal `addMonitor` flow, exports it, wipes the monitor, imports the export back, and asserts the restored monitor matches the original. This is the real "verify a restore succeeds" test the requirement asks for — scoped out of this pass because it needs the same kind of test harness the `beat()`/`uploadBackup` integration testing would need, which is a bigger, separate piece of work from what's been built today.
