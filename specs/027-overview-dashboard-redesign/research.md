# Phase 0 Research: Overview Dashboard Redesign

## §1. Header context row — zone/Worker counts, last-scan time, real cadence

**Zone/Worker counts**: `dns_findings`' latest run already carries `zone_name` per record;
`exposure_findings`' latest run already carries `worker_name` per hostname. Zone count =
`COUNT(DISTINCT zone_name)` over dns_findings' latest run; Worker count =
`COUNT(DISTINCT worker_name)` over exposure_findings' latest run. Both are cheap, single queries
against already-populated tables — no new Cloudflare API call, no dependency on the Workers or DNS
module's own live-inventory endpoints (research confirms this is strictly additive to
`worker/modules/audit/summary.ts`, which already reads `AUDIT_SOURCES`-listed tables the same way).

**Last-scan time**: `PostureSummaryEntry` (`worker/modules/audit/summary.ts`) doesn't currently
return `evaluatedAt` — the query that already fetches `latest.run_id` per source
(`SELECT run_id FROM {findingsTable} ORDER BY evaluated_at DESC LIMIT 1`) can select
`evaluated_at` in the same round trip at zero extra query cost. "Last scan" = the max of every
source's `evaluatedAt` where `hasData` is true — computed client-side from the already-returned
per-source list, no new endpoint.

**Real cadence**: `wrangler.jsonc`'s production `triggers.crons` is `["0 * * * *"]` — hourly, not
the design mockup's fictional "every 15m." **Decision**: hardcode a small, honestly-labeled cadence
string ("runs hourly") in the frontend rather than parsing cron syntax generically for one static,
rarely-changing value — parsing full cron expressions for a single known constant is unjustified
complexity. If the production cadence ever changes, this string is updated alongside the
`wrangler.jsonc` edit, in the same PR, not derived dynamically.

**Rejected alternative**: exposing the cron cadence via a new API field read from environment
config at runtime. Rejected — `wrangler.jsonc`'s `crons` array isn't available to the Worker at
runtime as an env var without deliberately duplicating it into one; a static, honest frontend string
is simpler and no less correct for a value that changes only when a developer edits deploy config.

## §2. Account-wide "RE-SCAN" — fire all six existing evaluate endpoints

No new mutation capability: the six `POST /<module>/evaluate` endpoints already exist
(specs/024's research.md §1 catalogued all six). **Decision**: a small `useMultiRescan` hook
(sibling to specs/024's `useRescan`) that fires all six via `Promise.allSettled` (not `Promise.all`
— one module's failure must not hide the other five's success, spec.md Edge Cases), tracks
per-module pending/error state, and calls a combined `onSuccess` (refetch of this page's own
summary/alerts/changes/trend data) once every settled call has resolved. Reuses the exact POST
endpoints and response shape (`{ run_id }`, 202) specs/024 already established — no backend change
for this piece.

## §3. Findings-row reason text — an additive JOIN, not new data collection

`worker/modules/audit/inbox.ts`'s `queryOneSource` currently selects only
`id, entity_label, previous_status, new_status, detected_at, acknowledged_at` from each source's
*alerts* table. Every alerts table already carries `run_id` (confirmed in
`0002_exposure_findings.sql` and consistent across all seventeen migrations), and every findings
table already carries `reason` plus the same `run_id`. **Decision**: extend `queryOneSource`'s query
with a JOIN from the alerts table to the findings table on `run_id` + that source's own
`findingIdentityColumns` (already available per-source metadata in `sources.ts`), selecting
`reason` through. No schema change, no new write path — an additive `SELECT`/`JOIN` on data already
written by every module's existing `evaluate()` step.

**Edge case**: a `run_id` present in the alerts table but whose matching findings-table row was
since superseded or pruned would make the JOIN return no `reason` for that alert. **Decision**:
`LEFT JOIN`, falling back to a generic "reason unavailable" string client-side rather than dropping
the row or erroring the whole query — consistent with this codebase's established "degrade
gracefully, never blank the page" convention (e.g. `WorkerDetailPage.tsx`'s policy-unavailable
state).

## §4. Contextual action labels — visual only, derived per module/kind

Per spec.md FR-008 (confirmed with the user, consistent with specs/025's identical scope boundary):
these labels are informational, not wired to a real mutation. Given findings span all seventeen
source kinds — far more varied than Exposure matrix's single kind — a full bespoke label per kind
is unjustified complexity for a visual-only affordance. **Decision**: a small
`module` → default-label lookup (e.g. `exposure` → `"Review exposure"`, falling back to a generic
`"Review"` for any kind without a specific entry), with `critical`-status findings getting a
higher-emphasis visual treatment (matching the design's differently-styled critical action button)
but the same underlying non-mutating behavior. This is deliberately simpler than specs/025's
per-row derivation, since specs/025 only had one source kind (Worker exposure) to reason about in
detail; Overview's inbox spans seventeen.

## §5. Exposure-over-time trend — bounded to ~2 queries per source, not 238

Naively running `changes.ts`'s existing "latest per entity as of a cutoff" query once per
(day × source) pair is 14 × 17 = 238 D1 round trips per page load — unacceptable (spec.md FR-011).

**Decision**: **one query per source** fetches every row from the last 14 days
(`WHERE evaluated_at >= ?` bound to `now - 14d`, ordered ascending) plus **one seed query per
source** reusing `changes.ts`'s existing `buildLatestPerEntityQuery(source, true)` bound to exactly
`now - 14d` (the state at the window's start, for entities not re-evaluated since before the
window — necessary for correctness on an account whose scan history is older than 14 days but where
a given entity hasn't changed recently enough to have a row inside the window). That's **2 queries
per source, 34 total** — the same order of magnitude as this page's other endpoints already run
across the seventeen sources (`summary.ts`/`changes.ts` each already do 17), not a new order of
magnitude of D1 load.

The day-by-day bucketing itself happens **in Worker JS, once, in memory**: seed a per-entity
"current status" map from the seed query, then replay the window's rows in ascending timestamp
order, updating the map as each row is encountered and snapshotting a status tally at each of the
14 UTC-midnight day boundaries as it's crossed. This turns an O(days × sources × entities) query
plan into an O(sources) query plan with O(rows-in-window) in-memory work — the actual heavy lifting
moves from D1 round trips (slow, has per-query overhead) to Worker CPU time (fast, already budgeted
for a single request).

A day boundary with no seed data and no rows yet observed for a given source (account is younger
than that day) contributes no entities for that source on that day — surfaced client-side as an
explicit "no data" day (FR-010) once **every** source has nothing for that day, not per-source
(a source with a shorter history than another shouldn't blank the whole day if other sources do have
data for it).

**Rejected alternative**: a new scheduled job that snapshots daily totals into a dedicated table.
Rejected per the user's explicit choice (this session, before drafting) — real data computed
on-the-fly, no new snapshot infrastructure, accepting the bounded-but-nonzero query cost above as
the tradeoff.

## §6. Testing

Extends the existing `tests/e2e/overview.spec.ts` with header-context, findings-row-reason,
multi-rescan, and trend-chart scenarios. The trend endpoint's day-bucketing logic
(seed + window replay) is exercised with a dedicated unit test
(`tests/unit/audit-trend.test.ts`, following the existing `audit-*` unit test convention already
used for `summary.ts`/`changes.ts`-adjacent logic) rather than only through e2e mocks, since its
correctness (seeding, day-boundary snapshotting, missing-data handling) is meaningfully complex
arithmetic worth unit-level coverage, consistent with this project's Definition of Done.
