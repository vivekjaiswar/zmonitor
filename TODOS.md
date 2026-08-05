# TODOS

## P3 — Payment automation for the license server (Razorpay or WHMCS integration)

**What:** Automate payment-status sync for the license server (Item 1 of the [commercial NMS roadmap](~/.gstack/projects/vivekjaiswar-zmonitor/ceo-plans/2026-08-04-commercial-nms-roadmap.md)) instead of the manual ZennialHub admin flag decided in CM2.

**Why:** Manual payment tracking is fine at low customer counts but doesn't scale — automating status sync removes a recurring manual step per customer.

**Context:** CM2 in the CEO plan explicitly deferred payment-processor integration until volume justifies it, tracking payment status via a manual admin flag for now (mirrors existing manual invoicing). User specified **Razorpay or WHMCS** as the preferred integration target, not Stripe/Paddle — pick based on whichever the business already uses for invoicing/billing elsewhere. Depends on Item 1 (license server) existing first.

**Effort estimate:** M (human: ~1-2 wks) → with CC+gstack: ~S-M (~1 wk)

**Priority:** P3

**Depends on / blocked by:** Item 1 (license server) built and manual tracking becoming an actual bottleneck.

## P3 — Full dunning workflow (reminder emails, auto-followup on non-payment)

**What:** Automated reminders before/after a customer's "paid through" date expires, instead of relying on someone remembering to check.

**Why:** The expiry-date field (decided in the Item 1 eng review, CM-Eng-7) tracks *when* a customer's payment lapses, but nothing currently acts on that date. Manual monitoring is fine at low customer counts but doesn't scale.

**Context:** Surfaced during `/plan-eng-review` of Item 1 (licensing). CM-Eng-7 replaced the original bare paid/unpaid flag with a "paid through" date so the license server can compute grace/lock state automatically — but a full dunning workflow (reminder emails, escalating follow-up, auto-flip to unpaid on expiry) was explicitly deferred. Revisit once customer count makes manual tracking a real bottleneck.

**Effort estimate:** M (human: ~1 wk) → with CC+gstack: ~1-2 days

**Priority:** P3

**Depends on / blocked by:** Item 1 shipping with the expiry-date field first.

## P3 — Fleet Admin portal (multi-tenant view of all client installs)

**What:** A real portal showing every ZennialHub client install in one place — replacing the current workaround of adding each client as one more monitor on the admin's own ZMonitor instance.

**Why:** This keeps resurfacing without ever being scheduled. First raised 2026-07-30 (per project memory) with manual GUI steps given as an interim answer; resurfaced again during the Item 1 licensing eng review (2026-08-05) when an assumption that this portal already existed turned out to be false — verified directly, nothing exists under `/opt/zennial` beyond the three single-tenant docker-compose deployments (`zmonitor-admin`, `zmonitor-data`, `zmonitor-prod`).

**Context:** CM-Eng-1 explicitly declined to build this as a side effect of the licensing roadmap (would have expanded Item 1's scope significantly) — licensing now gets its own minimal standalone service instead. This TODO is the actual portal, independent of licensing, for whenever it's prioritized on its own.

**Effort estimate:** L (human: ~2-4 wks) → with CC+gstack: ~3-5 days

**Priority:** P3

**Depends on / blocked by:** Nothing — independent of the licensing roadmap.
