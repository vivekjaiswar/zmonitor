# ISP-NMS Component Audit

Generated 2026-09-10. Companion to `docs/isp-nms-architecture.md` and `docs/designs/isp-nms-wedge.md`.

**Scope of this document:** classify every major Uptime Kuma-derived component so a future removal/refactor pass has a map instead of a guess. This is read-only investigation — **nothing in this document has been deleted or changed.** Classifications:

- **KEEP** — required as-is, no ISP-NMS conflict
- **KEEP_AND_REFACTOR** — required, but needs hardening/changes for the ISP-NMS direction
- **REPLACE** — current implementation doesn't fit, needs a different approach
- **DEPRECATE** — off-thesis, but too interconnected to remove yet; stop building on it, plan removal later
- **REMOVE** — off-thesis and low-risk to delete once traced
- **UNKNOWN_REQUIRES_INVESTIGATION** — dual-use or unclear, needs a product call before touching

---

## 0. Two findings that gate everything below

These aren't components — they're facts the rest of this audit, and the approved design doc, depend on.

### 0.1 Customer/subscriber mapping does not exist (blocks the wedge's core differentiator)

The approved design doc (`docs/designs/isp-nms-wedge.md`) assumes "OLT/ONT hierarchy Phase 1" is a foundation to build customer-impact correlation on. It is not, in the way that matters:

- "OLT/ONT site hierarchy Phase 1" (commit `2e0396a0`) added **zero new tables/models**. It reuses the existing Monitor Group (`parent` column on `monitor`, `server/monitor-types/group.js`) as a stand-in for "OLT," and any child monitor as a stand-in for "ONT" — the only real code change is `src/pages/NetworkMap.vue` walking the `parent` chain to inherit lat/lng for map pins.
- There is no ONU/ONT-to-customer/subscriber model anywhere. A full-codebase grep for `customer|subscriber` returns zero hits outside license-server *billing* terminology (the paying customer of ZennialHub, not a network subscriber) and one commit-message anecdote.
- No vendor OLT integration exists at all — the commit message for Phase 1 explicitly named "Phase 2 (verified SNMP polling against a real Huawei OLT)" and "Phase 3 (traffic-flow diagram)" as unbuilt follow-ups. Neither has landed.
- No topology/dependency-graph feature exists anywhere in the codebase (zero grep hits for "topology").

**This means:** customer-impact correlation — the product's stated differentiator — has no data model to walk yet. It isn't a refactor of existing correlation logic; it's new: a customer/service model, an ONU-to-customer link, and a dependency graph, built from nothing. The design doc's Open Questions already flagged this as unverified; this audit confirms the schema gap is real. **Do not scope the OLT/ONU wedge assuming this exists.**

### 0.2 Monitor credentials — including the SNMP community string — leak to every authenticated user, including read-only accounts

`server/model/monitor.js:117` — `toJSON(preloadData = {}, includeSensitiveData = true)` defaults to **including** sensitive fields. `server/zmonitor-server.js:277` (`getMonitorJSONList`, used by `getMonitorList`/`getMonitor`/the full-list push at login) calls `toJSON(preloadData)` with no second argument, so every call defaults to `includeSensitiveData = true`.

Both `getMonitorList` and `getMonitor` are in `EMPLOYEE_ALLOWED_EVENTS` (`server.js:169`) — meaning a read-only "employee" role, scoped to specific tags, receives the **full plaintext credential set** for every monitor it can see: `basic_auth_pass`, `oauth_client_secret`, `bearer_token`, `radiusPassword` (this is also where the **SNMP v1/v2c community string lives** — `snmp.js:72` reads `monitor.radiusPassword` directly), `radiusSecret`, `mqttPassword`, `tlsKey`, `rabbitmqPassword`, `pushToken`, `databaseConnectionString`, and more. The one place credentials are correctly excluded is the internal payload built for notification providers (`monitor.js:1621`) — nowhere client-facing.

