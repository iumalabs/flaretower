# Phase 1 Data Model: Storage Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13 | **Research**: [research.md](./research.md)

**Numbering note**: this spec's migration is named `0012_...` even though `0010` is the highest
migration visible on this branch at the time of writing — spec 015 (Pages Dashboard)'s still-open
PR already claims `0011`. Naming this one `0012` up front avoids a numbering collision once both
merge to `main` in sequence (research.md §5).

## `r2_bucket_findings` (existing table, extended)

New nullable columns:

| Column               | Type | Meaning                                                                 |
|-----------------------|------|--------------------------------------------------------------------------|
| `custom_domain`       | TEXT | First enabled custom domain, or `NULL` if none (research.md §3)          |
| `bound_to_workers`    | TEXT | JSON array of deployed Worker script names whose bindings reference this bucket (research.md §2) |

## `kv_namespace_findings` (existing table, extended)

| Column               | Type | Meaning                                                                 |
|-----------------------|------|--------------------------------------------------------------------------|
| `bound_to_workers`    | TEXT | JSON array of deployed Worker script names whose bindings reference this namespace |

## `d1_database_findings` (existing table, extended)

| Column               | Type    | Meaning                                                              |
|-----------------------|---------|------------------------------------------------------------------------|
| `bound_to_workers`    | TEXT    | JSON array of deployed Worker script names whose bindings reference this database |
| `num_tables`          | INTEGER | Table count from the D1 detail endpoint, `NULL` if the detail fetch failed (research.md §1) |
| `file_size`           | INTEGER | On-disk size in bytes from the D1 detail endpoint, `NULL` if the detail fetch failed |

All 6 new columns are nullable — existing rows predating this migration have no value, matching
every prior spec's precedent for additive findings-table columns.

## In-memory types (`worker/modules/storage/types.ts`)

- `BucketInventoryItem` gains `customDomains` usage unchanged (already present); evaluation-time
  derivation only.
- `KvNamespaceInventoryItem` — unchanged (bound-to is resolved at evaluation time from
  `BindingReferences`, not stored per inventory item).
- `D1DatabaseInventoryItem` gains `numTables?: number` and `fileSizeBytes?: number` (`undefined` =
  detail fetch failed or not yet attempted).
- `BucketEvaluation` gains `customDomain: string | null` and `boundToWorkers: string[]`.
- `KvNamespaceEvaluation` gains `boundToWorkers: string[]`.
- `D1DatabaseEvaluation` gains `boundToWorkers: string[]`, `numTables: number | null`,
  `fileSizeBytes: number | null`.
- `BindingReferences` (inventory.ts, not persisted) gains 3 new `Map<string, string[]>` fields
  alongside the existing `Set<string>` fields — additive, existing fields untouched:
  - `kvNamespaceBoundTo: Map<string, string[]>` (namespace id → Worker names)
  - `d1DatabaseBoundTo: Map<string, string[]>` (database uuid → Worker names)
  - `r2BucketBoundTo: Map<string, string[]>` (bucket name → Worker names — R2 bindings key by
    name, not id; research.md §2)

## Pure derivation helpers (`worker/modules/storage/routes.ts`)

- `boundToLabel(workers: readonly string[]): string` — `"none"` when empty, the single name when
  length 1, `` `${n} workers` `` when length > 1. Mirrors spec 015's `deriveProductionDomain()`
  precedent: a small pure function, directly unit-testable, living beside the route that uses it.

## Response shape (`GET /api/storage/inventory`)

See [contracts/api.md](./contracts/api.md) for the full response — `bucket`/`kv_namespace`/
`d1_database` rows each gain a `bound_to` (already-derived label string) alongside the raw
`bound_to_workers` array; buckets additionally gain `custom_domain`; D1 databases additionally gain
`num_tables`/`file_size`.
