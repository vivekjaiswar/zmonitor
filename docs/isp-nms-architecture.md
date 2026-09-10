# ISP-NMS Architecture (Current State + Extension Plan)

Generated 2026-09-10. Companion to `docs/isp-nms-component-audit.md` and `docs/designs/isp-nms-wedge.md`. Describes what exists today and where the wedge's new pieces attach — it is not a target-state redesign; per the approved design doc, this evolves the current stack rather than replacing it.

## Current stack (confirmed, ground truth)

- **Backend**: Node.js, Express ~4.22, Socket.IO ~4.8 (realtime transport for nearly the entire app — most mutating operations are socket events, not REST), Knex ~3.1 + a RedBean-style ORM (`redbean-node`) over SQLite (`@louislam/sqlite3`).
- **Frontend**: Vue 3 (Options API), Vue Router, no Vuex/Pinia — state lives in a shared mixin (`src/mixins/socket.js`) kept in sync by Socket.IO listeners.
- **Database**: SQLite (`db/kuma.db`), 41 ordered Knex migrations, a legacy raw-SQL patch system now retired in favor of Knex.
- **Scheduling**: two independent mechanisms — `server/jobs.js` (croner, for periodic maintenance jobs like data retention) and `Monitor.start()`/`beat()` in `server/model/monitor.js` (per-monitor recursive `setTimeout` loop, one per active monitor).
- **Deployment**: multi-stage Docker build (`docker/dockerfile`), one-command install scripts for Linux (Docker+Nginx+Certbot) and Windows (Docker only).
- **Licensing**: a separate microservice (`license-server/`, its own Express+SQLite app) issuing signed JWTs to the main app's embedded client (`server/license/client.js`) — fail-open by design, currently gates nothing but a UI banner.

This is a real, structured application — not a prototype. Per the audit (§1-2), most of the foundation is directly reusable.

## Request/data flow (as it exists today)

```
Browser (Vue)
   │  Socket.IO (mutating ops, live state sync)     HTTP (badges, push heartbeats, status pages)
   ▼                                                  ▼
server.js ── inline socket.on() handlers      server/routers/*.js (api-router, status-page-router)
   │
   ├─→ server/model/monitor.js — Monitor.start()/beat()
   │        │
   │        ├─→ server/monitor-types/*.js  (plugin dispatch by monitor.type)
   │        │        SNMP / TCP / DNS / DB-checks / HTTP / etc.
   │        │
   │        └─→ heartbeat written → important-event flag → notification dispatch
   │                                                            │
   │                                                            ▼
   │                                              server/notification-providers/*.js (~95 plugins)
   │
   ├─→ RBAC scoping — Monitor.getAccessibleMonitorIdsSQL(userID)
   │        (tag/monitor grants, admin bypass, employee fail-closed allowlist)
   │
   └─→ Knex/RedBean → SQLite (db/kuma.db)

license-server/ (separate process) ←── periodic check-in ── server/license/client.js
```

There is no message queue, no separate worker process, and no distributed collector — polling, dispatch, and notification all happen in the single Node.js process, isolated per-monitor by independent `setTimeout` loops (a failure in one monitor's check does not block another's — confirmed in the audit, this already satisfies the spec's "one device failure must never crash the entire polling system" requirement).

## What the wedge adds (per the approved design doc, gated on the discovery call)

The wedge is OLT/ONU depth + customer-impact correlation, read-only, single-vendor-to-start. Below is where each new piece attaches to the existing architecture — **none of this is authorized to build yet**; it's here so the extension points are documented before the discovery call, not invented after.

```
                              ┌─────────────────────────────┐
                              │   Existing Monitor/Heartbeat │
                              │   pipeline (unchanged)       │
                              └──────────────┬───────────────┘
                                              │ heartbeat status transition
                                              ▼
   NEW: Customer/Service model      NEW: Dependency graph (NODE/EDGE)
   customer ──→ service ──→ ONU ┐            │
                                 ├──→ maps onto┤
                                 │            ▼
                                 │   NEW: Correlation engine
                                 │   (root-cause walk on transition,
                                 │    dedupe into one incident)
                                 │            │
                                 └────────────┼──────────────┐
                                              ▼              ▼
                                 NEW: Incident model   Existing notification-
                                 (extends/replaces the  provider dispatch
                                  status-page-only       (reused as-is)
                                  Incident model —
                                  needs compatibility
                                  check first, see audit §3)
```

Key constraints from the design doc and this audit, carried forward as architectural ground rules for the wedge:

1. **NODE/EDGE, not per-type hardcoded correlation.** The spec's own Section 6 requirement and the design doc's ceiling agree: don't write a `if (deviceType === 'OLT')` correlation function. One generic graph walk, typed nodes.
2. **No customer/service schema to reuse — build the smallest backward-compatible extension**, per audit §0.1. This is new work, not a refactor.
3. **Fix the credential-exposure gap (audit §0.2) before this ships**, independent of wedge scope — an ISP customer's SNMP community strings and device passwords should not be readable by every authenticated read-only NOC account, and that gap gets worse (not better) the more roles/users are added on top of it.
4. **Read-only network boundary**: no OLT/ONU write paths (no provisioning, no config push) in this phase — matches the existing SNMP implementation, which is already GET/WALK-only with no write operations anywhere in `snmp.js`.
5. **SQLite stays** — no evidence of a bottleneck exists yet (per the design doc's own open question). If correlation-query load or metrics volume becomes measurably heavy, isolate high-volume tables so a future move (to Postgres/a time-series store) doesn't require a domain-model rewrite — but don't build that isolation preemptively without a measured reason.
6. **Reuse the existing notification-provider system as-is** for incident/correlation alerts — it already has exactly the "pluggable provider interface, no hardcoded vendor" shape the spec asks for.

## Explicit non-goals for this phase (deferred, not rejected)

Per the design doc's outer ceiling and the spec's own Section 31, these are extension points to leave room for, not things to build now: BGP/OSPF, RADIUS/AAA as infrastructure (the existing `radius` monitor type is a login/AAA *test*, not an AAA server), IPAM, NetFlow/IPFIX/sFlow, syslog correlation, config backup (Oxidized), multi-vendor OLT adapters beyond the first, multi-tenancy, distributed collectors, PostgreSQL/time-series migration, AI-assisted RCA.

## Open architectural questions (carried from the audit, not yet answered)

- Does the eventual `Incident` model reuse the existing `server/model/incident.js` table (currently status-page-only), or is that a naming collision that needs a fresh table? Needs a compatibility check against status-page usage before deciding.
- Where do encrypted-at-rest credentials live once the SNMP-credential-column fix (audit §2) happens — a dedicated `credentials` table shared across monitor types, or per-type columns with app-layer encryption? Not decided; smallest safe change wins, per the project's lean-code guidance.
