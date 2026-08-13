# API Contract: Storage Dashboard

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-13

`GET /api/storage/inventory` (existing endpoint, response extended — no new endpoint).

**Response 200**:

```json
{
  "run_id": "01JSTORAGEXYZ...",
  "evaluated_at": "2026-08-13T12:00:00Z",
  "buckets": [
    {
      "bucket_name": "acme-uploads",
      "status": "critical",
      "reason": "r2.dev managed public URL is enabled",
      "custom_domain": "cdn.acme.dev",
      "bound_to_workers": ["img-resize"],
      "bound_to": "img-resize"
    }
  ],
  "kv_namespaces": [
    {
      "namespace_id": "ns-1",
      "title": "feature-flags",
      "status": "safe",
      "reason": "referenced by at least one deployed Worker's bindings",
      "bound_to_workers": ["worker-a", "worker-b", "worker-c"],
      "bound_to": "3 workers"
    }
  ],
  "d1_databases": [
    {
      "database_uuid": "db-1",
      "name": "acme-billing",
      "status": "safe",
      "reason": "referenced by at least one deployed Worker's bindings",
      "bound_to_workers": ["billing-api"],
      "bound_to": "billing-api",
      "num_tables": 18,
      "file_size": 880640
    }
  ]
}
```

`custom_domain`/`bound_to_workers`/`bound_to`/`num_tables`/`file_size` are new, derived/passthrough
fields added alongside the existing `status`/`reason` fields — those existing fields are unchanged
in meaning and computation (spec.md FR-004). `custom_domain` is `null` when the bucket has no
enabled custom domain. `num_tables`/`file_size` are `null` when the D1 detail fetch failed for that
database (distinct from a real `0`).

`POST /api/storage/evaluate` — unchanged (still persists a new run including the 6 new columns).
