# Phase 1 Data Model: Workers Inventory Layout

## Backend change (research.md §2) — the only one in this feature

```ts
// worker/modules/workers-dashboard/types.ts
export interface AccountSummary {
  deployedCount: number;
  deployedByEnvironment: { production: number; preview: number };
  requests24hTotal: number | null;
  requests24hChangePct: number | null;
  errorRatePct: number | null;
  errors24hTotal: number | null;
  cpuP99Ms: number | null;
  totalRouteCount: number; // NEW — sum of routeCount across every Worker, account-wide
}
```

`buildAccountSummary()` (`worker/modules/workers-dashboard/routes.ts`) computes it as
`workers.reduce((sum, w) => sum + w.routeCount, 0)` — `workers` is already the complete,
unpaginated array at that call site (research.md §2). Serialized as `total_route_count` in the
`GET /api/workers/dashboard` JSON response, alongside the existing `deployed_by_environment` etc.

## `FindingsTable` change (research.md §1)

```ts
// app/components/FindingsTable.tsx
interface FindingsTableProps<Row> {
  // ...existing props unchanged...
  statusPosition?: "left" | "right"; // NEW, default "left" — every existing caller unaffected
}
```

When `"right"`, the status pill's fixed-width column block renders after `columns.map(...)` in both
the header row and each data row, instead of before. No other behavior changes — same pagination,
sort, filter-chip, and row-expand logic regardless of position.

## Frontend-only derivations (no new types, computed client-side)

- **Environment count** (research.md §2): `Object.values(data.summary.deployed_by_environment)
  .filter((n) => n > 0).length` — 1 or 2, from the already-existing `deployed_by_environment` field.
- **Search-narrowed rows**: `data.workers.filter(w => w.worker_name.toLowerCase()
  .includes(query.toLowerCase()))`, applied to the current page's already-loaded rows
  (research.md §3).
- **Environment-filtered rows**: `data.workers.filter(w => envFilter === "all" || w.environment ===
  envFilter)`, combined with the search filter (spec.md Edge Cases — both apply together).

## Per-page integration

| File | Change |
|---|---|
| `worker/modules/workers-dashboard/types.ts` | `AccountSummary` gains `totalRouteCount`. |
| `worker/modules/workers-dashboard/routes.ts` | `buildAccountSummary()` computes it; JSON serialization includes `total_route_count`. |
| `app/components/FindingsTable.tsx` | New optional `statusPosition` prop (default `"left"`). |
| `app/pages/WorkersDashboardPage.tsx` | `statusPosition="right"`; new header toolbar (subtitle, description, search input, environment `<select>`, "Recent activity" scroll-to control); CPU P99 `<MetricCard>` gets a `context` prop; `RecentChangesPanel` gains a scroll-target `id` for the new control to target. |
