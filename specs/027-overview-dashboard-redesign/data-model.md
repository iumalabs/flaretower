# Phase 1 Data Model: Overview Dashboard Redesign

## Backend changes

### `worker/modules/audit/summary.ts` — `PostureSummaryEntry` gains `evaluatedAt`; `PostureSummaryResult` gains `accountScope`

```ts
export interface PostureSummaryEntry {
  module: string;
  kind: string;
  hasData: boolean;
  counts: PostureCounts;
  evaluatedAt: string | null; // NEW — null when hasData is false
}

export interface PostureSummaryResult {
  modules: PostureSummaryEntry[];
  unavailableSources: UnavailableSource[];
  accountScope: { zoneCount: number; workerCount: number }; // NEW (research.md §1)
}
```

`computeSummaryForSource` already runs `SELECT run_id FROM {findingsTable} ORDER BY evaluated_at
DESC LIMIT 1` — add `evaluated_at` to that same SELECT, no new query. `accountScope` is two small,
targeted queries (not generalized across all 17 `AUDIT_SOURCES`, since "zone" and "Worker" are
concepts specific to two sources, not a generic property every source has):
`SELECT COUNT(DISTINCT zone_name) FROM dns_findings WHERE run_id = (latest dns run_id)` and
`SELECT COUNT(DISTINCT worker_name) FROM exposure_findings WHERE run_id = (latest exposure
run_id)`, each `0` when that source has no data yet.

### `worker/modules/audit/inbox.ts` — `UnifiedAlert` gains `reason`

```ts
export interface UnifiedAlert {
  id: string;
  module: string;
  kind: string;
  entityLabel: string;
  previousStatus: string | null;
  newStatus: string;
  detectedAt: string;
  acknowledgedAt: string | null;
  reason: string; // NEW — "reason unavailable" when the LEFT JOIN finds no matching row
}
```

`queryOneSource`'s query gains a `LEFT JOIN {findingsTable} ON {alertsTable}.run_id =
{findingsTable}.run_id AND <findingIdentityColumns equality>` (research.md §3), selecting
`{findingsTable}.reason`.

### `worker/modules/audit/trend.ts` — new module, reusing existing patterns

```ts
export interface TrendDayPoint {
  date: string; // "YYYY-MM-DD", UTC
  hasData: boolean; // false = before every source's earliest evaluation (FR-010)
  counts: { safe: number; warning: number; critical: number; not_evaluated: number };
}

export interface TrendResult {
  days: TrendDayPoint[]; // exactly 14, oldest first
  unavailableSources: UnavailableSource[]; // same shape as summary.ts/changes.ts
}

export async function computeTrend(db: D1Database, days: number = 14): Promise<TrendResult>;
```

Implementation (research.md §5), per source, in parallel via `Promise.allSettled` (same fan-out
convention as `summary.ts`/`changes.ts`):

1. **Seed query**: `buildLatestPerEntityQuery`-style (reused from `changes.ts`'s existing helper,
   exported for this reuse) bound to the window start (`now - 14d`) — one row per entity, its status
   as of the window's start.
2. **Window query**: `SELECT {identityColumns}, status, evaluated_at FROM {findingsTable} WHERE
   evaluated_at >= ? ORDER BY evaluated_at ASC` bound to the same window start.
3. **In-memory replay**: seed a `Map<entityKey, status>` from (1); walk (2)'s rows in order, updating
   the map per row; at each of the 14 UTC-midnight boundaries the replay crosses, snapshot a status
   tally (count of map values per status) into that day's `counts`.
4. A day with zero total entities tallied across **every** source (not just this one) is `hasData:
   false` — computed by the caller (`routes.ts`) after merging all seventeen sources' per-day tallies,
   not per-source.

## New route

```
GET /api/audit/trend
```

Response: `{ days: [{ date, has_data, counts: {...} }, ...], unavailable_sources: [...] }` — same
`unavailable_sources` shape already used by `summary`/`alerts`/`changes`.

## Frontend changes

| File | Change |
|---|---|
| `app/pages/OverviewPage.tsx` | Header context row (zone/Worker counts from `summary`'s per-source data, last-scan from `evaluated_at` max, static cadence string, `useMultiRescan`); `FindingRow` renders `reason` and a derived contextual-action label (research.md §4) alongside the unchanged Acknowledge button; new `ExposureTrendChart` sub-component fetches `GET /api/audit/trend` and renders the 14-day stacked bars. |
| `app/lib/use-multi-rescan.ts` | New — fires all six `POST /<module>/evaluate` endpoints via `Promise.allSettled`, tracks pending/per-module-error state (research.md §2). |

## Per-source cross-cutting types

`worker/modules/audit/sources.ts`'s `AUDIT_SOURCES` registry (`findingsTable`, `alertsTable`,
`findingIdentityColumns`, `alertLabelColumns`) is read, not modified, by every piece above — the
same 17-entry registry every existing audit sub-module already shares.
