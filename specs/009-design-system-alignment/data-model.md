# Phase 1 Data Model: Design System & App Shell Alignment

No new D1 tables, columns, or migrations. This feature is presentation-only
(plan.md's Constitution Check, Principle III row). The shapes below are
either **already-existing backend response types being consumed
unchanged**, or **client-side-only view models** that exist purely to hand
props to shared components — none of them are persisted.

## Consumed unchanged (already exist, documented here for traceability)

### `PostureSummaryEntry` (from `GET /api/audit/summary`, Module 7)

```ts
interface PostureCounts {
  safe: number;
  warning: number;
  critical: number;
  not_evaluated: number;
}

interface PostureSummaryEntry {
  module: string; // "exposure" | "dns" | "zero-trust" | "pages" | "storage" | "security"
  kind: string;    // e.g. "hostname", "record", "application", "service_token", ...
  hasData: boolean;
  counts: PostureCounts;
}
```

Source: `worker/modules/audit/summary.ts`. Consumed by the Overview page
(FR-016/FR-017) and the Sidebar's per-module badge rollup (FR-004).

### Unified alert / change-digest entries (from `GET /api/audit/alerts`, `/changes`)

Already-defined response shapes from `worker/modules/audit/inbox.ts` and
`worker/modules/audit/changes.ts` — consumed as-is by the Overview page's
findings list and activity log (US3/AC3, AC4). Not reproduced here; see
`specs/007-audit-drift/data-model.md` for their authoritative definitions.

## New client-side view models (not persisted, not sent over the network)

### `ModuleBadgeCount`

Derived in the frontend from `PostureSummaryEntry[]` — one entry per
sidebar module, the sum of `counts.critical` across every source sharing
that `module` value. Zero-valued entries are filtered out before reaching
the Sidebar (FR-004: no badge renders for a zero count).

```ts
interface ModuleBadgeCount {
  module: string;       // matches a Sidebar nav item's key
  criticalCount: number; // > 0 always, by construction
}
```

### `FindingsTableColumn<Row>`

Per-module column configuration passed into the shared `FindingsTable`
component (research.md §4). Each of the 7 module pages defines its own
array of these; the component itself has no knowledge of any specific
module's data shape.

```ts
interface FindingsTableColumn<Row> {
  key: string;
  label: string;
  width?: string;       // CSS width, matches design's per-column widths
  render: (row: Row) => ReactNode;
  sortValue?: (row: Row) => string | number; // omit if column is not sortable
}
```

### `FindingsTableRow<Row>`

The generic row wrapper `FindingsTable` operates on — `status` drives the
shape+color badge and the critical-row redundant marking (FR-011); `id`
is the row key and expansion-toggle key; `detail` is optional
expanded-row content (FR-012), which is `undefined` for a row that
cannot expand (module-dependent).

```ts
interface FindingsTableRow<Row> {
  id: string;
  status: "safe" | "warning" | "critical" | "not_evaluated";
  data: Row;                    // fed to each column's render()
  detail?: ReactNode;           // expanded-row content; absent = not expandable
}
```

### `AlertBannerFinding`

The single most-urgent finding a module page (US2/AC3) or the Overview
page (US3/AC3) surfaces in the `AlertBanner` component — a minimal
projection, not a new backend type; each caller derives it from data it
already has (its own inventory findings, or the unified alert inbox for
Overview).

```ts
interface AlertBannerFinding {
  severity: "critical" | "warning";
  title: string;
  target: string;      // hostname, zone name, worker name, etc.
  description: string;
  actionLabel?: string; // omit if there is no one-click action available
  onAction?: () => void;
}
```
