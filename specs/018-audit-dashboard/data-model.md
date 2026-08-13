# Phase 1 Data Model: Audit Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13 | **Research**: [research.md](./research.md)

## No new D1 tables or columns

This feature is entirely live-fetched (research.md §3/§6) — no migration is part of this spec.

## In-memory types

No new types are needed in `worker/modules/workers-dashboard/types.ts` — this feature reuses
`RecentChangeEntry` (`{ occurredAt, actor, actorSource, action, target, resultSummary }`) exactly
as already defined there.

## Response shape (`GET /api/audit/log`, new endpoint)

```json
{
  "since": "2026-08-06T12:00:00Z",
  "until": "2026-08-13T12:00:00Z",
  "entries": [
    {
      "occurred_at": "2026-08-13T09:04:12Z",
      "actor": "user@example.com",
      "actor_source": "dashboard",
      "action": "zone.settings.change",
      "target": "zone",
      "result_summary": "\"off\" -> \"on\""
    }
  ],
  "unavailable": false
}
```

`unavailable: true` (with `entries: []`) means the Cloudflare Audit Logs API call itself failed —
distinct from `entries: []` with `unavailable: false`, which means the call succeeded and
confirmed zero activity in the window (spec.md FR-003).

## Frontend-only state (no new backend shape)

- Selected source filter (`"all" | "dashboard" | "api"`) — client-side only, filters the
  already-fetched `entries` array.
- JSONL export — client-side serialization of the currently-filtered `entries`, triggered as a
  browser file download (research.md §5).
