# API Contract: Audit & Drift

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-10

Mirrors every prior module's contract shape, with one difference: this
module has no `GET /inventory` or `POST /evaluate` (there is nothing to
inventory or evaluate — research.md §1, §4). All endpoints under
`/api/audit/*`, gated by the same cross-cutting Access JWT middleware.

## `GET /api/audit/alerts`

Unified outstanding-alerts inbox across all fourteen sources (User
Story 1).

**Response 200**:

```json
{
  "alerts": [
    {
      "id": "01JZTALERTXYZ...",
      "module": "storage",
      "kind": "r2_bucket",
      "entity_label": "uploads",
      "previous_status": "safe",
      "new_status": "critical",
      "detected_at": "2026-08-10T06:00:00Z",
      "acknowledged_at": null
    },
    {
      "id": "01JSECALERT1...",
      "module": "security",
      "kind": "ssl_tls",
      "entity_label": "example.com",
      "previous_status": "safe",
      "new_status": "critical",
      "detected_at": "2026-08-10T06:05:00Z",
      "acknowledged_at": null
    }
  ]
}
```

Sorted by `detected_at` descending across all sources. `module`+`kind`
identify which of the fourteen sources produced the entry (data-model.md).

**Errors**: `403` (missing/invalid Access JWT). A single source's read
failure is reported per-source (spec FR-010) — see
`GET /api/audit/summary`'s equivalent handling; the alerts list simply
omits that source's rows rather than failing the whole response.

## `POST /api/audit/alerts/{module}/{kind}/{id}/acknowledge`

Acknowledges the underlying alert row in its own module's alert table —
the exact same write that module's own
`POST /api/{module}/alerts/.../{id}/acknowledge` endpoint performs
(spec FR-002). `{module}`/`{kind}` select which of the fourteen entries
in the `sources.ts` registry to route to; an unknown pair is `404`, same
semantics as every prior module's own acknowledge endpoint.

**Response 200**: `{ "id": "01JZTALERTXYZ...", "acknowledged_at": "2026-08-10T14:05:00Z" }`

## `GET /api/audit/summary`

Account-wide posture summary (User Story 3).

**Response 200**:

```json
{
  "modules": [
    {
      "module": "exposure",
      "kind": "hostname",
      "has_data": true,
      "counts": { "safe": 4, "warning": 1, "critical": 0, "not_evaluated": 0 }
    },
    {
      "module": "dns",
      "kind": "record",
      "has_data": false,
      "counts": { "safe": 0, "warning": 0, "critical": 0, "not_evaluated": 0 }
    }
  ]
}
```

`has_data: false` means that source has never run an evaluation yet
(spec FR-007) — its `counts` are meaningless zeros, not "confirmed
clean," and the UI must not present it as such.

## `GET /api/audit/changes?since={ISO8601}`

"What changed since" digest (User Story 2). `since` defaults to 24 hours
before the request time when omitted.

**Response 200**:

```json
{
  "since": "2026-08-09T14:00:00Z",
  "until": "2026-08-10T14:00:00Z",
  "changes": [
    {
      "module": "security",
      "kind": "ssl_tls",
      "entity_label": "example.com",
      "previous_status": "safe",
      "current_status": "critical"
    },
    {
      "module": "storage",
      "kind": "r2_bucket",
      "entity_label": "new-test-bucket",
      "previous_status": null,
      "current_status": "warning"
    }
  ]
}
```

`previous_status: null` means the entity was first observed inside the
requested window (spec User Story 2, Acceptance Scenario 3).

## Scheduled entry point

Not an HTTP contract — joins the existing shared `scheduled` handler,
alongside Modules 1-6's independent evaluations (constitution
Principle III). Computes `GET /api/audit/changes`'s default (last
24 hours) digest and logs the count of changes found — no new alert
table is written (research.md §4).
