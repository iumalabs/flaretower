# API Contract: Security Posture

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-10

Mirrors every prior module's contract shape. All endpoints under
`/api/security/*`, gated by the same cross-cutting Access JWT
middleware.

## `GET /api/security/inventory`

**Response 200**:

```json
{
  "run_id": "01JSECURITYXYZ...",
  "evaluated_at": "2026-08-10T14:00:00Z",
  "zones": [
    {
      "zone_id": "zone-1",
      "zone_name": "example.com",
      "ssl_tls": { "status": "critical", "reason": "SSL/TLS mode is Flexible — origin traffic is unencrypted" },
      "dnssec": { "status": "warning", "reason": "DNSSEC is disabled" },
      "waf": { "status": "safe", "reason": "a WAF managed ruleset is deployed with at least one enabled rule" },
      "rate_limiting": { "status": "warning", "reason": "no rate-limiting ruleset deployed" }
    }
  ],
  "turnstile_widgets": [
    { "sitekey": "0x4AAA...", "name": "login-page", "domains": ["example.com"] }
  ]
}
```

Turnstile widgets are fetched live on every call — not tied to `run_id`
(research.md §6).

**Errors**: `403` (missing/invalid Access JWT); partial results with
`status: "not_evaluated"` on affected checks rather than a blanket
failure.

## `POST /api/security/evaluate`

**Response 202**: `{ "run_id": "01JSECURITYXYZ..." }`

## `GET /api/security/alerts`

**Response 200**:

```json
{
  "alerts": [
    {
      "id": "01JSECALERT1...",
      "kind": "ssl_tls",
      "zone_id": "zone-1",
      "zone_name": "example.com",
      "previous_status": "safe",
      "new_status": "critical",
      "detected_at": "2026-08-10T06:00:00Z",
      "acknowledged_at": null
    },
    {
      "id": "01JSECALERT2...",
      "kind": "dnssec",
      "zone_id": "zone-1",
      "zone_name": "example.com",
      "previous_status": "safe",
      "new_status": "warning",
      "detected_at": "2026-08-10T06:00:00Z",
      "acknowledged_at": null
    }
  ]
}
```

A `kind` discriminator (`ssl_tls` | `dnssec` | `waf` | `rate_limiting`)
distinguishes the four alert types in the merged response — the four
underlying tables are combined at the API layer, not in the database,
same pattern as Modules 3-5's equivalent merges.

## `POST /api/security/alerts/{kind}/{id}/acknowledge`

`{kind}` is `ssl_tls`, `dnssec`, `waf`, or `rate_limiting`, routing to
the matching table. Same idempotent/404 semantics as every prior
module's equivalent endpoint. Not written to `audit_log` (not a
Cloudflare account mutation).

**Response 200**: `{ "id": "01JSECALERT1...", "acknowledged_at": "2026-08-10T14:05:00Z" }`

## Scheduled entry point

Not an HTTP contract — joins the existing shared `scheduled` handler,
alongside Modules 1-5's independent evaluations (constitution
Principle III).
