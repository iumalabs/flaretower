# API Contract: Worker Detail Page

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-16

One new endpoint under `/api/workers/*`, gated by the same cross-cutting Access JWT middleware as
every other route. Like `GET /api/workers/dashboard` (spec 012), this is a live read composed from
already-persisted findings plus one fresh Cloudflare Audit Logs API call — no `POST /evaluate`
companion, nothing new is evaluated or persisted by this endpoint itself (the one schema change,
`covering_app_ids`, is written by the *existing* `POST /api/exposure/evaluate` — see
data-model.md).

## `GET /api/workers/:worker_name/detail`

**Response 200**:

```json
{
  "worker_name": "api-gateway",
  "environment": "production",
  "routes": [
    {
      "hostname": "api.acme.dev",
      "kind": "custom_domain",
      "status": "safe",
      "reason": "covered by Access application(s): 9252df6d-e9e1-42f5-ad3c-e1e0b452ec6f",
      "policy": {
        "app_id": "9252df6d-e9e1-42f5-ad3c-e1e0b452ec6f",
        "app_name": "gateway-admin",
        "app_domain": "api.acme.dev",
        "policy_rules": [
          [
            { "verb": "ALLOW", "label": "emails ending in @acme.dev" },
            { "verb": "REQUIRE", "label": "identity provider · Okta" }
          ]
        ]
      }
    },
    {
      "hostname": "api-gateway.acme-labs.workers.dev",
      "kind": "workers_dev",
      "status": "critical",
      "reason": "no Access application covers this hostname",
      "policy": null
    }
  ],
  "recent_changes": [
    {
      "occurred_at": "2026-08-07T13:42:08Z",
      "actor": "wrangler",
      "actor_source": "deploy",
      "action": "Enabled workers.dev subdomain",
      "target": "api-gateway.acme-labs.workers.dev",
      "result_summary": "workers_dev: false -> true"
    }
  ],
  "cloudflare_url": "https://dash.cloudflare.com/<account_id>/workers/services/view/api-gateway/production",
  "unavailable": []
}
```

**`routes`**: every hostname from the latest exposure evaluation run for this Worker
(`exposure_findings`, data-model.md), in the same status vocabulary as every other module
(`safe`/`warning`/`critical`/`not_evaluated`). `policy` is `null` whenever `status` is `critical`
via "no covering app" (FR-004) — but a `warning` status (a covering app that doesn't meaningfully
restrict access) still has a non-null `policy`, since a permissive policy is still a policy to show
in plain language, not the absence of one. A Worker with zero HTTP routes (FR-007) returns
`routes: []` — the frontend renders this as an explicit "exposure does not apply" state, the same
distinction `GET /api/exposure/inventory` already requires its own caller to make.

**`recent_changes`**: same shape as `GET /api/workers/dashboard`'s existing `recent_changes` array
(spec 012 contracts/api.md), filtered to entries whose target is one of this Worker's own hostnames
instead of any Worker's. `[]` with no corresponding `unavailable` entry means genuinely no recent
changes (FR-006).

**`unavailable`**: array of `{ "source": "policy" | "recent_changes", "error": string }`.
`"policy"` covers the `zt_app_findings` join failing or returning nothing for the run (routes still
render with their own `reason` text, just every `policy` field falls back to `null`). `"recent_changes"`
covers the Cloudflare Audit Logs API call failing (mirrors `GET /api/workers/dashboard`'s existing
`audit_log` source and `GET /api/audit/log`'s own `unavailable: true` flag). Both are additive — a
failure in one never blocks the other section from rendering.

**Errors**:

- Standard Access-gate 401/403 (unchanged from every other route).
- `404 { "error": "worker not found in latest evaluation run" }` — `worker_name` has no row (not
  even the no-hostnames marker) in the latest `exposure_findings` run (FR-008). Also returned when
  no exposure evaluation run exists at all yet.
