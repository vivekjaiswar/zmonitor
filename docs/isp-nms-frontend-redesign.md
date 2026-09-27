# Frontend Redesign Plan: NOC Dashboard Execution

Generated 2026-09-27. Status: DRAFT — for `/plan-design-review`.

## Problem Statement

`DESIGN.md` (approved 2026-08-06 via `/design-consultation`) already defines the right direction: Industrial/Utilitarian, dark-first, IBM Plex Sans/Mono, sharp corners, status-color semantics. The core tokens are wired into `src/assets/vars.scss` (`$primary: #3b82c4`, `$dark-bg: #0d1117`, `$dark-header-bg: #161b22`) and the sidebar shell + map-first home exist (commits `a38e8c7a`, `eb263f33`).

But most actual screens were never rebuilt to match — they're still the pre-redesign Uptime Kuma layout wearing the new color tokens. Confirmed by reading the current code: `DashboardHome.vue` (417 lines) is a plain "Quick Stats" heading, 5 bare stat tiles (no icons, no trend deltas, no time-range control), and a basic borderless table (no search bar, no live-sync indicator, no filter, no per-row action menu). The user's reference image (a dashboard called "SYNAPSE") is not a new direction — it's a fully-executed example of the direction already approved, and the gap between it and the current `DashboardHome.vue` is the actual scope of this redesign.

**This plan does not touch color, type, spacing, or corner-radius tokens.** Those are settled in `DESIGN.md`. This plan is about actually building the screens to use them.

## Reference → ZMonitor Mapping

| SYNAPSE pattern | ZMonitor equivalent | Notes |
|---|---|---|
| Top command bar: logo, workspace switcher, breadcrumb, global search (⌘K), help/notifications/user menu | Sidebar already has the logo+workspace area (`Layout.vue`); no persistent top bar or global search exists today | New: a persistent top bar, or fold search into the existing sidebar header — a genuine design choice, see Open Question 1 |
| Left sidebar: sectioned nav (Main / Observability / Infrastructure / Recent), active-route highlight | Sidebar shell exists (`a38e8c7a`) but nav isn't sectioned into groups | Extend existing sidebar, don't rebuild it |
| Stat card row: icon, label, big number, trend delta vs. last period | `.stat-tile` in `DashboardHome.vue` — label + number only, no icon, no trend, no time-range control | Rework `.stat-tile` into a real `StatCard` component |
| Active-instances table: status pill, CPU value + inline sparkline, memory, uptime, per-row action menu, column sort | Bare table in `DashboardHome.vue`/`List.vue` — status via existing `Status.vue`, no sparkline, no per-row menu, no sort | Extend the existing table, reuse `Status.vue`/`HeartbeatBar.vue` for the sparkline instead of a new charting dependency |
| Live events side panel: severity badge, timestamp, message, expandable JSON payload, pause/filter/clear controls | `DashboardHome.vue`'s event table is inline, not a side panel; no JSON payload expansion (ZMonitor's heartbeat `msg` is plain text, not structured JSON) | Adapt as a panel showing the existing important-events feed; skip the JSON payload expand — nothing in ZMonitor's data model produces structured payloads today, and fabricating that structure would be UI theater over data that doesn't exist |
| Compute-usage / billing widget ($1,420 of $2,000) | No equivalent — this is SaaS billing chrome for a hosted product | **Explicitly out of scope.** ZMonitor is self-hosted; there is no per-tenant billing meter to show. Including this would be decoration with no real data behind it — exactly the kind of AI-slop pattern DESIGN.md's own principles reject. |
| Filter/search bar above the table | `List.vue`'s existing search input (`MonitorList.vue`'s `searchText`, per the component audit) | Reuse, restyle to match the row's new density |

## Scope — phased, one screen at a time

Per this project's own "one step at a time" practice (and to keep each phase reviewable/shippable independently):

1. **Phase A — Dashboard home** (`DashboardHome.vue`): the stat-card row and the events table. Highest-traffic screen, most visible gap vs. the reference.
2. **Phase B — Monitor List** (`List.vue`, `MonitorListItem.vue`): apply the same table density/sort/action-menu pattern established in Phase A.
3. **Phase C — Device Detail** (`Details.vue`): header + tabs, reusing Phase A's stat-card component for per-device metrics.
4. **Phase D — Settings & secondary pages**: lowest visual priority, cosmetic-only pass (spacing/corner-radius consistency), no new components.

