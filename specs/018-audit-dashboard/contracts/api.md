# API Contract: Audit Dashboard

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-13

`GET /api/audit/log` — **new** endpoint (the existing `/api/audit/alerts`, `/api/audit/changes`,
`/api/audit/summary` endpoints are unchanged).

**Query parameters**: none in this feature (research.md §4 — fixed 7-day window).

**Response 200**:

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

Sourced entirely from `fetchAccountAuditLog()` (`worker/modules/workers-dashboard/audit-log.ts`,
unmodified — research.md §1), called with `since = now - 7 days` and no Workers-relevance filter
applied. `unavailable: true` means the underlying Cloudflare API call rejected outright; `entries`
is `[]` in that case, never a fabricated list. A successful call with genuinely zero matching
entries returns `unavailable: false, entries: []`.

No new write endpoints — this feature is entirely read-only (spec.md FR-007). The source filter
and JSONL export are both client-side-only (research.md §2/§5) and have no server-side contract.
