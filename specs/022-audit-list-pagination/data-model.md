# Phase 1 Data Model: Audit List Pagination

No new entities or D1 schema changes (plan.md Technical Context). What follows is the sort-key
whitelist for each endpoint and the response envelope shape, both reusing `worker/pagination.ts`
exactly as-is.

## Sort-key whitelists

| Endpoint       | Sort key                                    | Accessor                         | Notes                                                                                                              |
| -------------- | ------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /alerts`  | `entity` (default candidate)                | `a.entityLabel`                  | matches today's only client-side sortable column                                                                   |
|                | `detected` (**default when no `sort_key`**) | `a.detectedAt`                   | matches `queryUnifiedAlerts()`'s existing in-code sort, so the tab's default view is unchanged                     |
|                | `severity`                                  | `SEVERITY_RANK[a.newStatus]`     | new — critical-first, moved server-side from `OverviewPage.tsx`'s existing client-side `SEVERITY_ORDER`            |
| `GET /changes` | `entity` (**default when no `sort_key`**)   | `c.entityLabel`                  | matches today's only client-side sortable column; no timestamp field exists to default to instead (research.md §2) |
|                | `severity`                                  | `SEVERITY_RANK[c.currentStatus]` | new, same ranking as alerts'                                                                                       |

`SEVERITY_RANK` (shared, defined once in `worker/modules/audit/routes.ts` or hoisted alongside
`worker/pagination.ts` if reused by a future module):
`{ critical: 0, warning: 1, safe: 2,
not_evaluated: 3 }` — identical values to `OverviewPage.tsx`'s
existing `SEVERITY_ORDER`, which this feature's Overview changes replace with the server-computed
order (no client-side sort left once both fetches request `sort_key=severity` directly).

## Response shape (both endpoints)

```ts
// GET /alerts
{
  alerts: UnifiedAlert[],       // one page's worth, per `page`/`page_size`
  critical_alert: UnifiedAlert | null,  // NEW (research.md §6) — computed from the full
                                 //   pre-pagination array, not just the current page, so
                                 //   AuditInventory.tsx's banner doesn't miss a critical
                                 //   alert sitting on a later page
  unavailable_sources: UnavailableSource[],  // unchanged, always the full per-source list
  pagination: { page, page_size, total, total_pages },  // worker/pagination.ts's existing envelope
}

// GET /changes
{
  since, until,                 // unchanged
  changes: ChangeEntry[],       // one page's worth
  unavailable_sources: UnavailableSource[],
  pagination: { page, page_size, total, total_pages },
}
```

`unavailable_sources` stays unpaginated/unsliced on both — it's always small (at most 17 entries,
one per source) and isn't the list being paginated.

## Overview's bounded-slice request

Both of `OverviewPage.tsx`'s fetches change from `fetch("/api/audit/alerts")` /
`fetch("/api/audit/changes")` to `fetch("/api/audit/alerts?page=1&page_size=5&sort_key=severity")` /
the `changes` equivalent. The "N more" indicator's count is `pagination.total - <rendered count>`
(only shown when `pagination.total > 5`), linking to Audit & Drift with no query param needed (the
tab itself defaults to page 1 — landing there and clicking the relevant tab is sufficient, per spec
021's own no-URL-state precedent).
