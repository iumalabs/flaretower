# API Contract: Workers & Access Exposure

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-07

All endpoints are under `/api/exposure/*`, served by the Hono router in the
Worker's `fetch` handler (research.md §1). Every endpoint requires a valid
Access JWT per constitution Principle II — no endpoint below is reachable
without it; that check is cross-cutting middleware, not repeated per-route
here.

## `GET /api/exposure/inventory`

Returns the latest evaluated state of every Worker's hostnames — backs User
Stories 1–3.

**Response 200**:

```json
{
  "run_id": "01JABCXYZ...",
  "evaluated_at": "2026-08-07T14:00:00Z",
  "workers": [
    {
      "worker_name": "billing-api",
      "hostnames": [
        {
          "hostname": "billing.example.com",
          "kind": "custom_domain",
          "status": "safe",
          "reason": "Access application 'billing-prod' restricts to group 'finance'"
        },
        {
          "hostname": "billing-api.acct.workers.dev",
          "kind": "workers_dev",
          "status": "critical",
          "reason": "no Access application covers this hostname"
        }
      ]
    }
  ]
}
```

**Errors**:
- `403` — missing/invalid Access JWT (constitution Principle II; no body
  beyond a generic error, per fail-closed — must not leak why validation
  failed in detail to the caller).
- `502` with a body distinguishing which resources couldn't be evaluated —
  used when the Cloudflare API itself errored or rate-limited mid-run
  (FR-011: partial results are still returned for what *was* evaluated,
  with `status: "not_evaluated"` on the affected items, not a blanket
  failure of the whole response).

## `POST /api/exposure/evaluate`

Triggers an on-demand evaluation run (User Story 1 — "opens FlareTower and
sees..." implies the interactive view can force a fresh run rather than only
ever showing the last scheduled result). Calls the same shared evaluation
module the `scheduled` handler uses (constitution Principle III).

**Response 202**: `{ "run_id": "01JABCXYZ..." }` — evaluation may take
longer than a single request/response cycle is comfortable for at larger
account sizes; the client polls `GET /api/exposure/inventory` (which always
returns the latest completed run) rather than blocking on this call.
Exact synchronous-vs-async behavior is an implementation-phase decision
(`tasks.md`) once real account sizes are measured against the CPU/subrequest
budget in `research.md` §5 — this contract only fixes the response shape.

## `GET /api/exposure/alerts`

Returns unacknowledged alerts (User Story 4) — new-vs-repeat transitions
into `warning` or `critical` that haven't been acknowledged yet.

**Response 200**:

```json
{
  "alerts": [
    {
      "id": "01JALERTXYZ...",
      "hostname": "billing-api.acct.workers.dev",
      "previous_status": "safe",
      "new_status": "critical",
      "detected_at": "2026-08-07T06:00:00Z",
      "acknowledged_at": null
    }
  ]
}
```

## `POST /api/exposure/alerts/{id}/acknowledge`

Marks an alert acknowledged (sets `acknowledged_at`). Not a Cloudflare
account mutation (FR-012 scope boundary) — this is FlareTower's own state,
so it is **not** written to `audit_log` (see `data-model.md`'s note on the
baseline schema).

**Response 200**: `{ "id": "01JALERTXYZ...", "acknowledged_at": "2026-08-07T14:05:00Z" }`

**Errors**: `404` if the alert ID doesn't exist.

## Scheduled entry point (not an HTTP contract, documented for completeness)

The `scheduled` handler (Cron Trigger, research.md §5) calls the identical
shared evaluation module as `POST /api/exposure/evaluate`, persists to
`exposure_findings`/`exposure_alerts` the same way, and takes no request —
there is no separate contract to define; its behavior is fully specified by
sharing the module per constitution Principle III.
