# API Contract: List Pagination

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-14

All 7 routes below are **existing** endpoints, extended in place — no new routes, no removed
fields (additive only, per data-model.md's `PaginationEnvelope`).

## `GET /api/{dns,security,zero-trust,pages}/inventory` — flat, account-wide pagination

**New query parameters**: `page` (default 1), `page_size` (default 50, max 200), `sort_key`
(default: module's existing order), `sort_dir` (`asc`|`desc`, default `asc`). Invalid values → 400
with a message naming the offending param (mirrors `audit/routes.ts`'s existing `since`-validation
error style).

**Response**: existing top-level array field (`zones`, findings, etc.) now holds only the
requested page's rows; a sibling `pagination: PaginationEnvelope` field is added. DNS additionally
scopes `page`/`page_size`/sort to the already-selected `zone` query param — pagination applies to
that zone's records, not a cross-zone flat list (research.md §2).

## `GET /api/workers/inventory` — same as above

Same param/response shape; Workers' table is already a flat one-row-per-Worker list, no scoping
wrinkle.

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
