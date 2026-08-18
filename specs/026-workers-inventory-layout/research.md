# Phase 0 Research: Workers Inventory Layout

## §1. Status column position — extend `FindingsTable`, don't rebuild a third table

`FindingsTable` (`app/components/FindingsTable.tsx`) hardcodes the overall-status pill as a fixed
120px-wide column rendered *before* the caller's own `columns` (line ~219) — always leftmost, not
configurable today. specs/025-exposure-matrix's research.md §3 hit this exact wall and built a
one-off bespoke table rather than touch this shared component, since Exposure's column *shapes*
(entry-point badge columns, a coverage bar) didn't fit `FindingsTable`'s generic model well anyway.

Workers is different: its columns (Worker/Env/Routes/Requests 24h/Errors/CPU/Last deploy) are
already exactly what `FindingsTable`'s `columns` prop already renders today via
`app/pages/WorkersDashboardPage.tsx`'s existing `COLUMNS` array — the *only* thing wrong is the
status pill's position, not its shape or the shape of any other column. Duplicating the entire
table shell (pagination, sort, expand-row wiring) a third time just to move one column is the wrong
tradeoff here, especially now that this is a *recurring* requirement (Exposure, Workers, and the
design's own Storage/KV/D1 mockups per specs/025's research all want status anchored right).

**Decision**: add an optional `statusPosition?: "left" | "right"` prop to `FindingsTable`, default
`"left"` (current behavior, unchanged for every existing caller). When `"right"`, the status pill
column renders after the caller's `columns` instead of before them — everything else (pagination,
sort, filter chips, expand-row, keyboard handling) is identical regardless of position, so this is a
small, localized change: move the status-column JSX block behind a conditional, not a rewrite.
`WorkersDashboardPage.tsx` passes `statusPosition="right"`; every other current caller (DNS, Storage,
Security Posture, Zero Trust, Pages, Audit) omits the prop and is provably unaffected (default
preserves current output exactly).

**Rejected alternative**: a fourth bespoke table component (following specs/025's Exposure
precedent literally). Rejected — Workers' columns already fit `FindingsTable`'s existing model
perfectly; duplicating pagination/sort/expand logic a third time for a single-column reposition
is unjustified duplication the codebase's own simplification conventions argue against.

## §2. Header subtitle counts — one small, safe backend addition; environment count needs none

The design's subtitle format is "{deployed} deployed · {routes} routes · {environments}
environments." `buildAccountSummary()` (`worker/modules/workers-dashboard/routes.ts:156-190`) is
already called with the *complete*, unpaginated `workers: WorkerDashboardRow[]` array (pagination is
applied later, to the response's `workers` field, not to what's passed into summary-building) — so
it already has everything needed to compute an account-wide (not just current-page) route total
cheaply, in memory, no new Cloudflare API call.

**Decision**: add `totalRouteCount: number` to `AccountSummary`
(`worker/modules/workers-dashboard/types.ts`), computed in `buildAccountSummary()` as
`workers.reduce((sum, w) => sum + w.routeCount, 0)`. This is the only backend change in this
feature — one field, one pure sum over data already in memory, no new query, no new scope.
Environment count needs no new field: `deployedByEnvironment` (already returned) already tells the
frontend how many of the two possible environments are actually present — `Object.values(...).
filter(n => n > 0).length` client-side.

## §3. Search and environment filter — client-side, matching this page's existing pagination boundary

Per spec.md's Edge Cases (confirmed reasonable given this page already paginates server-side): both
the Worker-name search and the environment filter operate on the currently-loaded page's rows only,
narrowing what's already fetched — no new query parameters, no change to
`GET /api/workers/dashboard`'s existing `page`/`sort_key`/`sort_dir` params. Same client-side
narrowing pattern specs/025's Exposure matrix search already established for this codebase.

**Rejected alternative**: server-side search/filter (new `q`/`environment` query params reaching into
un-loaded pages). Rejected as needless scope for this presentation-focused feature — every other
recently-added client-side search in this app (specs/025) already sets the precedent that
in-page narrowing is normal and expected, and the account sizes this page targets (tens of Workers,
matching design's "15 deployed") don't need cross-page search to be usable.

## §4. "DEPLOY LOG" control — surface the existing Recent changes panel, not a new feature

The design's own reference screen doesn't specify what clicking "DEPLOY LOG" does (it's a static
mockup) — but this page already computes and displays deploy-relevant recent activity via its
existing `RecentChangesPanel` (fed by `recentChanges`, already filtered to Workers-relevant audit
entries). Inventing a second, separate "deploy log" feature would duplicate that data path for no
reason.

**Decision**: the header control scrolls/brings the existing Recent changes panel into view (a
`scrollIntoView` on an anchor, same technique specs/025 used for jump-to-row) — reusing already-
rendered, already-correct data. No new panel, no new fetch, no new backend field.

## §5. CPU P99 tile's missing context line

The other three tiles' context lines each explain *how* the number was derived or add trend context
(`"across 2 environments"`, `"+11% vs yesterday"`, `"924 errors"`) — genuine derived facts, not
decoration. This app has no `cpu_avg_ms` or plan-dependent CPU-limit figure to honestly compare
against (a fabricated "limit 50ms" would misrepresent Cloudflare's actual, plan-dependent CPU time
limit, which this app doesn't currently look up).

**Decision**: a purely descriptive (not fabricated-data) context line explaining what "P99" means —
`"slowest 1% of requests"` — matching the other tiles' pattern of adding genuine interpretive value
without inventing a number this app doesn't have. `MetricCard` already supports a `context` prop
(`app/components/MetricCard.tsx`) — this is a one-line change at the CPU P99 `<MetricCard>` call
site, no component change needed.

## §6. "Recent changes" panel — confirmed already correct, explicitly not touched

Direct inspection of `app/pages/WorkersDashboardPage.tsx`'s `RecentChangesPanel` before drafting:
its header text is the literal string `"Recent changes"` with no `textTransform: uppercase` applied
anywhere in its style object — it does not render as "RECENT CHANGES." And its presence on this page
is explicitly required by specs/012-workers-dashboard's own FR-008 (a deliberate, already-approved
requirement, not scope creep). GitHub issue #420's claims about this panel don't hold up against the
current codebase — both are recorded here so this doesn't get "fixed" again by a future pass that
trusts the issue text over the code.

## §7. Testing

Extends the existing `tests/e2e/workers-dashboard.spec.ts` with column-order, header-toolbar
(subtitle/description/search/environment-filter/deploy-log-scroll), and CPU P99-context scenarios.
A regression scenario confirms at least one other `FindingsTable`-using page (e.g. DNS) is
byte-for-byte unaffected in status-column position, per FR-002/SC-002.
