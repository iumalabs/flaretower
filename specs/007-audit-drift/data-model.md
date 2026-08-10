# Data Model: Audit & Drift

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-10

No new D1 tables (research.md §4). This module's "data model" is the
source registry it reads through, plus the shapes it computes at the
API layer from that registry — nothing here is persisted by this
module.

## Source registry (`sources.ts`)

One entry per row of research.md §2's table. Each entry:

```ts
interface AuditSource {
  module: string;        // "exposure" | "dns" | "zero-trust" | "pages" | "storage" | "security"
  kind: string;           // e.g. "hostname", "ssl_tls", "r2_bucket"
  findingsTable: string;  // e.g. "exposure_findings" — fixed, from the hard-coded list only
  alertsTable: string;    // e.g. "exposure_alerts" — fixed, from the hard-coded list only
  entityKeyColumns: string[];   // e.g. ["worker_name", "hostname"]
  labelColumns: string[];       // which of entityKeyColumns to join for display (research.md §2)
}
```

This registry is the single hard-coded source of truth for which
fourteen tables exist and how to read them — it is never constructed
from request input, the same allowlist discipline every prior module's
`ALERT_TABLE_BY_KIND` already established (research.md §3).

## Computed shapes (API layer only, never persisted)

### Unified Alert

```ts
interface UnifiedAlert {
  id: string;              // the underlying alert row's own id
  module: string;
  kind: string;
  entityLabel: string;     // joined from that source's labelColumns
  previousStatus: string | null;
  newStatus: string;
  detectedAt: string;
  acknowledgedAt: string | null;
}
```

Read directly from one source's `alertsTable` — `id` is the real
primary key of that row, so acknowledging a `UnifiedAlert` writes to
the exact same row its own module's `POST /alerts/.../acknowledge`
endpoint would (spec FR-002).

### Posture Summary Entry

```ts
interface PostureSummaryEntry {
  module: string;
  kind: string;
  hasData: boolean;        // false = "no evaluation run yet" (spec FR-007)
  counts: { safe: number; warning: number; critical: number; not_evaluated: number };
}
```

One entry per source (fourteen total), derived from that source's
`findingsTable` filtered to its latest `run_id`.

### Change Entry

```ts
interface ChangeEntry {
  module: string;
  kind: string;
  entityLabel: string;
  previousStatus: string | null;
  currentStatus: string;
}
```

One entry per entity, per source, whose status differs between "latest"
and "most recent at-or-before the requested cutoff" (research.md §5).

## Entity relationships

```
AuditSource (hard-coded registry, 14 entries, no persistence)
  ├─ read → one source's findingsTable → PostureSummaryEntry (per source, per request)
  ├─ read → one source's alertsTable, WHERE acknowledged_at IS NULL → UnifiedAlert (per source, merged across all 14, per request)
  ├─ acknowledge → UPDATE ...alertsTable... SET acknowledged_at = ? WHERE id = ? (writes through to the owning module's own row)
  └─ read → one source's findingsTable, latest vs. at-or-before-cutoff per entity → ChangeEntry (per source, merged across all 14, per request)
```

Nothing in this module has its own primary key, its own `run_id`, or
its own lifecycle — every id an operator sees or acknowledges through
this module's endpoints is another module's id.
