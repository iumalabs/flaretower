# API Contract: Pages

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-08

Mirrors every prior module's contract shape. All endpoints under
`/api/pages/*`, gated by the same cross-cutting Access JWT middleware.

## `GET /api/pages/inventory`

**Response 200**:

```json
{
  "run_id": "01JPAGESXYZ...",
  "evaluated_at": "2026-08-08T14:00:00Z",
  "projects": [
    {
      "project_name": "marketing-site",
      "subdomain": {
        "subdomain": "marketing-site.pages.dev",
        "status": "critical",
        "reason": "no Access application covers this hostname"
      },
      "deployment": {
        "deployment_id": "dep-789",
        "status": "safe",
        "reason": "latest production deployment succeeded"
      },
      "domains": [
        {
          "domain_name": "example.com",
          "status": "safe",
          "reason": "domain is active"
        },
        {
          "domain_name": "staging.example.com",
          "status": "warning",
          "reason": "domain verification is pending"
        }
      ]
    }
  ]
}
```

Each project's three independent checks (subdomain exposure, deployment
health, custom domains) are nested under that project for display, even
though they're stored as three separate finding tables (`data-model.md`).

**Errors**: `403` (missing/invalid Access JWT); partial results with
`status: "not_evaluated"` on affected items rather than a blanket failure.

## `POST /api/pages/evaluate`

**Response 202**: `{ "run_id": "01JPAGESXYZ..." }`

## `GET /api/pages/alerts`

**Response 200**:

```json
{
  "alerts": [
    {
      "id": "01JPAGESALERT1...",
      "kind": "subdomain",
      "project_name": "marketing-site",
      "subdomain": "marketing-site.pages.dev",
      "previous_status": "safe",
      "new_status": "critical",
      "detected_at": "2026-08-08T06:00:00Z",
      "acknowledged_at": null
    },
    {
      "id": "01JPAGESALERT2...",
      "kind": "deployment",
      "project_name": "marketing-site",
      "deployment_id": "dep-790",
      "previous_status": "safe",
      "new_status": "warning",
      "detected_at": "2026-08-08T06:00:00Z",
      "acknowledged_at": null
    },
    {
      "id": "01JPAGESALERT3...",
      "kind": "domain",
      "project_name": "marketing-site",
      "domain_name": "staging.example.com",
      "previous_status": "safe",
      "new_status": "warning",
      "detected_at": "2026-08-08T06:00:00Z",
      "acknowledged_at": null
    }
  ]
}
```

A `kind` discriminator (`subdomain` | `deployment` | `domain`)
distinguishes the three alert types in the merged response — the three
underlying tables are combined at the API layer, not in the database, same
pattern as Module 3's `application`/`service_token` merge.

## `POST /api/pages/alerts/{kind}/{id}/acknowledge`

`{kind}` is `subdomain`, `deployment`, or `domain`, routing to the
matching table. Same idempotent/404 semantics as every prior module's
equivalent endpoint. Not written to `audit_log` (not a Cloudflare account
mutation).

**Response 200**: `{ "id": "01JPAGESALERT1...", "acknowledged_at": "2026-08-08T14:05:00Z" }`

## Scheduled entry point

Not an HTTP contract — joins the existing shared `scheduled` handler,
alongside Modules 1-3's independent evaluations (constitution
Principle III).
