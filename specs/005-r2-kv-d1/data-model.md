# Data Model: R2 / KV / D1

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-08

Three independent finding/alert table pairs (research.md §5) — R2
buckets, KV namespaces, and D1 databases each have a genuinely distinct
identity space and lifecycle.

## `r2_bucket_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `bucket_name` | `TEXT NOT NULL` | |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `critical`, `not_evaluated` |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | ISO 8601 |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | `interactive` or `scheduled` |

**Index**: `(bucket_name, evaluated_at DESC)`.

## `r2_bucket_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `bucket_name` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | `NULL` if first-ever evaluation |
| `new_status` | `TEXT NOT NULL` | `warning` or `critical` |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## `kv_namespace_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `namespace_id` | `TEXT NOT NULL` | Cloudflare KV namespace id |
| `title` | `TEXT NOT NULL` | |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `not_evaluated` (no `critical` outcome — usage is a hygiene signal, not an exposure one) |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | |

**Index**: `(namespace_id, evaluated_at DESC)`.

## `kv_namespace_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `namespace_id` | `TEXT NOT NULL` | |
| `title` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | |
| `new_status` | `TEXT NOT NULL` | `warning` only |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## `d1_database_findings`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `database_uuid` | `TEXT NOT NULL` | Cloudflare D1 database uuid |
| `name` | `TEXT NOT NULL` | |
| `status` | `TEXT NOT NULL` | `safe`, `warning`, `not_evaluated` |
| `reason` | `TEXT NOT NULL` | |
| `evaluated_at` | `TEXT NOT NULL` | |
| `run_id` | `TEXT NOT NULL` | |
| `run_trigger` | `TEXT NOT NULL` | |

**Index**: `(database_uuid, evaluated_at DESC)`.

## `d1_database_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | |
| `database_uuid` | `TEXT NOT NULL` | |
| `name` | `TEXT NOT NULL` | |
| `previous_status` | `TEXT` | |
| `new_status` | `TEXT NOT NULL` | `warning` only |
| `run_id` | `TEXT NOT NULL` | |
| `detected_at` | `TEXT NOT NULL` | |
| `acknowledged_at` | `TEXT` | |

## Entity relationships

```
R2 Bucket (from Cloudflare API, not persisted)
  ├─ has 0..1 r2.dev managed domain (enabled/disabled)
  ├─ has 0..N custom domains (evaluated inline, not separately persisted)
  └─ evaluated into exactly 1 r2_bucket_findings row per run
       └─ a status change vs. the previous run produces 0..1 r2_bucket_alerts rows

KV Namespace (from Cloudflare API, not persisted)
  └─ evaluated (against every deployed Worker's bindings, read fresh
     each run, not persisted) into exactly 1 kv_namespace_findings row
       └─ a status change vs. the previous run produces 0..1 kv_namespace_alerts rows

D1 Database (from Cloudflare API, not persisted)
  └─ evaluated (against every deployed Worker's bindings, read fresh
     each run, not persisted) into exactly 1 d1_database_findings row
       └─ a status change vs. the previous run produces 0..1 d1_database_alerts rows
```

Access applications/policies and Worker bindings are not persisted as
their own rows — both are read inline from the Cloudflare API on each
run and evaluated against buckets/namespaces/databases, the same
"account is the source of truth" principle as every prior module; D1
only remembers the evaluated *outcome*.
