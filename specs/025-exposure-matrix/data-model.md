# Phase 1 Data Model: Exposure Matrix

No new D1 tables, columns, or backend response shapes (research.md §1/§2 — both endpoints this
feature relies on already exist and are unchanged). What follows is the frontend data shape this
feature introduces, derived entirely from the two existing API responses.

## Derived `WorkerMatrixRow` (client-side, from `GET /api/exposure/inventory`)

```ts
interface EntryPointCell {
  status: ExposureStatus;       // worst status among this Worker's hostnames of this kind
  present: boolean;              // false = no hostname of this kind at all ("not present" state)
  hostnames: HostnameFinding[];  // every hostname of this kind, for the expanded ROUTES panel
}

interface WorkerMatrixRow {
  workerName: string;
  customDomain: EntryPointCell;
  workersDev: EntryPointCell;
  previewUrl: EntryPointCell;
  coverage: { label: string; pct: number; status: ExposureStatus | "na" }; // research.md §5
  overallStatus: ExposureStatus; // worst status across all this Worker's hostnames
}
```

Built once per `GET /inventory` response by grouping `workers[].hostnames` by `kind` — no request
beyond the existing inventory fetch.

## Row-expand detail (lazy, from `GET /api/workers/:worker_name/detail`)

Reuses the existing `WorkerDetail` response verbatim (`worker/modules/workers-dashboard/types.ts`):
`routes: WorkerRouteEntry[]` (hostname/kind/status/reason/policy) and `cloudflareUrl`. Fetched once
per Worker, the first time its row is expanded; cached in the page's component state thereafter
(research.md §2).

## Derived row-detail ACTIONS (client-side, from the row's own status data — research.md §6)

```ts
interface RowAction {
  label: string;
  kind: "primary" | "warning" | "ghost"; // visual weight, matches ACT.crit/warn/ghost in the design
  href?: string; // present only for "View in Cloudflare" — the one real, non-visual-only action
}
```

Computed per row from `WorkerMatrixRow`'s entry-point statuses (e.g. a critical `workersDev` cell
contributes a `"Disable workers.dev"` ghost-weight visual control; any `warning` cell contributes a
`"Review"` control) plus one real `"View in Cloudflare"` action linking to the detail endpoint's
`cloudflareUrl` (fetched lazily alongside the ROUTES/EFFECTIVE POLICY panels on first expand, so this
action is only present once a row has been expanded at least once — acceptable per spec.md, which
scopes the action panel to the expanded-row state).

## Shared component extraction (research.md §4)

`app/components/RoutePolicy.tsx` (new): extracted from `app/pages/WorkerDetailPage.tsx`'s existing
private `RoutePolicy` component — same props (`policy: WorkerRoutePolicy | null`,
`status: ExposureStatus`), same rendering (VERB_COLOR-keyed ALLOW/REQUIRE/DENY lines, the issue-#416
critical-vs-transient "no policy" distinction). `WorkerDetailPage.tsx` updates its import to the
extracted component; no behavior change there.

## Per-page integration

| Page | Change |
|---|---|
| `app/pages/ExposureInventory.tsx` | Rebuilt as the matrix: new page-specific table (research.md §3) replacing the `FindingsTable` usage; toolbar with search + severity-jump chips + existing `RescanButton`; row-expand fetches Worker Detail lazily; title changes to "Exposure matrix." File path/name unchanged — only the export's rendered structure changes. |
| `app/pages/WorkerDetailPage.tsx` | Import `RoutePolicy` from the new shared location instead of its own private copy; no other change. |
| `app/components/RoutePolicy.tsx` | New — extracted, shared. |
