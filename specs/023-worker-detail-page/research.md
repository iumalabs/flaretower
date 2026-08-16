# Phase 0 Research: Worker Detail Page

## §1. Routes/hostnames + exposure status per Worker — already there, just needs worker-scoping

`worker/modules/workers-access-exposure/routes.ts`'s `GET /inventory` already reads
`exposure_findings` for the latest `run_id` and groups rows by `worker_name`, returning
`{ hostname, kind, status, reason }` per hostname — exactly User Story 1/FR-002's shape. It
currently returns every Worker at once (the Exposure inventory page's own need). The detail
endpoint needs the same query narrowed with `AND worker_name = ?`, reusing the identical
`FindingRow` shape and the same `NO_HOSTNAMES_MARKER_HOSTNAME` handling for FR-007 (zero-route
Workers) — no new classification logic, per spec.md's assumptions.

**Decision**: add `getWorkerHostnames(db, workerName)` to
`worker/modules/workers-access-exposure/inventory.ts` (or a small new file in that module) — same
query as `GET /inventory`'s handler, `WHERE run_id = ? AND worker_name = ?`. A Worker present in
no row of the latest run (not even the no-hostnames marker) is FR-008's not-found case.

## §2. Effective Access policy per route — reason text embeds app IDs, but that's the wrong layer to depend on

`worker/modules/workers-access-exposure/evaluate.ts`'s `evaluateHostname()` already knows which
Access application(s) cover a hostname (`findCoveringApps()`) — but only surfaces that as IDs
concatenated into the human-readable `reason` string (`` `covered by Access application(s):
${covering.map(a => a.id).join(", ")}` ``, and a differently-shaped string for the `warning` case).
Parsing app IDs back out of that sentence would work today, but ties this feature to the exact
wording of copy that has no reason to stay stable — a future rewording of `evaluate.ts`'s reason
strings (plausible; they're user-facing copy, not a contract) would silently break this feature
with no type error to catch it.

**Decision**: make the covering-app-IDs relationship structured instead of text-embedded.
`HostnameEvaluation` gains a `coveringAppIds: string[]` field (populated in the same
`findCoveringApps()` call `evaluateHostname()` already makes — no new Access API call, no new
matching logic, just also returning the IDs it already computed instead of only formatting them
into a sentence). `exposure_findings` gains a `covering_app_ids TEXT` column (JSON array, nullable
— same pattern as migration 0010's `referenced_group_ids` on `zt_app_findings`) via a new
migration, written by `runEvaluation()` alongside the existing columns.

Reading the policy itself then reuses `zero-trust`'s **already-persisted, already-humanized**
`zt_app_findings.policy_rules_json` (`worker/modules/zero-trust/rule-humanizer.ts`'s output,
computed once per Zero Trust evaluation run, per migration 0010) — the detail endpoint joins this
Worker's routes' `covering_app_ids` against the latest `zt_app_findings` run
`WHERE app_id IN (...)`. No new humanization logic; this is the exact same plain-language policy
text the Zero Trust page's own policy-detail panel already renders for the identical application.

**Alternatives considered**:
- *Parse app IDs from the persisted `reason` string* — rejected per above (fragile, no compile-time
  guarantee the format stays parseable).
- *Live-refetch Access applications at read time and re-run `hostnameCoveredByAppDomain()`* —
  works without a migration, but adds a Cloudflare API call this page doesn't otherwise need
  (routes/hostnames and the policy text are both already fully computed and persisted by two
  other modules' own evaluation runs) and reintroduces exactly the kind of duplicated-evaluation-
  logic Principle III warns against — two independent places deciding "does this app cover this
  hostname."
- *Skip the join entirely, show only `reason` as free text* — considered but rejected: FR-003
  explicitly requires the same plain-language rule breakdown Zero Trust shows, not a repeat of the
  same one-line reason Exposure inventory already shows today (that's not new information, and
  wouldn't justify a dedicated detail page).

## §3. Recent changes scoped to one Worker — corrects a mismatch in the original feature description

Two different "recent changes" mechanisms exist in this codebase, and the initial feature
description (issue #413 discussion) conflated them:

1. `worker/modules/audit/changes.ts`'s `computeChanges()` — a D1-only status-*transition* digest
   across all 6 evaluated modules (`{ module, kind, entityLabel, previousStatus, currentStatus }`,
   no actor/timestamp/action-description). This is what Audit & Drift's "What changed" tab and
   Overview's "recent activity" list show.
2. `worker/modules/workers-dashboard/audit-log.ts`'s `fetchAccountAuditLog()` — a live call to
   Cloudflare's own Audit Logs API (7-day window), filtered to Workers-relevant entries via
   `filterWorkersRelevant(entries, knownWorkerHostnames)`. Each entry has `occurred_at`, `actor`,
   `actor_source`, `action`, `target`, `result_summary` — real actor/action prose. This is what the
   Workers dashboard's own "Recent changes" panel shows today, and it's what the design mockup's
   Worker-detail "Recent changes" list actually matches visually (actor · source · time, one-line
   action description) — not `computeChanges()`'s bare status-transition shape.

**Decision**: reuse mechanism 2, not 1. The detail endpoint calls `fetchAccountAuditLog()` itself
and filters with a generalized version of `filterWorkersRelevant` narrowed to this one Worker's
own hostname set (a strict subset of what `buildWorkersDashboard()` already computes as
`knownWorkerHostnames` for the whole account — same filter, tighter set). This is one additional
live Cloudflare API call per detail-page load, exactly matching the cost profile of visiting Audit
& Drift's own "Audit log" tab or the Workers dashboard itself — not a new category of cost this app
doesn't already pay elsewhere.

**Correction during implementation**: this section originally said "same 7-day window ... already
established by both the Workers dashboard and Audit & Drift's own `/log` endpoint" — checking both
call sites directly, that's only true of Audit & Drift's `/log` (`SEVEN_DAYS_MS`,
`worker/modules/audit/routes.ts`). `buildWorkersDashboard()` actually calls
`fetchAccountAuditLog()` with a 24-hour window, not 7 days. Went with 7 days for the detail page —
a dedicated per-Worker drill-down page reads more naturally with the fuller history depth of Audit
& Drift's own equivalent view than with the dashboard panel's terser 24-hour snapshot.

`filterWorkersRelevant` is generalized to accept any `Set<string>` of hostnames (today it's always
called with the full-account set) rather than being rewritten — the existing call site in
`buildWorkersDashboard()` is unaffected.

## §4. Environment classification, "Open in Cloudflare" link

- Environment (production/preview) reuses `classify.ts`'s existing `classifyEnvironment()` on this
  Worker's hostname kinds — same function `buildWorkersDashboard()` already calls, no new logic.
- FR-009's outbound link needs `CF_ACCOUNT_ID` (already an available binding, per every other
  module's live Cloudflare API calls) and the Worker's name — assembled as a plain
  `https://dash.cloudflare.com/{account_id}/workers/services/view/{worker_name}/production`-shaped
  URL (Cloudflare's own documented Workers dashboard URL scheme). No API call, no new secret, no
  audit-log entry (Principle IX doesn't apply — nothing is mutated, and clicking an outbound link
  isn't a FlareTower action to record).

## §5. Navigation — in-app state, no router

Confirmed via `app/App.tsx`: this app has no router (`specs/009-design-system-alignment`
research.md §1's decision, still current). The Workers dashboard row click sets a new piece of
state (e.g. `selectedWorker: string | null`) that `App.tsx`'s existing `page`-based switch already
has a place for — same pattern as the Overview→Audit "N more" cross-page link added in spec 022
(`onNavigateToAudit` callback threaded through as a prop). Returning to the dashboard needs to
restore its prior page/sort/filter state (FR-011) — `WorkersDashboardPage`'s `page`/`sortKey`/
`sortDir` state currently resets on remount; the fix is keeping that state one level up (in
`App.tsx`, passed down as props) rather than local to `WorkersDashboardPage`, so navigating away
and back doesn't unmount-and-lose it.
