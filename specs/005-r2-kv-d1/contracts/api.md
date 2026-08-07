# API Contract: R2 / KV / D1

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-08

Mirrors every prior module's contract shape. All endpoints under
`/api/storage/*`, gated by the same cross-cutting Access JWT middleware.

## `GET /api/storage/inventory`

**Response 200**:

```json
{
  "run_id": "01JSTORAGEXYZ...",
  "evaluated_at": "2026-08-08T14:00:00Z",
  "buckets": [
    {
      "bucket_name": "user-uploads",
      "status": "critical",
      "reason": "r2.dev managed public URL is enabled"
    }
  ],
  "kv_namespaces": [
    {
      "namespace_id": "abcd1234",
      "title": "SESSIONS",
      "status": "warning",
      "reason": "not referenced by any deployed Worker's bindings"
    }
  ],
  "d1_databases": [
    {
      "database_uuid": "efgh5678",
      "name": "flaretower",
      "status": "safe",
      "reason": "referenced by 1 deployed Worker's bindings"
    }
  ]
}
```

**Errors**: `403` (missing/invalid Access JWT); partial results with
`status: "not_evaluated"` on affected items rather than a blanket
failure.

## `POST /api/storage/evaluate`

**Response 202**: `{ "run_id": "01JSTORAGEXYZ..." }`

## `GET /api/storage/alerts`

**Response 200**:

```json
{
  "alerts": [
    {
      "id": "01JSTORAGEALERT1...",
      "kind": "bucket",
      "bucket_name": "user-uploads",
      "previous_status": "safe",
      "new_status": "critical",
      "detected_at": "2026-08-08T06:00:00Z",
      "acknowledged_at": null
    },
    {
      "id": "01JSTORAGEALERT2...",
      "kind": "kv_namespace",
      "namespace_id": "abcd1234",
      "title": "SESSIONS",
      "previous_status": "safe",
      "new_status": "warning",
      "detected_at": "2026-08-08T06:00:00Z",
      "acknowledged_at": null
    },
    {
      "id": "01JSTORAGEALERT3...",
      "kind": "d1_database",
      "database_uuid": "efgh5678",
      "name": "flaretower",
      "previous_status": "safe",
      "new_status": "warning",
      "detected_at": "2026-08-08T06:00:00Z",
      "acknowledged_at": null
    }
  ]
}
```

A `kind` discriminator (`bucket` | `kv_namespace` | `d1_database`)
distinguishes the three alert types in the merged response — the three
underlying tables are combined at the API layer, not in the database,
same pattern as Modules 3 and 4's equivalent merges.

## `POST /api/storage/alerts/{kind}/{id}/acknowledge`

`{kind}` is `bucket`, `kv_namespace`, or `d1_database`, routing to the
matching table. Same idempotent/404 semantics as every prior module's
equivalent endpoint. Not written to `audit_log` (not a Cloudflare account
mutation).

**Response 200**: `{ "id": "01JSTORAGEALERT1...", "acknowledged_at": "2026-08-08T14:05:00Z" }`

## Scheduled entry point

Not an HTTP contract — joins the existing shared `scheduled` handler,
alongside Modules 1-4's independent evaluations (constitution
Principle III).
