# Design System — ZMonitor

## Product Context
- **What this is:** Self-hosted ISP network monitoring platform (full-ownership rebrand/fork of Uptime Kuma).
- **Who it's for:** ISP network operations teams monitoring routers, POPs, links, and servers they run themselves.
- **Space/industry:** Network Management Systems (NMS) / infrastructure monitoring — peers: Grafana, Datadog, Zabbix, LibreNMS, PRTG.
- **Project type:** Web app (dashboard-heavy, real-time).

## Memorable Thing
"Serious, mission-critical infrastructure tool" — command-center feel, not a friendly hobby dashboard. Every design decision below serves this.

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian — function-first, data-dense, muted palette, sharp precision.
- **Decoration level:** Minimal. No drop shadows, no gauge/donut widgets, no stock imagery.
- **Mood:** Precision tool, not friendly app. Dark-first. Density over whitespace.
- **Reference research:** Grafana (play.grafana.org), Datadog (host-map/hex-heatmap), Zabbix (protocol-level density), PRTG (negative reference — dated/hobbyist), Uptime Kuma (baseline being replaced — rounded pills, bright badges, friendly headers).

## Typography
- **Display/Hero:** IBM Plex Sans, 600 weight — kept from existing rebrand, already on-brand.
- **Body/UI:** IBM Plex Sans, 400/500 weight.
- **Data/Telemetry:** IBM Plex Mono, 400/500 weight, tabular figures — reserved specifically for latency, throughput, IPs, timestamps, uptime %. Not used anywhere else. This discipline (mono ONLY for numeric telemetry) is the typographic differentiator — none of the researched competitors do it consistently.
- **Code:** IBM Plex Mono (unchanged).
- **Loading:** Self-hosted via existing `Plex Sans`/`Plex Mono` webfont setup in `src/assets/vars.scss` (already loaded, no new dependency).

## Color
- **Approach:** Balanced — one accent, semantic status colors carry the real meaning.
- **Canvas:** `#0d1117` (kept from existing dark mode — already correct).
- **Surface:** `#161b22` (kept).
- **Border:** `#1d2634` (kept).
- **Accent:** `#3b82c4` — desaturated technical blue, down from the current candy-blue `#146ed2`.
- **Semantic status (flat fills, not rounded pill badges):**
  - Up: `#3fb950`
  - Degraded/warning: `#d29922`
  - Down/danger: `#da3633`
- **Dark mode:** primary mode, not a toggle-only afterthought. Light mode (settings/marketing chrome) desaturates the same tokens rather than reusing Bootstrap defaults.

## Spacing
- **Base unit:** 4px.
- **Density:** Compact — an ops team scanning many monitors needs density, not air.
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Grid-disciplined, with one deliberate structural break (see Risks).
- **Toolbars:** Single dense row (search + filters + range), not stacked forms.
- **Border radius:** Sharp — `sm: 2px`, `md: 4px`. No 10px+ rounded cards, no fully-rounded pill buttons (the single biggest visual tell of the Uptime Kuma fork).

## Motion
- **Approach:** Minimal-functional. Only transitions that aid comprehension (status change, expand/collapse). No flourish — flashy motion undercuts "command-center" seriousness.

## Structural Risks (approved)
1. **Map-first home screen.** The Network Map becomes the default landing view (`/`), not a plain monitor list — ISPs think in physical links/POPs, not generic dashboards. Monitor list remains one click away.
2. **Severity-first density.** Failing/degraded monitors get outsized visual weight (individual cards); healthy monitors collapse into a single compact count strip. Deviates from Grafana/Datadog's uniform-density convention deliberately.
3. **Sharp corners everywhere**, replacing Uptime Kuma's fully-rounded pill buttons/cards.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-06 | Initial design system created | Created via `/design-consultation`, grounded in NMS competitor research (Grafana/Datadog/Zabbix/PRTG/Uptime Kuma). User approved direction + all 3 structural risks after HTML preview review. |
