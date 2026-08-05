# License server

Standalone service, separate from the main ZMonitor app. Tracks which
self-hosted installs are paid-through-when, issues signed check-in tokens,
and holds the fleet-wide kill-switch. See `docs/designs/commercial-nms-roadmap.md`
(Item 1) for why this exists and what it deliberately does NOT do (it is an
honesty-based nudge, not DRM — the main app's LICENSE is plain MIT).

## Setup

```sh
# One-time: generate the admin password hash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" 'your-password'

# Run
LICENSE_SERVER_ADMIN_PASSWORD_HASH='<hash from above>' node license-server/server.js
```

The RS256 keypair (`keys/private.pem`, `keys/public.pem`) is generated once
and committed nowhere — `keys/private.pem` is gitignored. `keys/public.pem`
gets embedded as a constant in the main app's client code
(`server/license/client.js`) and ships with normal releases (CM-Eng-5) —
rotate by generating a new pair and shipping the new public key in a release
with a transition window, not by fetching it at runtime.

## Backup / restore (1-Eng-C)

`backup.sh` copies the sqlite file (whole-DB copy, since it's a single file)
to `backups/` and prunes anything older than 30 days. Cron it:

```
0 3 * * * /opt/.../license-server/backup.sh
```

Restore = stop the service, `cp backups/license-<date>.db license.db`,
restart. **Actually run this once after deploying** — a documented procedure
that's never been exercised isn't a tested one.

## Outbound allowlist (CM-Eng-6)

Every self-hosted customer install needs outbound HTTPS access to this
server's hostname. ISP ops/NOC servers commonly run restrictive egress
firewalls — document the exact hostname:port in the main install docs
(`INSTALL.md`) so a customer's default firewall posture doesn't silently
start their grace clock on day one. The client surfaces a distinct "never
checked in" banner state (not a generic failure) so this is diagnosable
rather than silent.

## Admin API

All `/admin/*` routes require `X-Admin-Password: <plaintext password>` (checked
against the bcrypt hash at startup — single admin, no session/RBAC, per
CM-Eng-1). Not TLS-terminated here — put this behind the same reverse proxy
as the rest of the production host.

- `GET /admin/installs` — fleet health view (8A): every install, last
  check-in, paid-through date, current kill-switch state.
- `POST /admin/installs/:installId/paid-through` — `{ "date": "2026-09-01" }`
  (or `null` to clear).
- `POST /admin/kill-switch` — `{ "active": true|false }`. Fleet-wide,
  instant, no per-customer update needed (1A).