This directly violates the spec's own Section 19/49 requirement ("Never return secrets to the browser... credential access should be backend-only") and is a real, exploitable gap today — independent of anything ISP-NMS-related. **This should be fixed regardless of wedge scope**, and definitely before any RBAC role expansion (NOC_ENGINEER, SUPPORT_ENGINEER, etc.) is built on top of the current two-role system, since more granular roles will only mean more people receiving plaintext device credentials by default.

Separately: the HTTP `api-router.js` (badges, push endpoint) has **no RBAC checks at all** — it predates the RBAC system and was never wired into `getAccessibleMonitorIdsSQL`. Lower urgency (it doesn't return credentials), but worth knowing before extending that router.

---

## 1. Core architecture — KEEP / KEEP_AND_REFACTOR

| Component | Files | What it does | Classification | Risk | Recommended action |
|---|---|---|---|---|---|
| Express + Socket.IO server | `server/server.js`, `server/zmonitor-server.js` | HTTP server, ~80+ inline socket handlers (auth, monitor CRUD, settings), monitor-type registry | **KEEP** | — | No change needed for the wedge. The inline-handler pattern in `server.js` (not split into `socket-handlers/`) is a readability debt, not a blocker — don't refactor it as part of this wedge. |
| Monitor execution framework | `server/model/monitor.js` (`Monitor.start()`/`beat()`), `server/monitor-types/monitor-type.js` (base class) | Per-monitor scheduler loop, timeout/retry/backoff, polymorphic dispatch to monitor-type `.check()` | **KEEP** | — | This is exactly the "async workers, timeout, retry, failure isolation" foundation the spec asks for (Section 10, 16-19) — already built correctly (per-monitor `setTimeout` recursion, hard abort backstop, bounded retries). Extend, don't replace. |
| Knex migration system | `db/knex_migrations/` (41 files), `server/database.js` | Versioned, ordered schema migrations | **KEEP** | — | Use this for every new table (customer, service, dependency graph). Do not hand-write SQL patches — that system (`db/old_migrations/`) is already deprecated in favor of knex. |
| Vue Router + Options-API state (`src/mixins/socket.js`) | `src/router.js`, `src/mixins/socket.js` | Client routing, Socket.IO-synced reactive state, no Vuex/Pinia | **KEEP** | — | No Pinia/Vuex migration needed for this wedge's scope (a few new pages/components fit the existing mixin pattern). Revisit only if state complexity genuinely outgrows it — not yet. |
| Docker build + install scripts | `docker/dockerfile`, `install-zmonitor.sh`, `install-zmonitor.ps1` | Multi-stage build, one-command install with optional Nginx/Certbot | **KEEP** | — | No changes needed for the wedge. |
| Background job scheduler (croner) | `server/jobs.js`, `server/jobs/` | Cron-style jobs: data retention, SQLite vacuum | **KEEP** | — | New periodic work (e.g. correlation re-evaluation, if needed) can register here. |

## 2. ISP-relevant features already shipped — KEEP_AND_REFACTOR

| Component | Files | What it does | Classification | Risk | Recommended action |
|---|---|---|---|---|---|
| SNMP monitor type | `server/monitor-types/snmp.js`, `server/util-snmp-discovery.js`, `src/components/settings/SnmpDiscovery.vue` | SNMPv1/2c/3(noAuth only) OID poll + IF-MIB interface/bandwidth bulk-walk, subnet discovery | **KEEP_AND_REFACTOR** | Low (additive) | Standard MIB-II only today — no vendor OID plugin architecture exists (confirmed: zero vendor-name hits in SNMP code). This is fine — it's exactly the "don't implement 5 vendors speculatively" posture the spec wants. When the discovery call confirms a target vendor, build the `OLTAdapter`-style interface then, as a new addition, not a rewrite of `snmp.js`. |
| SNMP credential storage | `monitor.radiusPassword` column | v1/v2c community string stored in a repurposed RADIUS field | **REPLACE** | Medium | This is a naming leftover, not a working design — a `TODO: Rename monitor.radiusPassword to monitor.password` comment already exists in `EditMonitor.vue`. Needs a proper `snmp_community` column (or a generic encrypted-credential column reused across types) via migration. Bundle this with the §0.2 credential-exposure fix — same root cause area, one pass. |
| OLT/ONT site hierarchy (map inheritance) | `src/pages/NetworkMap.vue` | Monitor Group reused as "OLT," child monitors inherit lat/lng | **KEEP_AND_REFACTOR** | Low | Works as a map-display convenience. Do not treat it as a real OLT/PON/ONU domain model (see §0.1) — it's UI sugar on top of the generic Group construct, nothing more. |
| Geo-status map | `src/pages/NetworkMap.vue`, `db/knex_migrations/2026-08-05-0000-add-monitor-lat-lng.js` | Leaflet map, colorblind-safe status pins, severity side-pane | **KEEP** | — | Solid, already shipped, no ISP-NMS conflict. Natural place to eventually overlay incident/impact state once correlation exists. |
| RBAC (server-side) | `db/knex_migrations/2026-07-31-0000-add-rbac.js`, `monitor.js:getAccessibleMonitorIdsSQL`, `server.js:EMPLOYEE_ALLOWED_EVENTS` | Two roles (admin/employee), tag- and monitor-scoped read access, fail-closed socket event allowlist | **KEEP_AND_REFACTOR** | Medium | The fail-closed allowlist pattern is genuinely good and worth keeping as the model for future roles. But: only two roles exist today vs. the spec's NOC_MANAGER/NETWORK_ENGINEER/etc., and — critically — §0.2 means expanding roles right now would just hand more people plaintext credentials. Fix §0.2 before adding roles. |
| Licensing (client + server) | `server/license/client.js`, `license-server/` | Fail-open JWT check-in, VALID/GRACE_PERIOD/SOFT_LOCKED states | **KEEP** | — | Sound design (fail-open protects customers from license-server outages). Currently informational-only (a banner) — no code path disables anything. That's a product decision already made deliberately per the licensing-related TODOs on file; not a gap to fix as part of this wedge. |
| Notification-provider architecture | `server/notification.js`, `server/notification-providers/notification-provider.js` (base), `monitor_notification` join table | Per-monitor many-to-many notification config, ~95 pluggable providers | **KEEP** | — | Reuse this directly for incident/correlation notifications later — it's already the "don't hardcode providers, use an interface" pattern the spec asks for. No severity-based routing exists yet (see §4), but that's additive, not a replacement. |
| Maintenance windows | `server/model/maintenance.js`, `server/socket-handlers/maintenance-socket-handler.js` | Manual/cron/recurring windows, forces `status=MAINTENANCE`, suppresses entry/exit notifications only | **KEEP** | — | Already does the right thing per spec Section 15 (telemetry keeps recording, notifications suppressed on entry, a real down-while-in-maintenance still notifies). No changes needed for the wedge. |

## 3. Production gaps — build new, nothing to migrate away from

These aren't Uptime Kuma legacy to remove — they're gaps the spec asks for that simply don't exist yet. Listed here so the audit is complete, not because there's a classification decision to make.

| Gap | Current state | Recommended action |
|---|---|---|
| Alert severity | Only 4 states exist: `UP/DOWN/PENDING/MAINTENANCE` (`heartbeat.status`), no severity field anywhere in the app layer | New, additive — a severity concept can layer on top of the existing heartbeat/important-event model rather than replacing it. |
| Incident/correlation engine | `server/model/incident.js` exists but is a **manually-authored status-page announcement** (title/content, tied to public status pages) — no auto-generation from monitor events, no correlation logic at all | New — this is the core of the wedge (§0.1's dependency graph + correlation). Nothing to reuse from the existing `Incident` model except possibly its name/table if repurposed carefully (would need a compatibility check against status-page usage first). |
| Audit logging | Does not exist. The rotating `data/logs/app.log` is free-text operational debug logging, not a structured per-user action trail | New — small, additive table + write-on-mutating-action pattern. Low risk, no migration-away concern. |
| Customer/service model | Does not exist (§0.1) | New — smallest backward-compatible schema extension, per the design doc's gate (after the discovery call). |
| Dependency graph | Does not exist | New — generic NODE/EDGE model as the spec requests (Section 6), not per-type hardcoded correlation. |

## 4. Off-thesis generic/website-monitoring surface — DEPRECATE / REMOVE candidates

**None of these should be touched yet.** Per the spec's own deletion-safety process (Section 40), every one of these needs full reference-tracing (backend, frontend, DB, Socket.IO, tests) before any removal — this audit only establishes *classification*, not a green light.

| Component | Files | ISP-NMS relevance | Classification | Risk | Notes |
|---|---|---|---|---|---|
| Status pages | `server/routers/status-page-router.js`, `server/model/status_page.js`, `server/socket-handlers/status-page-socket-handler.js`, `src/pages/StatusPage.vue`/`ManageStatusPage.vue`/`AddStatusPage.vue` | None — public-facing SaaS-style status pages are the core of Kuma's original generic-uptime use case | **DEPRECATE** | High | Largest single off-thesis surface area — many interconnected files (backend router, model, socket handler, 3 frontend pages, RSS feed, manifest.json). Don't remove until product confirms ZennialHub customers don't use/need this (some MSPs do value public status pages as a customer-facing trust signal — worth asking, not assuming). |
| Badges | `badge-maker` dep, `api-router.js` badge routes, `status-page-router.js` badge route, `BadgeLinkGeneratorDialog.vue` | None — README shields.io-style badges | **REMOVE** (once traced) | Low-Medium | Small, self-contained, no other feature depends on badge generation. Good first candidate once someone actually traces the two router files and confirms no external customer relies on a badge URL already. |
| Steam / gamedig (game server monitoring) | inline in `monitor.js` (~line 782), `server/monitor-types/gamedig.js`, `gameList` picker in `EditMonitor.vue` | None | **REMOVE** (once traced) | Low | Self-contained monitor types, no ISP infra touches them. |
| Docker container monitoring | inline in `monitor.js` (~line 832), `server/docker.js`, `server/model/docker_host.js`, `server/socket-handlers/docker-socket-handler.js`, `Docker.vue`/`DockerHostDialog.vue` | **UNKNOWN_REQUIRES_INVESTIGATION** — could be repurposed for monitoring ZMonitor's own container infra, or a customer's | **UNKNOWN_REQUIRES_INVESTIGATION** | Medium | Ask before classifying further: is this used today by any ZennialHub deployment to watch its own Docker host? If no, it's a REMOVE candidate; if yes, KEEP. |
| Keyword / JSON-query / real-browser website checks | inline in `monitor.js` (~lines 685-731), `server/monitor-types/real-browser-monitor-type.js` | None — "is my website's text still there," headless-browser page checks | **DEPRECATE** | Medium | `real-browser` pulls in Playwright/Chromium as a dependency (`resetChrome` in `server.js`) — removing it would also shrink the Docker image meaningfully. Worth a deliberate pass, not urgent. |
| Push monitor type (passive HTTP-push heartbeat) | inline in `monitor.js` (multiple locations) | **UNKNOWN_REQUIRES_INVESTIGATION** — generic primitive, not website-specific, could plausibly be reused for agent-based telemetry from a remote collector later (Section 30's future distributed-collector model) | **UNKNOWN_REQUIRES_INVESTIGATION** | Low | Cheap to leave as-is; don't invest in it either. Revisit if/when distributed collectors become real. |
| Certificate-expiry watchdog | folded into `http`/TLS flow, `monitor.js` lines 81-306, 633-638 | **UNKNOWN_REQUIRES_INVESTIGATION** — irrelevant for public-website certs, but ISPs do run internal services with certs (RADIUS-over-TLS, admin portals) worth expiry-watching | **UNKNOWN_REQUIRES_INVESTIGATION** | Low | Leave as-is; low cost to keep, ambiguous value to remove. |

## 5. Dual-use protocol monitor types — no action, correctly ambiguous

`dns.js`, `grpc.js`, `mqtt.js`, `rabbitmq.js`, `websocket-upgrade.js`, plus the DB-connection monitor types (`postgres`, `mysql`, `mssql`, `mongodb`, `oracledb`, `redis`). All **UNKNOWN_REQUIRES_INVESTIGATION**, but low-priority — these are generic infra-monitoring building blocks (not website-specific), plausibly useful for monitoring an ISP's own backend services (a RADIUS server's Postgres DB, an MQTT broker feeding CPE telemetry, etc.) as much as for anything else. No recommended action — don't spend time classifying further until they're actually in someone's way.

## 6. Branding cleanup — low-risk, mostly cosmetic

| Item | Location | Risk | Recommended action |
|---|---|---|---|
| OS process name | `server/server.js:52` — `process.title = "uptime-kuma"` | **REMOVE**, trivial | One-line change to `"zmonitor"`. Zero functional impact, visible in `ps`/`top` today. |
| Notification provider default values | `src/components/notifications/TechulusPush.vue` (`pushTitle`/`pushChannel` defaults) | **REMOVE**, trivial | Cosmetic default-value fix, no migration needed. |
| "Uptime Kuma" in locale files | 41 of 77 files in `src/lang/` | **DEPRECATE** | Not worth a dedicated pass — will naturally get touched if/when locale strings are edited for ISP terminology. No urgency. |
| `check-translations.test.js` pulling live from `louislam/uptime-kuma` GitHub | `test/backend-test/check-translations.test.js:23`, wired into `npm run test-backend` | **UNKNOWN_REQUIRES_INVESTIGATION** | This is a coupling risk, not dead code — it actively runs in CI. If ZMonitor's `en.json` diverges from upstream (which ISP terminology work will cause), this test will start failing or comparing against irrelevant keys. Needs a decision (decouple vs. keep syncing) before, not during, any locale-string cleanup. |
| `kuma.db` filename | `server/database.js:25,46,139`, dev-data dirs | **DEPRECATE** | Real migration risk (existing installs reference this path) — not a cosmetic rename. Leave alone; revisit only with a tested migration plan, per spec Section 33's migration-safety rule. |
| Orphaned unused asset | `public/apple-touch-icon-precomposed.png` (Jun 4 timestamp, not referenced anywhere) | **REMOVE**, trivial | Confirmed unreferenced via grep. Zero-risk deletion whenever someone's touching `public/`. |
| Donation/sponsor references | — | **N/A** | None found. Already clean, nothing to do. |
| `THIRD_PARTY.md` | Does not exist | **New, not a removal** | Required per spec Sections 4 and 38. Should be created alongside any dependency-cleanup pass — needs an inventory of retained npm deps (LICENSE + purpose), not just the ISP-relevant ones. |

## 7. Testing gaps

No removal/keep classification applies here — this is coverage, not code to delete.

- Zero test coverage for: RBAC/role scoping (`getAccessibleMonitorIdsSQL`, the employee fail-closed guard), `isImportantBeat`/`isImportantForNotification` transition logic, maintenance-window suppression logic.
- This matters directly for the wedge: correlation-engine tests (spec Section 36 — "OLT down → PON/ONU/customer impact → one root incident") will need to build on the transition-event logic in `monitor.js`, which currently has no test coverage at all. Any correlation work should add tests for the underlying transition logic it depends on, not just the new correlation code.

## 8. Self-health / observability gaps

No removal/keep classification — this is a production-readiness gap, not code to reclassify.

- **Exists**: `/metrics` (Prometheus, auth-gated) — but `server/prometheus.js` exposes only *monitored-device* metrics (cert expiry, uptime ratio, response time, status). Nothing about ZMonitor's own process.
- **Does not exist**: no `/health`/`/readiness`/`/liveness` endpoint once the app is running (only a migration-phase-only `/migrate-status`). No first-class tracking of scheduler health, monitor-execution health, SNMP failure rate, DB connectivity, Socket.IO connection health, or notification-subsystem health. No process CPU/memory/disk tracking anywhere (confirmed via grep — none of the relevant Node APIs or packages are used/present).
- The croner-based job scheduler (`server/jobs.js`) has no error capture or last-run/health status recorded — if `clear-old-data` or `incremental-vacuum` silently starts failing, nothing surfaces it.

## 9. Stale telemetry gap

- Exactly 4 heartbeat states exist (`UP/DOWN/PENDING/MAINTENANCE`, `server/model/heartbeat.js`). No 5th "STALE" state, and no distinction anywhere between "last successful poll" and "last poll attempt" as separate tracked values.
- Practical implication: a monitor whose polling has silently stopped (scheduler stuck, process issue) will keep showing its last-known status indefinitely, with nothing in the data model to flag that the status itself may be stale. Confirmed via grep — zero hits for "stale" outside unrelated license-check-in code.

## 10. Flapping detection gap

- Confirmed via grep: zero "flap" references anywhere in the codebase.
- Transition logic (`isImportantBeat`/`isImportantForNotification` in `monitor.js`) is purely two-state (previous beat vs. current beat) — no oscillation window, no counter, no debounce. Every UP→DOWN and DOWN→UP independently triggers a notification. A flapping device today generates a full notification storm, with no flap-aware suppression or distinct flap state.

## 11. Global search gap

- What exists is **per-page filtering**, not global search: `MonitorList.vue`'s `searchText` input client-side filters the already-loaded monitor list by name/hostname/URL/tag. It has no cross-entity scope and no separate results view.
- No dedicated search component, no backend search route or Socket.IO search event exist anywhere (confirmed via grep and `find`).

## 12. Backup/restore verification gap

- JSON export/import (`Backup.vue`, `uploadBackup` in `server.js`) exists and is reachable, but **no automated test, script, or documented procedure verifies a restore actually succeeds** — no round-trip test, no restore-into-fresh-DB-and-verify cycle. `docs/`'s only backup references are about *monitored device* config backup (Oxidized, an out-of-scope extension point), not ZMonitor's own application/DB backup.
- Conclusion: backup/restore is entirely manual and unverified today. This is a real production-readiness gap independent of ISP-NMS scope — it's true of the product as it ships right now.

## Summary counts

- KEEP / KEEP_AND_REFACTOR: 12 components — the real foundation, all reusable for the wedge.
- DEPRECATE / REMOVE (traced-but-not-yet-removed): 8 components — status pages, badges, gaming monitors, docker monitoring (pending investigation), website-content checks, branding strings.
- UNKNOWN_REQUIRES_INVESTIGATION: 9 components — mostly dual-use protocol monitor types, correctly left unclassified pending product input.
- New (nothing to migrate away from): 4 — customer/service model, dependency graph, correlation engine, audit logging.
- **Production-readiness gaps (§8-§12), none built yet**: self-health/observability, stale telemetry, flapping detection, global search, verified backup/restore. All five are real gaps in the product as it ships today — none are specific to the ISP-NMS wedge, and none are gated by the discovery call.
- **Two original blocking findings (§0)**: no customer/subscriber schema exists yet (gates the wedge itself), and monitor credentials including the SNMP community string leak to every authenticated user including read-only roles (independent security issue — fix in progress, see `docs/isp-nms-prd.md` §5.1).
