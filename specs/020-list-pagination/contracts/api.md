# API Contract: List Pagination

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-14

All routes below are **existing** endpoints, extended in place — no new routes.
Implementation status: ✅ Workers, ✅ DNS. Security/Zero Trust/Pages below are still the
Phase 0 design (to be reconfirmed against each page's actual wiring per research.md §2's
"confirm before assuming" note, same as DNS's contract turned out to need correcting).

## `GET /api/workers/dashboard` — flat, account-wide pagination ✅ implemented

**New query parameters**: `page` (default 1), `page_size` (default 50, max 200), `sort_key`
(one of `worker`/`env`/`routes`/`requests`/`errors`/`cpu`/`last-deploy`, default `worker`),
`sort_dir` (`asc`|`desc`, default `asc`). Invalid values → 400 with a message naming the offending
param.

**Response**: `workers` now holds only the requested page's rows; a sibling
`workers_pagination: PaginationEnvelope` field is added. Sorting/pagination happens in-memory in
the route handler (`paginateWorkers()`), not via D1 — this route's row set is already fully
live-fetched from Cloudflare on every call (no D1-backed findings table to push a LIMIT into).

## `GET /api/dns/inventory` — per-zone scoping, restructured response ✅ implemented

**New query parameters**: `zone` (zone name; defaults to the first zone alphabetically),
`page`/`page_size`/`sort_key` (`type`/`name`/`ttl`, default `name`)/`sort_dir`. This endpoint took
**no query params at all** before this feature — `zone` did not previously exist (research.md §2's
correction); adding it changed the response shape, not just added a pagination sibling:

```json
{
  "run_id": "...", "evaluated_at": "...",
  "total_records": 42, "total_dangling": 3,
  "zone_summaries": [{ "zone_name": "example.com", "record_count": 40 }, "...every zone..."],
  "selected_zone": "example.com",
  "critical_finding": { "record_name": "...", "reason": "..." },
  "records": ["...the selected zone's current page only..."],
  "records_pagination": { "page": 1, "page_size": 50, "total": 40, "total_pages": 1 }
}
```

Replaces the old `{ run_id, evaluated_at, zones: [{ zone_name, records }] }` (every zone's every
record in one response). `zone_summaries` carries only name+count for the tab bar — other zones'
full record sets are never fetched until selected. `critical_finding` is computed across the whole
selected zone (not just the current page), so the module-scope alert banner can't miss a critical
record simply because it's on a different page.

## `GET /api/storage/inventory` — three independent envelopes

**New query parameters**: `bucket_page`/`bucket_page_size`/`bucket_sort_key`/`bucket_sort_dir`,
`kv_page`/`kv_page_size`/`kv_sort_key`/`kv_sort_dir`, `d1_page`/`d1_page_size`/`d1_sort_key`/
`d1_sort_dir` — one triplet+sort per collection (data-model.md's three-envelope shape), since the
three tables are independent and a shared `page` param would conflate them.

**Response**: `buckets`/`kv_namespaces`/`d1_databases` each become the current page of their own
collection; `buckets_pagination`/`kv_namespaces_pagination`/`d1_databases_pagination` added.

## `GET /api/audit/log` — cursor-followed, capped, no pagination params

**No new query parameters** — this endpoint already covers a fixed 7-day window (spec 018) and
Story 1 requires it show every event in that window up to the cap, not page through it.

**Response**: adds `total: number` (== `entries.length`, the count actually returned) and
`truncated: boolean` (true when `AUDIT_LOG_FETCH_CAP` was hit). `entries` itself is unchanged
shape, now potentially containing up to `AUDIT_LOG_FETCH_CAP` items instead of a bare single-page
~100.

```json
{
  "since": "2026-08-06T12:00:00Z",
  "until": "2026-08-13T12:00:00Z",
  "entries": ["...up to 1000 items..."],
  "total": 340,
  "truncated": false,
  "unavailable": false
}
```
