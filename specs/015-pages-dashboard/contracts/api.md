# API Contract: Pages Dashboard

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-13

`GET /api/pages/inventory` (existing endpoint, response extended — no new endpoint).

**Response 200**:

```json
{
  "run_id": "01JPAGESXYZ...",
  "evaluated_at": "2026-08-13T12:00:00Z",
  "projects": [
    {
      "project_name": "acme-docs",
      "production_domain": "docs.acme.dev",
      "production_branch": "main",
      "last_build_status": "safe",
      "last_build_reason": "latest production deployment succeeded",
      "last_build_created_at": "2026-08-13T10:00:00Z",
      "health_status": "safe",
      "health_reason": "covered by Access application(s): platform-core",
      "subdomain": { "subdomain": "acme-docs.pages.dev", "status": "safe", "reason": "covered by Access application(s): platform-core" },
      "deployment": { "deployment_id": "dep-1", "status": "safe", "reason": "latest production deployment succeeded", "created_at": "2026-08-13T10:00:00Z" },
      "domains": [{ "domain_name": "docs.acme.dev", "status": "safe", "reason": "domain is active" }]
    }
  ]
}
```

`production_domain`/`production_branch`/`last_build_*`/`health_*` are new, derived/passthrough
top-level convenience fields (data-model.md's `PagesProjectRow`) added alongside the existing
`subdomain`/`deployment`/`domains` objects — those existing nested objects are unchanged in shape, so
nothing that already reads them breaks.

`POST /api/pages/evaluate` — unchanged (still persists a new run including the 2 new columns).
