# API Contract: Security Dashboard

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-13

`GET /api/security/inventory` (existing endpoint, response restructured and extended — no new
endpoint).

**Response 200**:

```json
{
  "run_id": "01JSECURITYXYZ...",
  "evaluated_at": "2026-08-13T12:00:00Z",
  "zones": [
    {
      "zone_id": "zone-1",
      "zone_name": "acme.dev",
      "overall_status": "warning",
      "ssl_tls": { "status": "safe", "reason": "SSL/TLS mode is Full (strict)" },
      "dnssec": { "status": "safe", "reason": "DNSSEC is active" },
      "waf": { "status": "safe", "reason": "a WAF managed ruleset is deployed with at least one enabled rule" },
      "rate_limiting": { "status": "warning", "reason": "no rate-limiting ruleset deployed, or every rule in it is disabled" },
      "bot_fight_mode": { "status": "safe", "reason": "Bot Fight Mode is on" },
      "always_use_https": { "status": "safe", "reason": "Always Use HTTPS is on" },
      "min_tls_version": { "status": "safe", "reason": "minimum TLS version is 1.2" }
    }
  ],
  "certificates": [
    {
      "zone_id": "zone-1",
      "zone_name": "acme.dev",
      "hosts": ["acme.dev", "*.acme.dev"],
      "issuer": "Let's Encrypt",
      "expires_on": "2026-10-13T00:00:00Z",
      "status": "safe"
    }
  ],
  "waf_custom_rules": [
    {
      "zone_id": "zone-1",
      "zone_name": "acme.dev",
      "description": "block-admin-paths",
      "expression": "http.request.uri.path contains \"/admin\"",
      "action": "block",
      "enabled": true,
      "status": "safe"
    }
  ],
  "turnstile_widgets": []
}
```

`zones[]` replaces the prior flattened-per-check response shape — one entry per zone instead of
one entry per (zone, check) pair. Every zone row's 4 existing checks (`ssl_tls`/`dnssec`/`waf`/
`rate_limiting`) carry the exact same status/reason values the current endpoint already computes
(spec.md FR-003) — only the response shape changed, wrapping them into one object per zone instead
of separate flattened rows. `overall_status` is the worst of all 7 per-check statuses
(research.md §2). `bot_fight_mode`/`always_use_https`/`min_tls_version` are new.

`certificates`/`waf_custom_rules` are new top-level arrays, live-fetched on every request
(research.md §5/§6) — `null` only if the underlying zone list itself couldn't be fetched at all
(mirrors `turnstile_widgets`' existing null-on-total-failure convention).

`turnstile_widgets` is unchanged.

`POST /api/security/evaluate` — unchanged in trigger/shape, now also persists the 3 new
finding/alert table pairs.
