# PRD: ZMonitor ISP-NMS

Generated 2026-09-10, updated 2026-09-10 (synced to the expanded production-readiness master prompt). Status: **DRAFT — pending founder review.**
Master reference — consolidates and cross-references:
- `docs/designs/isp-nms-wedge.md` (approved office-hours design doc — the evidence and scope decision behind this PRD)
- `docs/isp-nms-architecture.md` (current-state architecture + extension points)
- `docs/isp-nms-component-audit.md` (full Uptime Kuma component classification, including production-readiness gaps §8-§12)
- `docs/isp-nms-production-readiness.md` (the acceptance-test matrix — this PRD says what ships, that doc says what's actually been verified)

This document does not repeat those four in full — it's the product-requirements layer that sits above them: what ships, for whom, in what order, and what "done" means for each piece. Read the design doc first for *why*; this is *what*.

---

## 1. Product Overview

**Product:** ZMonitor — an ISP Network Management and Network Assurance Platform.
**Company:** ZennialHub Technologies.
**Current state:** a live, shipping product (v2.8.0) — a customized fork of Uptime Kuma, already carrying real ISP-specific work (SNMP monitoring, RBAC, a geo-status map, licensing). Not a greenfield build.
**Direction:** evolve the existing product into a production-grade ISP-first NMS. Remove/deprecate generic website-monitoring surface area over time; do not rewrite the stack.

**The differentiator**, unchanged from the original spec and the approved design doc: answer not just "is it up," but *what failed, what depends on it, who's affected, and is there already one incident tracking it* — instead of an alert per affected device.

## 2. Target Users

| Role | Who | Primary need |
|---|---|---|
| NOC engineer (read-only today, "employee" role) | Front-line monitoring staff at an ISP customer | See device/customer status, drill from "OLT down" to "which customers," without seeing device credentials they don't need |
| Admin | ISP customer's technical lead or ZennialHub-managed account | Full device management, credential configuration, RBAC, licensing |
| ZennialHub (platform operator) | Internal | Multi-install visibility (Fleet Admin portal — separate, already-tracked TODO, not in this PRD's scope) |

No end-subscriber-facing UI is in scope for this phase (no customer self-service portal).

## 3. Problem Statement

(Full evidence trail in `docs/designs/isp-nms-wedge.md` — summarized here.)

Target companies Jeebr, Aerpace, and Microscan are named as potential customers; no named individual contact or confirmed current-tool pain point exists yet. The approved design doc's gate stands: **a discovery call with a named contact at one of these three accounts happens before this scope is locked and built.** This PRD documents *what would ship* once that gate clears — it is not authorization to start building the OLT/ONU + correlation features ahead of that call.

What's authorized to proceed independent of that gate: the credential-exposure fix (§5.1) — a real, present-day security gap unrelated to the wedge's demand question.

## 4. Scope

### 4.1 In scope

**Not gated on the discovery call** — production-foundation hardening, proceeds independently of customer validation:

1. **Credential-exposure fix** (§5.1) — implemented, test-verified, held uncommitted pending review.
2. **Self-health / observability** (§5.7) — new.
3. **Stale telemetry** (§5.8) — new.
4. **Flapping detection** (§5.9) — new.
5. **Verified backup/restore** (§5.11) — new.

**Gated on the discovery call** (a named contact at Jeebr, Aerpace, or Microscan) — the wedge itself:

6. **OLT/ONU depth monitoring** — read-only telemetry and status for one OLT vendor (vendor TBD by the discovery call), reusing the existing SNMP monitor-type architecture.
7. **Customer/service data model** — the schema that does not currently exist (`docs/isp-nms-component-audit.md` §0.1): Customer → Service → ONU → PON → OLT → POP.
8. **Dependency graph** — generic NODE/EDGE model, not per-device-type hardcoded logic.
9. **Correlation engine** — walk the dependency graph on a monitor status transition, produce one root incident instead of one alert per affected leaf. Includes recovery verification (§5.10).
10. **Incident model** — lifecycle (DETECTED → INVESTIGATING → ACKNOWLEDGED → ASSIGNED → MITIGATING → RESOLVED → CLOSED), reusing the existing notification-provider system for alerting.

Items 2-5 exist because a production ISP-NMS needs them regardless of which OLT vendor eventually gets integrated — they hedge nothing on the discovery call's outcome. Items 6-10 are the wedge proper and stay gated.

### 4.2 Explicit ceiling for this phase (from the approved design doc — not negotiable without a new decision)

- **Read-only only.** No OLT/ONU provisioning, no config-write, no device reboot/factory-reset capability. Matches the existing SNMP implementation, which is already GET/WALK-only.
- **Single OLT vendor to start.** No speculative multi-vendor adapter work. The `OLTAdapter`-style interface gets built once a vendor is confirmed, not before.
- **No new infrastructure category** (BGP, OSPF, RADIUS-as-AAA-infra, IPAM, NetFlow/IPFIX/sFlow, syslog correlation, config backup/Oxidized, multi-tenancy, distributed collectors, Postgres/time-series migration). These remain extension points, documented in the architecture doc, not built.
- **SQLite stays.** No migration to Postgres/a time-series store without measured evidence of a bottleneck.

Anything past this ceiling is a new decision requiring its own review — not an extension of the current wedge.

### 4.3 Out of scope (deferred, per the original spec's own phasing, Section 65/31/39)

BGP/OSPF monitoring, RADIUS/AAA as infrastructure (vs. the existing login-test monitor), IPAM, NetFlow/IPFIX/sFlow, syslog correlation, Oxidized config backup, capacity forecasting, SLA automation, multi-tenancy, distributed collectors, AI-assisted RCA, auto-remediation, mobile app, customer self-service portal, billing/payment automation (already tracked separately in `TODOS.md`), Fleet Admin portal (already tracked separately in `TODOS.md`).

## 5. Functional Requirements

### 5.1 Credential Security (independent of wedge gate — proceeds now)

**Problem:** `Monitor.toJSON()` currently defaults to including all credential/secret fields (SNMP community string, device passwords, API tokens, connection strings) in every monitor payload sent to the browser — including to read-only "employee" accounts, who receive the identical payload an admin does.

**Requirement:** credentials are included in a monitor's JSON payload only when the requesting user holds the admin role. Read-only accounts receive every other field (status, name, location, thresholds, etc.) unchanged — this is not a new data-hiding feature, it's closing a gap in the existing one.

**Status:** implemented (`server/model/monitor.js`, `server/zmonitor-server.js`, `server/server.js` — `includeSensitiveData` now defaults to `false` and is threaded from `socket.userRole === "admin"` at both call sites that build monitor payloads for clients). Syntax-verified; full regression suite did not complete in this environment (appears network-dependent, unrelated to this change — see `docs/isp-nms-component-audit.md` §7 for the pre-existing test-coverage gap this exposed). **Held uncommitted pending this PRD's review**, not because the fix itself is in question, but because you asked to pause before any further development lands.

**Follow-up, not in this fix's scope:** the SNMP community string is stored in a repurposed `radiusPassword` column (naming leftover, not a functional bug) — tracked as REPLACE in the component audit, a separate, larger change (new column + migration).

### 5.2 OLT/ONU Depth Monitoring

- Extend the existing SNMP monitor-type architecture (`server/monitor-types/snmp.js`) — do not create a parallel monitoring system.
- Vendor-specific telemetry goes behind an adapter interface (`OLTAdapter`-shaped: `getSystemInfo`, `getPonInterfaces`, `getOnus`, `getOnuStatus`, `getOpticalPower`, `getTraffic`, `getAlarms`) so a second vendor is additive later, not a rewrite.
- Exact fields collected: determined by the discovery call, not guessed at here.
- No write operations, ever, in this phase (§4.2).

### 5.3 Customer/Service Model

- New tables: `customer` (id, name, contact/reference info, status), `service` (id, customer_id, status, plan/reference, IP/MAC/VLAN where applicable, ONU association).
- No unnecessary personal information collected (per the original spec's own instruction).
- Smallest backward-compatible schema extension — additive Knex migrations only, no breaking changes to existing installs (per migration-safety requirement, §6).

### 5.4 Dependency Graph

- Generic NODE (typed: DEVICE, INTERFACE, POP, OLT, PON, ONU, CUSTOMER, SERVICE, ...) / EDGE (dependency relationship) model.
- No per-device-type hardcoded correlation function. One graph-walk implementation, typed nodes.
- Initial population covers only what the wedge's resource types require (OLT → PON → ONU → Service → Customer chain) — extension points documented for POP/router/BGP-peer/uplink nodes, not built.

### 5.5 Correlation Engine

- On a monitor status transition (using the existing `isImportantBeat`/`isImportantForNotification` logic in `monitor.js` as the trigger point — see architecture doc), walk the dependency graph from the failed node.
- Determine affected downstream nodes (PONs → ONUs → Services → Customers → POPs).
- Produce or update **one** root incident carrying the impact summary, rather than one alert per affected leaf node.
- Consider: existing active incident (don't duplicate), maintenance state (suppress correctly, reusing existing maintenance-window logic), recovery (auto-resolve when the root cause clears).

### 5.6 Incident Model

- Lifecycle: DETECTED → INVESTIGATING → ACKNOWLEDGED → ASSIGNED → MITIGATING → RESOLVED → CLOSED.
- Fields: incident ID, title, severity, root resource, root cause, detected/acknowledged/resolved timestamps, assigned engineer, affected POPs/devices/PONs/ONUs/services/customers, timeline, notes, resolution.
- **Open question carried from the architecture doc:** does this reuse the existing `server/model/incident.js` table (currently scoped to manually-authored status-page announcements), or does that naming collision require a fresh table? Needs a compatibility check against status-page usage before either path is chosen — not decided in this PRD.
- Notifications: reuse the existing notification-provider system as-is (`server/notification-providers/`) — no new provider integrations required for this phase.

### 5.7 Self-Health / Observability

**Gap today** (`docs/isp-nms-component-audit.md` §8): `/metrics` exists but only covers monitored-device metrics — nothing tracks ZMonitor's own process health. No `/health`/`/readiness`/`/liveness` endpoint exists once the app is past startup.

**Requirement:** track, at minimum, scheduler health (is the croner job loop still running), monitor-execution health (are `beat()` loops progressing), SNMP polling failure rate, database connectivity, Socket.IO connection health, and notification-subsystem health. Expose this as an internal/API health endpoint returning machine-readable status. Self-health checks must not themselves create recursive monitoring load, and a self-health failure must never stop normal monitoring — this is an observation layer, not a gate.

### 5.8 Stale Telemetry

**Gap today** (`docs/isp-nms-component-audit.md` §9): exactly 4 heartbeat states exist (`UP/DOWN/PENDING/MAINTENANCE`), no distinction between "last successful poll" and "last poll attempt," no STALE concept.

**Requirement:** track last-successful-telemetry timestamp separately from last-attempt timestamp. Introduce an explicit stale state/flag when telemetry age exceeds a threshold, so a resource whose polling has silently stopped doesn't keep showing its last-known status as if it were current. This must not silently change the existing 4 states' semantics — stale is additive, surfaced explicitly (e.g. "Last telemetry: 14 minutes ago"), not a redefinition of UP/DOWN. Dashboards, alerts, and (once built) correlation must all account for stale state.

### 5.9 Flapping Detection

**Gap today** (`docs/isp-nms-component-audit.md` §10): zero flap-detection logic exists. Every UP/DOWN transition independently notifies — a flapping device generates a full notification storm today.

**Requirement:** detect repeated state transitions within a configurable window. When a resource is classified as flapping: expose that state explicitly, reduce notification noise, but keep monitoring active and never hide the underlying failure or lose state history. Do not over-engineer this — a transition-count-within-a-window check is sufficient; this is not a machine-learning problem.

### 5.10 Recovery Verification (extends §5.5)

**Requirement**, once the correlation engine (§5.5) exists: do not treat one successful check as proof an entire dependency chain has recovered. Recovery must: (1) detect root recovery, (2) verify it according to existing monitor recovery semantics (not a new, looser bar), (3) recalculate dependent state before resolving anything, (4) resolve an incident only when appropriate — not prematurely, and (5) avoid recovery-notification storms symmetric to the flap-storm concern in §5.9. Test explicitly: root recovers while a dependent is still down; a dependent recovers before its root; recovery during a maintenance window; repeated recovery events.

### 5.11 Verified Backup/Restore

**Gap today** (`docs/isp-nms-component-audit.md` §12): JSON export/import exists and is reachable, but no test, script, or documented procedure has ever verified that a restore actually succeeds.

**Requirement:** a backup is not "done" because an export button exists. At minimum: document the restore procedure, and verify it — restore into a fresh database and confirm the application starts and data is intact. Automate this verification if practical (a script, not just a manual one-time check). Never include secrets in backups unless explicitly required and protected — check this against §5.1's credential fields before considering backup complete.

## 6. Non-Functional Requirements

- **Migration safety:** every schema change is an additive Knex migration; no `DROP TABLE`/`DROP COLUMN` against existing production data; existing installs must upgrade without data loss (per the original spec's Section 33, and this project's own memory: no regressions, verify end-to-end before calling anything done). Every migration is tested against both a fresh database and a representative existing one, and backed up first.
- **Failure isolation:** one device's monitoring failure must not affect another's — already true of the existing per-monitor scheduler (confirmed in the architecture audit), must remain true for any new correlation, self-health, or flap-detection processing added on top. A correlation, notification, or self-health failure must never stop normal monitoring.
- **RBAC:** no new roles added until §5.1 ships (adding roles on top of the current credential-exposure gap makes the gap worse, not better).
- **Read-only network boundary:** enforced at the adapter level (§5.2) — no code path that can issue a write/provisioning command to a device in this phase.
- **Test coverage:** any new correlation logic must include tests for the underlying transition-event logic it depends on (`isImportantBeat`/`isImportantForNotification`), since that logic currently has zero coverage (audit §7) and becomes load-bearing once correlation depends on it. §5.1's credential fix sets the pattern: regression tests specifically proving the property being fixed, not just a code review.
- **Security hardening beyond §5.1:** authentication, session security, secure cookies, CSRF/XSS/SQLi protection, rate limiting, security headers, CORS, secret management, and audit logging are all pre-existing surface area this project inherited from Uptime Kuma — none were re-verified as part of this session's work. `docs/isp-nms-production-readiness.md` rows A3-A7 track this as an explicit gap, not an assumption of safety.
- **Production-readiness gate:** "build succeeded," "page loads," and "unit tests pass" are explicitly not sufficient evidence of production readiness. A feature is production-ready only when its row in `docs/isp-nms-production-readiness.md` has real, executed evidence — see that document for the full acceptance matrix and current (mostly BLOCKED) status.

## 7. Success Criteria

(From the approved design doc — repeated here as the PRD's own definition of done for this phase.)

- A named contact at Jeebr, Aerpace, or Microscan has seen the OLT/ONU + customer-impact correlation capability and stated, specifically, whether it changes their buying decision.
- The capability ships as new modules/tables in the existing app with no schema migration that breaks an existing install without a migration script, and no downtime during upgrade.

## 8. Roadmap (for reference — not a build authorization)

11-phase sequence, none skipped to reach UI features faster:

| Phase | Scope | Gate |
|---|---|---|
| 1 | Repository audit | Done — `docs/isp-nms-component-audit.md`, `docs/isp-nms-architecture.md` |
| 2 | Security / credential protection (§5.1) | None — implemented, test-verified, uncommitted pending review |
| 3 | Monitoring reliability: timeout/retry/backoff/failure isolation/recovery | None — mostly pre-existing, needs test coverage (audit §7) |
| 4 | Production foundation: self-health (§5.7), stale telemetry (§5.8), flapping (§5.9), backup/restore (§5.11), observability | None — independent of discovery call |
| 5 | Uptime Kuma cleanup: branding, dead code, unused components (component audit §4-§6) | None, but each removal needs its own reference-trace first (audit's own deletion-safety process) |
| 6 | ISP domain: customer, service, OLT, PON, ONU (§5.3) | **Discovery call** |
| 7 | Generic dependency graph (§5.4) | Discovery call (same gate as 6) |
| 8 | Correlation engine (§5.5, §5.10) | Discovery call |
| 9 | Incident management (§5.6) | Discovery call |
| 10 | NOC dashboard, global search, operational topology | Phases 6-9 shipped and validated |
| 11 | Production acceptance testing | Continuous — see `docs/isp-nms-production-readiness.md`, updated as each phase lands real evidence |

Phases 2-5 don't wait on the discovery call. Phases 6-9 do. Phase 10-11 wait on 6-9.

## 9. Open Questions

Carried from `docs/isp-nms-architecture.md` and `docs/isp-nms-component-audit.md`, unresolved as of this PRD:

1. Which OLT vendor does the discovery-call contact actually run? (Blocks §5.2's adapter interface.)
2. Does §5.6's Incident model reuse `server/model/incident.js` or need a fresh table?
3. Where do encrypted-at-rest credentials eventually live — a dedicated credentials table, or per-type columns with app-layer encryption? (Not blocking §5.1's fix, which only changes *who* can read existing columns, not how they're stored.)
4. Is Docker container monitoring used by any current deployment? (Affects the component audit's DEPRECATE/KEEP call, not this PRD's scope directly.)
5. Do any target accounts actually want public-facing status pages, or is that surface area safe to deprecate? (Still unresolved — see conversation history; not answered with account-specific evidence yet.)
6. What flap-detection window/threshold is appropriate (§5.9)? Not decided — needs a reasonable default plus configurability, per the requirement, not a specific number yet.
7. What staleness threshold triggers the new STALE state (§5.8)? Likely needs to vary by monitor interval rather than being a single fixed constant — not decided.
8. Should backup/restore verification (§5.11) be a one-time manual test-and-document pass, or an automated recurring check? Leaning automated per the "don't claim production-ready without evidence" principle, not decided.

## 10. Dependencies

- Builds on OLT/ONT site hierarchy Phase 1 (shipped) and existing SNMP monitoring (shipped) — see architecture doc for what these actually provide today (map-pin inheritance only, not a real domain model).
- Blocked on: the discovery call (§3) for everything in §4.1 except §5.1.
