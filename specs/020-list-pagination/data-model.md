# Data Model: List Pagination

No new D1 tables or columns — this feature changes how existing `<module>_findings` rows are
queried and returned, not what's persisted. The "entities" below are request/response shapes.

## Pagination request params (shared shape, all 6 module `GET /inventory` routes)

| Param       | Type   | Default | Validation |
|-------------|--------|---------|------------|
| `page`      | number | `1`     | integer ≥ 1; non-integer/≤0 → 400 |
| `page_size` | number | `50`    | integer, 1–200 inclusive; out of range → 400 |
| `sort_key`  | string | module's existing default order | must be one of that module's whitelisted sortable columns; unrecognized value → 400 |
| `sort_dir`  | string | `asc`   | `asc` \| `desc`; anything else → 400 |

Rejecting invalid values with 400 (rather than silently clamping) follows the project's existing
input-validation convention (`worker/modules/audit/routes.ts`'s `since` param handling).

## Pagination response envelope

Added alongside each module's existing response fields (e.g. DNS's `zones`, Workers' `workers`):

```ts
interface PaginationEnvelope {
  page: number;
  page_size: number;
  total: number; // total matching rows for the current scope (see per-module notes below)
  total_pages: number; // ceil(total / page_size), minimum 1
}
```

## Per-module pagination scope

| Module      | Paginated unit | Scope |
|-------------|-----------------|-------|
| Workers     | one row per Worker | account-wide (flat) |
| DNS         | one row per DNS record | within the currently-selected zone (existing `zone` query param) |
| Storage     | one row per R2 bucket / KV namespace / D1 database | **three independent envelopes**, one per collection, in one response |
| Security    | one row per zone | account-wide (flat) — confirmed against specs/017 |
| Zero Trust  | one row per Access application | account-wide (flat) — reconfirm against current `ZeroTrustInventory.tsx` before implementation |
| Pages       | one row per Pages project | account-wide (flat) — reconfirm against current `PagesInventory.tsx` before implementation |

Storage's response gains three envelopes, e.g.:

```ts
interface StorageInventoryResponse {
  buckets: BucketFinding[];
  buckets_pagination: PaginationEnvelope;
  kv_namespaces: KvFinding[];
  kv_namespaces_pagination: PaginationEnvelope;
  d1_databases: D1Finding[];
  d1_databases_pagination: PaginationEnvelope;
}
```

## `FindingsTable` pagination prop

```ts
interface FindingsTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  sortKey: string | null;
  sortDir: 1 | -1;
  onSortChange: (key: string) => void;
}
```

Passed as a new optional `pagination?: FindingsTablePagination` prop on `FindingsTableProps`. When
present, status-filter chips are hidden (research.md §5) and sort/paging delegate to the callbacks
instead of local state; when absent, all existing behavior is unchanged.

## Audit log fetch result

```ts
interface AuditLogFetchResult {
  entries: RecentChangeEntry[]; // unchanged shape
  truncated: boolean; // true when AUDIT_LOG_FETCH_CAP was hit before Cloudflare's own pages ran out
}
```

Replaces `fetchAccountAuditLog()`'s current bare `RecentChangeEntry[]` return type. `GET
/api/audit/log` forwards `entries.length` as the total shown and `truncated` as-is to the frontend.
