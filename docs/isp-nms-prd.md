# PRD: ZMonitor ISP-NMS

Generated 2026-09-10. Status: **DRAFT — pending founder review.**
Master reference — consolidates and cross-references:
- `docs/designs/isp-nms-wedge.md` (approved office-hours design doc — the evidence and scope decision behind this PRD)
- `docs/isp-nms-architecture.md` (current-state architecture + extension points)
- `docs/isp-nms-component-audit.md` (full Uptime Kuma component classification)

This document does not repeat those three in full — it's the product-requirements layer that sits above them: what ships, for whom, in what order, and what "done" means for each piece. Read the design doc first for *why*; this is *what*.

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

### 4.1 In scope for this phase (the "wedge")

1. **Credential-exposure fix** (§5.1) — not gated on the discovery call, proceeds independently.
2. **OLT/ONU depth monitoring** — read-only telemetry and status for one OLT vendor (vendor TBD by the discovery call), reusing the existing SNMP monitor-type architecture.
3. **Customer/service data model** — the schema that does not currently exist (`docs/isp-nms-component-audit.md` §0.1): Customer → Service → ONU → PON → OLT → POP.
4. **Dependency graph** — generic NODE/EDGE model, not per-device-type hardcoded logic.
5. **Correlation engine** — walk the dependency graph on a monitor status transition, produce one root incident instead of one alert per affected leaf.
6. **Incident model** — lifecycle (DETECTED → INVESTIGATING → ACKNOWLEDGED → ASSIGNED → MITIGATING → RESOLVED → CLOSED), reusing the existing notification-provider system for alerting.

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

## 6. Non-Functional Requirements

- **Migration safety:** every schema change is an additive Knex migration; no `DROP TABLE`/`DROP COLUMN` against existing production data; existing installs must upgrade without data loss (per the original spec's Section 33, and this project's own memory: no regressions, verify end-to-end before calling anything done).
- **Failure isolation:** one device's monitoring failure must not affect another's — already true of the existing per-monitor scheduler (confirmed in the architecture audit), must remain true for any new correlation processing added on top.
- **RBAC:** no new roles added until §5.1 ships (adding roles on top of the current credential-exposure gap makes the gap worse, not better).
- **Read-only network boundary:** enforced at the adapter level (§5.2) — no code path that can issue a write/provisioning command to a device in this phase.
- **Test coverage:** any new correlation logic must include tests for the underlying transition-event logic it depends on (`isImportantBeat`/`isImportantForNotification`), since that logic currently has zero coverage (audit §7) and becomes load-bearing once correlation depends on it.

## 7. Success Criteria

(From the approved design doc — repeated here as the PRD's own definition of done for this phase.)

- A named contact at Jeebr, Aerpace, or Microscan has seen the OLT/ONU + customer-impact correlation capability and stated, specifically, whether it changes their buying decision.
- The capability ships as new modules/tables in the existing app with no schema migration that breaks an existing install without a migration script, and no downtime during upgrade.

## 8. Roadmap (for reference — not a build authorization)

| Tier | Scope | Gate |
|---|---|---|
| **Now** | Credential-exposure fix (§5.1) | None — proceeds independently |
| **Wedge** (this PRD, §4.1) | OLT/ONU depth, customer/service model, dependency graph, correlation, incidents | Discovery call with a named contact |
| **Next** (deferred) | Additional OLT vendors, topology visualization improvements, traffic analytics | Wedge validated with a real customer |
| **Scale** (deferred) | PostgreSQL, dedicated time-series storage, distributed collectors, multi-tenancy | Measured evidence of a bottleneck, not before |
| **Advanced** (deferred) | AI-assisted RCA, automation, predictive monitoring | Not scheduled |

## 9. Open Questions

Carried from `docs/isp-nms-architecture.md` and `docs/isp-nms-component-audit.md`, unresolved as of this PRD:

1. Which OLT vendor does the discovery-call contact actually run? (Blocks §5.2's adapter interface.)
2. Does §5.6's Incident model reuse `server/model/incident.js` or need a fresh table?
3. Where do encrypted-at-rest credentials eventually live — a dedicated credentials table, or per-type columns with app-layer encryption? (Not blocking §5.1's fix, which only changes *who* can read existing columns, not how they're stored.)
4. Is Docker container monitoring used by any current deployment? (Affects the component audit's DEPRECATE/KEEP call, not this PRD's scope directly.)
5. Do any target accounts actually want public-facing status pages, or is that surface area safe to deprecate? (Still unresolved — see conversation history; not answered with account-specific evidence yet.)

## 10. Dependencies

- Builds on OLT/ONT site hierarchy Phase 1 (shipped) and existing SNMP monitoring (shipped) — see architecture doc for what these actually provide today (map-pin inheritance only, not a real domain model).
- Blocked on: the discovery call (§3) for everything in §4.1 except §5.1.
