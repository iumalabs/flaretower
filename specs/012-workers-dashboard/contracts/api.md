# API Contract: Workers Dashboard

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-13

One endpoint under `/api/workers/*`, gated by the same cross-cutting Access JWT middleware as every
other module. Unlike every prior module, this endpoint has no companion `POST /evaluate` — it is a
live read on every request (plan.md's Storage decision: nothing here is persisted), not an
evaluate-then-read pair.

## `GET /api/workers/dashboard`

**Response 200**:

```json
{
  "generated_at": "2026-08-13T12:00:00Z",
  "summary": {
    "deployed_count": 15,
    "deployed_by_environment": { "production": 13, "preview": 2 },
    "requests_24h_total": 8400000,
    "requests_24h_change_pct": 11.0,
    "error_rate_pct": 0.011,
    "errors_24h_total": 924,
    "cpu_p99_ms": 18
  },
  "workers": [
    {
      "worker_name": "api-gateway",
      "environment": "production",
      "route_count": 4,
      "last_deploy_at": "2026-08-13T06:00:00Z",
      "requests_24h": 3481220,
      "errors_24h": 412,
      "cpu_p50_ms": 6,
      "exposure_status": "critical"
    }
  ],
  "recent_changes": [
    {
      "occurred_at": "2026-08-07T13:42:08Z",
      "actor": "wrangler",
      "actor_source": "deploy",
      "action": "Enabled workers.dev subdomain",
      "target": "api-gateway",
      "result_summary": "workers_dev: false -> true"
    }
  ],
  "unavailable": []
}
```

**`unavailable`**: array of `{ "source": "analytics" | "audit_log" | "exposure", "error": string }` —
present and non-empty when one of the three underlying sources couldn't be read; the other two still
populate normally (spec.md FR-007's degradation rule extended to the whole endpoint, not just a single
Worker's row). A Worker whose own analytics figures specifically failed still appears in `workers[]`
with `requests_24h`/`errors_24h`/`cpu_p50_ms` as `null`, distinct from the whole-source failure this
array reports.

**Errors**: standard Access-gate 401/403 (unchanged from every other route); no other endpoint-specific
error responses — a partial upstream failure degrades via `unavailable`/`null` fields, never a 5xx for
the whole endpoint, so the page can still render whatever data succeeded.
