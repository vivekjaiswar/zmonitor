# TODOS

## P3 — Payment automation for the license server (Razorpay or WHMCS integration)

**What:** Automate payment-status sync for the license server (Item 1 of the [commercial NMS roadmap](~/.gstack/projects/vivekjaiswar-zmonitor/ceo-plans/2026-08-04-commercial-nms-roadmap.md)) instead of the manual ZennialHub admin flag decided in CM2.

**Why:** Manual payment tracking is fine at low customer counts but doesn't scale — automating status sync removes a recurring manual step per customer.

**Context:** CM2 in the CEO plan explicitly deferred payment-processor integration until volume justifies it, tracking payment status via a manual admin flag for now (mirrors existing manual invoicing). User specified **Razorpay or WHMCS** as the preferred integration target, not Stripe/Paddle — pick based on whichever the business already uses for invoicing/billing elsewhere. Depends on Item 1 (license server) existing first.

**Effort estimate:** M (human: ~1-2 wks) → with CC+gstack: ~S-M (~1 wk)

**Priority:** P3

**Depends on / blocked by:** Item 1 (license server) built and manual tracking becoming an actual bottleneck.
