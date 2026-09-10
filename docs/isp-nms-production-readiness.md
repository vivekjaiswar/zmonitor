# ISP-NMS Production Readiness

Generated 2026-09-10. Status: early — one item has real evidence, everything else is either pre-existing-and-unverified or not yet built. Per the standing rule this document follows: **a row is PASS only if a test was actually executed and evidence exists. Everything else is BLOCKED, with a reason.** Nothing here is inflated.

Cross-references: `docs/isp-nms-prd.md` (requirements), `docs/isp-nms-architecture.md` (design), `docs/isp-nms-component-audit.md` (gap detail, §8-§12 for self-health/stale/flapping/search/backup).

| # | Feature | Requirement | Test | Expected Result | Status | Evidence |
|---|---|---|---|---|---|---|
| **A. SECURITY** |||||||
| A1 | Credential isolation | Read-only/employee accounts never receive monitor credentials | `test/backend-test/test-credential-isolation.js` (new) — constructs a Monitor with sensitive fields set, calls `toJSON()` with default/`false`/`true` | Sensitive fields absent unless `includeSensitiveData=true` | **PASS** | 4/4 assertions pass, executed this session. Node's `--test` runner, no live server needed. |
| A2 | Credentials not exposed through Socket.IO | `getMonitorList`/`getMonitor`/`sendMonitorList` now gate on `socket.userRole === "admin"` | No live-server integration test yet (would need two logged-in sockets, admin and employee) | Employee socket receives monitor JSON with no sensitive keys | **BLOCKED** (unit-level PASS, integration-level not run) | Code committed (`24a989c7`), logic traced by hand against every call site of `Monitor.toJSON` (3 total, confirmed via grep — no other caller exists), and proven at the unit level by A1's test. Not yet exercised against a running server with real login sessions in this session. |
| A3 | Credentials not exposed through REST | `api-router.js` badge/push endpoints don't return monitor credentials | Not tested | — | **BLOCKED** — not investigated this session. Known gap from the original audit: `api-router.js` has no RBAC checks at all (predates RBAC), separate from A1/A2's fix. |
| A4 | Authorization enforced (RBAC) | `getAccessibleMonitorIdsSQL`, employee fail-closed socket allowlist | No test exists (confirmed absent in the original audit, §7 of component audit) | — | **BLOCKED** — pre-existing gap, not touched this session. |
| A5 | Invalid authentication rejected | Login flow rejects bad credentials | Not tested this session | — | **BLOCKED** — not investigated. |
| A6 | Secrets absent from logs | `data/logs/app.log` never writes credential values | Not tested this session | — | **BLOCKED** — not investigated. Worth checking before this goes further; not done here. |
| A7 | Secrets absent from error messages | Errors don't leak credential values in `msg` fields | Not tested this session | — | **BLOCKED** — not investigated. |
| **B. MONITORING RELIABILITY** |||||||
| B1 | Timeout/retry/backoff | Per-monitor `beat()` loop in `monitor.js` | Not exercised this session | — | **BLOCKED** — design reviewed and documented as sound in the architecture doc (per-monitor `setTimeout`, hard abort backstop, bounded retries), but no test run confirms it live. Pre-existing, unmodified this session. |
| B2-B9 | Failure isolation, malformed response, scheduler resilience, etc. | — | Not tested | — | **BLOCKED** — pre-existing behavior, not modified or tested this session. |
| **C. STALE TELEMETRY** |||||||
| C1-C4 | Stale state exists, appears correctly, participates in incident logic | — | N/A | — | **BLOCKED — feature does not exist.** Confirmed via grep (component audit §9): no STALE state, no last-successful-poll vs. last-attempt distinction anywhere. Not built. |
| **D. FLAPPING** |||||||
| D1-D4 | Flap detection, state exposure, notification-storm prevention | — | N/A | — | **BLOCKED — feature does not exist.** Confirmed via grep (component audit §10): zero "flap" references in the codebase, two-state-only transition logic. Not built. |
| **E. RECOVERY** |||||||
| E1-E6 | Normal/delayed/root recovery, dependent-still-down, repeated events, maintenance recovery | — | Not tested this session | — | **BLOCKED** — pre-existing recovery logic exists (`monitor.js` beat loop) but has zero test coverage (component audit §7) and is unmodified this session. Correlation-dependent recovery (E's real target once correlation exists) cannot be tested — correlation doesn't exist yet. |
| **F. CORRELATION** |||||||
| F1-F8 | Root failure, downstream impact, one root incident, dedup, customer impact, incident update, recovery, maintenance suppression | — | N/A | — | **BLOCKED — feature does not exist.** No dependency graph, no correlation engine, no customer/service schema (component audit §0.1). Gated on the discovery call per the approved design doc. |
| **G. DATABASE / MIGRATION** |||||||
| G1 | Fresh installation | Knex `migrate.latest` on empty DB | Not run this session | — | **BLOCKED** — not exercised this session. Pre-existing, working migration system per the architecture audit (41 ordered Knex migrations). |
| G2 | Upgrade existing installation | Knex migration against a populated DB | Not run this session | — | **BLOCKED** — not exercised this session. No schema changes were made this session (the credential fix touches only application code, no migration). |
| G3 | Existing data preserved | — | N/A this session (no migration made) | — | **N/A** — no schema change occurred. |
| **H. BACKUP / RESTORE** |||||||
| H1-H4 | Backup created, integrity verified, restore succeeds, app starts against restored DB | — | No test/script exists (confirmed, component audit §12) | — | **BLOCKED — no verification mechanism exists at all.** JSON export/import exists and is reachable, but nothing automates or has ever verified a restore-into-fresh-DB round trip. This is a real, pre-existing gap, independent of ISP-NMS scope. |
| **I. SELF-HEALTH** |||||||
| I1-I8 | API/scheduler/DB/monitoring/notification/correlation/disk/memory health | — | N/A | — | **BLOCKED — feature does not exist.** Confirmed via grep (component audit §8): `/metrics` exists but covers monitored-device metrics only, nothing about ZMonitor's own process. No `/health` endpoint once running. Not built. |
| **J. NOC UX** |||||||
| J1-J6 | Dashboard, incident drill-down, topology, customer impact, global search, resource drill-down | — | N/A | — | **BLOCKED — none of these exist yet** except the existing generic dashboard and per-page monitor filtering (not global search — component audit §11). All gated on correlation/incident work (F) existing first. |

## Summary

- **1 row with real PASS evidence**: A1, credential isolation at the `toJSON()` level, tested this session.
- **Everything else is BLOCKED**, honestly, because either (a) the feature doesn't exist yet (C, D, F, I, most of J — all gated on the discovery call or later phases per the PRD roadmap), or (b) the feature exists but has never been tested, pre-existing or otherwise (B, E, G, H, most of A).
- **This is not a regression** — B/E/G's underlying logic is unmodified this session and was already undocumented-but-presumably-working production code before this audit started. This table exists to make that honestly visible, not to imply new breakage.
- **Two items worth prioritizing independent of the wedge**, both pre-existing and both real: H (backup/restore has never been verified) and A3/A6/A7 (REST-path credential exposure, secrets-in-logs, secrets-in-errors — none investigated yet, all plausible given A1/A2 found a real gap in the Socket.IO path).

**This system is not production-ready by the standard this document holds itself to** — most rows are BLOCKED, not PASS. That's the accurate status as of 2026-09-10, not a gap to paper over.