This plan (and the mockups/review that follow) covers **Phase A only**. Phases B-D follow the same reviewed pattern once A is approved and built — not planned in pixel detail yet, since doing so before A is validated would be designing three more screens against an unproven pattern.

## New/Extended Components

- **`StatCard.vue`** (new) — icon + label + value + trend delta, replaces the bare `.stat-tile` markup. One component, reused across all 4 phases' stat rows.
- **Existing table markup in `DashboardHome.vue`** — extended in place with: a search/filter input (reuse `List.vue`'s existing pattern), a sort-enabled `<th>` set, a per-row action menu (reuse whatever menu pattern `MonitorListItem.vue` already has, if any — audit before building a new one).
- **`Status.vue`, `HeartbeatBar.vue`, `Datetime.vue`** — reused as-is. No reason to replace working, already-on-brand components.
- **Live-events panel** — restructured layout (side panel vs. inline table) using the same underlying data (`monitorImportantHeartbeatListPaged`) already powering the current table. Not a new data source.

## Explicit Non-Goals

- No new charting/sparkline dependency. `HeartbeatBar.vue` already renders a compact time-series view; reuse it rather than introducing a chart library for the CPU-trend sparkline.
- No billing/usage widget (see mapping table).
- No JSON-payload event detail (nothing in the data model produces structured payloads).
- No changes to `EditMonitor.vue`'s form logic or field set — visual chrome only, if touched at all, and not in Phase A.
- No changes to color/type/spacing tokens — `DESIGN.md` stands as approved.

## Security Note (per the founder's "safe secure" ask)

This is a presentation-layer redesign — it doesn't touch data flow. Two things worth stating explicitly so they don't get silently lost during implementation:
1. The credential-isolation fix shipped this session (`24a989c7`) means a redesigned table/detail view must keep rendering whatever `Monitor.toJSON()` actually returns for the logged-in role — **not** re-introduce a "show all fields" convenience view that bypasses the existing `includeSensitiveData` gating.
2. Any new per-row action menu (edit/pause/delete) must keep respecting the existing RBAC checks (`EMPLOYEE_ALLOWED_EVENTS`) — a redesigned UI showing an action a read-only "employee" role can't actually perform is a trust-eroding dead end, not a security bug per se, but worth catching in the mockup review.

## Open Questions

1. **RESOLVED, 2026-09-27:** Global search scoped to monitors only for Phase A (not full cross-entity search — that stays tracked as component audit §11's separate gap).
2. **RESOLVED, 2026-09-27, superseding this plan's original sidebar-based layout:** the sidebar is replaced entirely by a horizontal top nav bar (logo, nav links, search, avatar). This is a bigger structural change than either original mockup variant proposed — the founder's own visual review during `/plan-design-review` preferred it over both the "sidebar search" and "sidebar + top bar" options originally drafted. `Layout.vue`'s existing sidebar shell (commit `a38e8c7a`) is being replaced, not extended, for the Dashboard screen's chrome.

## Decisions Made During `/plan-design-review` (2026-09-27)

- **Layout: top nav bar, no sidebar** (see Open Question 2 above) — approved mockup: `dashboard-v2-topnav-graphs.html`.
- **Trend graphs added** (not in the original plan's scope): 2 sparkline panels (Overall Uptime %, Avg Response Time) as flat single-color SVG polylines — no gauges/donuts, no new charting dependency, consistent with `DESIGN.md`'s "no gauge/donut widgets" rule and this plan's original "no new charting dependency" non-goal. Reuses the same time-series data `HeartbeatBar.vue` already has access to; renders differently (line vs. bar), not a new data source.
- **Empty state (zero monitors):** compact single-line panel — `"No monitors configured. Add one to start tracking it."` + one primary button. Explicitly NOT a centered hero-style panel with secondary CTA (first draft, rejected: "too much/wrong copy or tone"). Graphs are omitted entirely (not shown empty/zeroed) when there's no data to trend — fabricating a flat line would misrepresent "no data" as "confirmed stable."
- **Spacing snapped to `DESIGN.md`'s approved scale** (2/4/8/16/24/32/48/64px) — mockup had drifted to ad-hoc 10/14/20px values during iteration; corrected before implementation.
- **Mobile/tablet nav: hamburger → slide-out drawer.** Standard convention, chosen over a bottom tab bar (less appropriate for a NOC tool used on tablets in a server room) and over deferring the decision (risk: shipping with broken/no mobile nav).
- **Accessibility baseline for Phase A:** keyboard focus rings themed from `--accent` (not browser default blue), 44px minimum touch targets on hamburger/search/action controls, `<nav>`/`<main>`/`<aside>` ARIA landmarks, `--text-dim`-on-`--surface` contrast to be verified against WCAG AA during implementation (not yet measured).

## NOT in Scope (considered, explicitly deferred)

- **Full cross-entity global search** (devices, IPs, tags, not just monitor names) — component audit §11's existing gap, not created or closed by this redesign. Monitors-only search is what ships.
- **JSON payload expansion on events** — nothing in ZMonitor's data model produces structured event payloads; building UI for data that doesn't exist would be theater, not a feature.
- **Billing/usage widget** — self-hosted product, no per-tenant cost meter exists.
- **Phases B (Monitor List), C (Device Detail), D (Settings)** — same reviewed pattern, not pixel-planned yet; each gets its own pass once Phase A is built and validated.

## What Already Exists (reuse, don't rebuild)

- `DESIGN.md` tokens, already wired into `src/assets/vars.scss` — canvas/surface/border/accent/status colors, IBM Plex Sans/Mono.
- `Status.vue`, `HeartbeatBar.vue`, `Datetime.vue` — reused as-is in the new table/graph rows.
- `List.vue`'s existing filter-input pattern — reused for the Dashboard's own filter bar.
- `monitorImportantHeartbeatListPaged` — existing data source powering both the old inline event table and the new events side panel; no new backend work required for Phase A's UI.

## TODOS.md Updates

Two items surfaced during review that are real but not Phase A blockers:

1. **What:** Verify `--text-dim` (#7d8590) on `--surface` (#161b22) meets WCAG AA contrast (4.5:1) for body text.
   **Why:** Pass 6 flagged this as unmeasured; DESIGN.md's dark-first approach needs this confirmed, not assumed.
   **Pros:** Closes a real accessibility gap before it ships broadly across Phases B-D (same token pair reused everywhere).
   **Cons:** If it fails, may require a lighter `--text-dim` value — a token change with wider ripple than just Phase A.
   **Context:** Surfaced in `/plan-design-review` Pass 6, 2026-09-27.
   **Depends on:** Nothing — can run anytime, ideally before Phase A ships.

2. **What:** Full cross-entity global search (devices, IPs, MAC, tags) — component audit §11's original gap, still open.
   **Why:** Phase A's search is monitors-only by design; the broader gap remains real and was explicitly not solved here.
   **Pros:** Matches the reference's actual search scope eventually.
   **Cons:** Meaningfully larger scope — new backend query surface, not just UI.
   **Context:** Named in component audit §11 (2026-09-13), reconfirmed as out of scope here (2026-09-27).
   **Depends on:** Nothing blocking; independent of Phase A.

Both proposed for **A) Add to TODOS.md** (not B: skip, not C: build now) — real but not Phase A blockers.

## The Assignment

Both original Open Questions are resolved. Phase A is ready to implement against the approved mockup (`dashboard-v2-topnav-graphs.html` / `dashboard-v2-empty-state.html`), with the accessibility/contrast check as a parallel-track TODO, not a blocker.

## Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|----------------|-------------|-----------|-------|
| Dashboard Home (populated) | `~/.gstack/projects/vivekjaiswar-zmonitor/designs/dashboard-home-redesign-20260927/dashboard-v2-topnav-graphs.html` | Top nav bar (no sidebar), 5 stat cards, 2 trend sparklines, table + events side panel | Spacing snapped to DESIGN.md scale post-approval |
| Dashboard Home (empty state) | `~/.gstack/projects/vivekjaiswar-zmonitor/designs/dashboard-home-redesign-20260927/dashboard-v2-empty-state.html` | Same shell, compact single-line empty panel, graphs omitted | Second draft — first (centered hero-style) was rejected for tone |

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific
finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~1 day / CC: ~1-2hrs)** — Layout — Replace `Layout.vue`'s sidebar shell with a horizontal top nav bar for the Dashboard route
  - Surfaced by: Open Question 2 resolution, approved mockup `dashboard-v2-topnav-graphs.html`
  - Files: `src/layouts/Layout.vue`, `src/router.js` (if route-level layout selection is needed)
  - Verify: Dashboard renders with top nav, no sidebar, at desktop width
- [ ] **T2 (P1, human: ~3hrs / CC: ~30min)** — Components — Build `StatCard.vue`, replace `.stat-tile` markup in `DashboardHome.vue`
  - Surfaced by: Reference mapping table, "New/Extended Components"
  - Files: `src/components/StatCard.vue` (new), `src/pages/DashboardHome.vue`
  - Verify: 5 stat cards render with correct status colors from `$root.stats`
- [ ] **T3 (P1, human: ~2hrs / CC: ~20min)** — Graphs — Add 2 sparkline trend panels (uptime %, avg response time) as inline SVG, sourced from existing heartbeat data
  - Surfaced by: This session's added scope ("dashboard should have some graphs")
  - Files: `src/pages/DashboardHome.vue` or a new small `TrendSparkline.vue`
  - Verify: Graphs render with real data; omitted (not zeroed) when no monitors exist
- [ ] **T4 (P1, human: ~2hrs / CC: ~20min)** — Empty state — Implement the compact empty-state panel for zero active monitors
  - Surfaced by: Pass 2, iterated twice, approved 2026-09-27
  - Files: `src/pages/DashboardHome.vue`
  - Verify: Fresh install / all-paused state shows the panel, not a blank table
- [ ] **T5 (P2, human: ~4hrs / CC: ~45min)** — Mobile nav — Hamburger + slide-out drawer for the new top nav below 900px
  - Surfaced by: Pass 6, Issue 6
  - Files: `src/layouts/Layout.vue`
  - Verify: Nav is reachable and usable at 375px viewport width
- [ ] **T6 (P2, human: ~2hrs / CC: ~20min)** — Accessibility — Theme focus rings from `--accent`, add ARIA landmarks, verify 44px touch targets
  - Surfaced by: Pass 6 accessibility baseline
  - Files: `src/layouts/Layout.vue`, `src/pages/DashboardHome.vue`, `src/assets/vars.scss` (focus-ring styles)
  - Verify: Tab through the page with keyboard only; screen reader announces landmarks
- [ ] **T7 (P3, human: ~30min / CC: ~10min)** — Polish — Theme browser surfaces (scrollbar, selection, focus ring) from the palette
  - Surfaced by: Pass 4 reflex check
  - Files: `src/assets/vars.scss` or a global stylesheet
  - Verify: Visual check — no default blue selection highlight or unthemed scrollbar

_No new tasks from Pass 1 (Information Architecture) or Pass 3 (User Journey) — both restated already-approved facts, no remedies needed._

## Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md exists (approved 2026-08-06);     |
  |                       | UI scope confirmed (Dashboard Home)         |
  | Step 0               | Initial: 6/10. Focus: all 7 dimensions      |
  | Pass 1  (Info Arch)  | 9/10 → 9/10 (no fix needed, restated facts) |
  | Pass 2  (States)     | 2/10 → 9/10 after empty-state decision      |
  | Pass 3  (Journey)    | N/A → documented directly (restated facts)  |
  | Pass 4  (AI Slop)    | 9/10 → 9/10 (1 minor reflex-check TODO, T7) |
  | Pass 5  (Design Sys) | 6/10 → 9/10 after spacing-scale fix         |
  | Pass 6  (Responsive) | 3/10 → 8/10 after mobile-nav decision       |
  | Pass 7  (Decisions)  | 5 resolved, 2 deferred (both non-blocking)  |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (4 items)                           |
  | What already exists  | written (4 items)                           |
  | TODOS.md updates     | 2 items proposed (both A: add to TODOS.md)  |
  | Approved Mockups     | 2 generated, 2 approved                     |
  | Decisions made       | 6 added to plan                             |
  | Decisions deferred   | 2 (contrast check, cross-entity search)     |
  | Overall design score | 6/10 → 8/10                                 |
  +====================================================================+
```

Overall score is the lowest of the 6 rated passes after fixes = Pass 4/Pass 6 territory, both now 8-9/10. Plan is design-complete enough to implement Phase A; run `/design-review` after implementation for visual QA against the approved mockup.

## Unresolved Decisions

- `--text-dim` on `--surface` contrast ratio — not yet measured against WCAG AA. Verify during implementation (T6), not blocking Phase A start.
- Full cross-entity global search — real gap, explicitly out of scope for Phase A, tracked in TODOS.md.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Outside Review | — | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | not run |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | score: 6/10 → 8/10, 6 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

**VERDICT:** Design review complete, 8/10 (not yet a clean 8+ on every pass — Pass 6 accessibility has an unverified contrast check). Eng review required before this ships.

**UNRESOLVED DECISIONS:**
- `--text-dim` on `--surface` contrast ratio unmeasured against WCAG AA (T6, not blocking)
- Full cross-entity global search remains out of scope, tracked as separate TODOS.md debt
