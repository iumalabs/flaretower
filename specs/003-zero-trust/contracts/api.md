# API Contract: Zero Trust / Access

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-07

Mirrors every prior module's contract shape. All endpoints under
`/api/zero-trust/*`, gated by the same cross-cutting Access JWT middleware.

## `GET /api/zero-trust/inventory`

**Response 200**:

```json
{
  "run_id": "01JZTXYZ...",
  "evaluated_at": "2026-08-07T14:00:00Z",
  "applications": [
    {
      "app_id": "abc-123",
      "app_domain": "internal-tool.example.com",
      "status": "warning",
      "reason": "policy allows Everyone"
    }
  ],
  "service_tokens": [
    {
      "token_id": "tok-456",
      "token_name": "CI/CD token",
      "expires_at": "2026-08-10T00:00:00Z",
      "status": "warning",
      "reason": "expires within 14 days"
    }
  ]
}
```

**Errors**: `403` (missing/invalid Access JWT); partial results with
`status: "not_evaluated"` on affected items rather than a blanket failure.

## `POST /api/zero-trust/evaluate`

**Response 202**: `{ "run_id": "01JZTXYZ..." }`

## `GET /api/zero-trust/alerts`

**Response 200**:

```json
{
  "alerts": [
    {
      "id": "01JZTALERTXYZ...",
      "kind": "application",
      "app_id": "abc-123",
      "app_domain": "internal-tool.example.com",
      "previous_status": "safe",
      "new_status": "warning",
      "detected_at": "2026-08-07T06:00:00Z",
      "acknowledged_at": null
    },
    {
      "id": "01JZTALERTABC...",
      "kind": "service_token",
      "token_id": "tok-456",
      "token_name": "CI/CD token",
      "previous_status": "safe",
      "new_status": "critical",
      "detected_at": "2026-08-07T06:00:00Z",
      "acknowledged_at": null
    }
  ]
}
```

A `kind` discriminator distinguishes application alerts from service-token
alerts in the merged response — the two underlying tables
(`zt_app_alerts`/`zt_token_alerts`) are combined at the API layer, not in
the database.

## `POST /api/zero-trust/alerts/{kind}/{id}/acknowledge`

`{kind}` is `application` or `service_token`, routing to the matching
table. Same idempotent/404 semantics as every prior module's equivalent
endpoint. Not written to `audit_log` (not a Cloudflare account mutation).

**Response 200**: `{ "id": "01JZTALERTXYZ...", "acknowledged_at": "2026-08-07T14:05:00Z" }`

## Scheduled entry point

Not an HTTP contract — joins the existing shared `scheduled` handler,
alongside Modules 1 and 2's independent evaluations (constitution
Principle III).
