# Phase 0 Research: Audit Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

## §1. Reusing `fetchAccountAuditLog()` unmodified

**Decision**: The new `GET /api/audit/log` route calls
`worker/modules/workers-dashboard/audit-log.ts`'s `fetchAccountAuditLog(creds, since,
fetchImpl)` directly, with no filtering applied (unlike Workers Dashboard's own call, which pipes
the result through `filterWorkersRelevant()` afterward).

**Rationale**: This function was built in spec 012 specifically for this reuse — its own header
comment states: "specs/018 (Audit dashboard) reuses this as-is rather than re-implementing," and
the project's own README documents the `Audit Logs Read` token scope as "Module 012 (018 reuses)."
No new Cloudflare API call, no new token scope, and — per constitution Principle III's shared-logic
requirement — no duplicated fetch/parse logic between the two modules that already reuse it
identically.

## §2. Source filter values — only what Cloudflare actually returns

**Decision**: The panel's filter is limited to "All sources," "Dashboard," and "API" — matching
`RecentChangeEntry.actorSource`'s only two possible real values.

**Rationale**: Confirmed via Cloudflare's own documentation
(`https://developers.cloudflare.com/fundamentals/account/account-security/audit-logs/`): the
`interface` field (mapped to `actorSource`) is either `"dashboard"` or `"api"` — there is no
`"wrangler"` or `"terraform"` value; both authenticate through the same generic API interface,
indistinguishable from any other API client. The design mockup's WRANGLER/TERRAFORM filter chips
have no honest data source and are not built — matching this rollout's established precedent for
un-derivable mockup detail (specs 016's R2/KV object counts, 017's Email Obfuscation).

## §3. Not persisted, not evaluated

**Decision**: Audit log entries are fetched live on every `GET /api/audit/log` call — no D1 table,
no migration, no safe/warning/critical status.

**Rationale**: A raw account-activity entry has no natural safe/warning/critical judgment the way
every other table on this page does (they all read this project's own evaluated findings) —
assigning one would mean inventing a severity taxonomy Cloudflare's own audit trail doesn't
suggest, which this rollout has consistently avoided (spec 017's decision not to build an
account-wide toggle-aggregation status is the closest precedent: don't invent judgment where none
is honestly derivable). This also matches the live-fetched, unpersisted precedent already
established for informational panels without drift-tracking value (spec 014's Access Groups panel,
spec 017's Certificates/WAF Custom Rules panels) — except here there isn't even a status to
classify, so the panel renders as a plain chronological table, not a `FindingsTable` instance.

## §4. Fixed 7-day window, no date-range picker

**Decision**: `GET /api/audit/log` defaults to `since = now - 7 days`, matching the design
mockup's own default ("LAST 7 DAYS"). No query parameter or UI control changes this window in this
feature.

**Rationale**: Mirrors the existing `GET /api/audit/changes` endpoint's own `since` query-param
pattern (defaults, in that endpoint's case, to 24 hours) — reusing the identical shape for
consistency. A full interactive date-range picker is real, buildable functionality, but
disproportionate to this feature's primary value (having the feed exist at all) — a reasonable
future enhancement, not required for this spec's user stories.

## §5. Export is client-side only

**Decision**: The "Export JSONL" action serializes the currently-filtered entries (already present
in the browser) into newline-delimited JSON and triggers a browser download — no new backend
endpoint, no additional Cloudflare API call.

**Rationale**: Every value in the export already exists in the already-fetched response; a
server round-trip would only reproduce data the client already has. This is a pure, read-only
client-side action — matching FR-007's "no mutating control on this panel" requirement trivially,
since it makes no network request at all.

## §6. No D1 migration needed

**Decision**: This spec adds zero new tables, zero new columns.

**Rationale**: Direct consequence of §3 — nothing here is persisted or evaluated, so there is
nothing for a migration to add.
