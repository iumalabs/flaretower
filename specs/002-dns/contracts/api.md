# API Contract: DNS

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-07

Mirrors Module 1's contract shape
([`specs/001-workers-access-exposure/contracts/api.md`](../../001-workers-access-exposure/contracts/api.md)).
All endpoints under `/api/dns/*`, gated by the same cross-cutting Access
JWT middleware (constitution Principle II) — not repeated per-route here.

## `GET /api/dns/inventory`

Returns the latest evaluated state of every zone's records.

**Response 200**:

```json
{
  "run_id": "01JDNSXYZ...",
  "evaluated_at": "2026-08-07T14:00:00Z",
  "zones": [
    {
      "zone_name": "example.com",
      "records": [
        {
          "record_name": "old-blog.example.com",
          "type": "CNAME",
          "content": "old-blog.herokuapp.com",
          "proxy_capable": true,
          "proxied": false,
          "status": "critical",
          "reason": "dangling CNAME target (Cloudflare Security Insights)"
        },
        {
          "record_name": "api.example.com",
          "type": "A",
          "content": "203.0.113.10",
          "proxy_capable": true,
          "proxied": false,
          "status": "warning",
          "reason": "DNS-only — bypasses Cloudflare protection for this origin-facing record"
        }
      ]
    }
  ]
}
```

**Errors**: `403` (missing/invalid Access JWT); partial results with
`status: "not_evaluated"` on affected records/zones rather than a blanket
failure, same as Module 1.

## `POST /api/dns/evaluate`

Triggers an on-demand evaluation run. Same shared module the `scheduled`
handler uses (constitution Principle III).

**Response 202**: `{ "run_id": "01JDNSXYZ..." }`

## `GET /api/dns/alerts`

Returns unacknowledged alerts.

**Response 200**:

```json
{
  "alerts": [
    {
      "id": "01JDNSALERTXYZ...",
      "zone_name": "example.com",
      "record_name": "old-blog.example.com",
      "record_type": "CNAME",
      "previous_status": "safe",
      "new_status": "critical",
      "detected_at": "2026-08-07T06:00:00Z",
      "acknowledged_at": null
    }
  ]
}
```

## `POST /api/dns/alerts/{id}/acknowledge`

Same semantics as Module 1's equivalent endpoint (idempotent, 404 if
missing, not written to `audit_log` — not a Cloudflare account mutation).

**Response 200**: `{ "id": "01JDNSALERTXYZ...", "acknowledged_at": "2026-08-07T14:05:00Z" }`

## Scheduled entry point

Not an HTTP contract — the `scheduled` handler calls the identical shared
evaluation module `POST /api/dns/evaluate` does, per constitution Principle
III, same as Module 1.
