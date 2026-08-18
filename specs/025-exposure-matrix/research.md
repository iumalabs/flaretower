# Phase 0 Research: Exposure Matrix

## §1. Row data — no backend change, pivot existing `GET /api/exposure/inventory` client-side

`GET /api/exposure/inventory` (`worker/modules/workers-access-exposure/routes.ts:192-231`) already
returns `{ run_id, evaluated_at, workers: [{ worker_name, hostnames: [{ hostname, kind, status,
reason }] }] }`, grouped by Worker, with `kind` already one of `"custom_domain" | "workers_dev" |
"preview_url"` (`types.ts`'s `HostnameKind`). This is already "one entity per Worker with its
hostnames attached" — the matrix's three entry-point columns are a pure client-side pivot: group
each Worker's `hostnames` by `kind`, one cell per kind.

**Decision**: zero backend change for row data. Same precedent as specs/024 (frontend-only reuse of
an already-correct endpoint).

## §2. Row-expand detail — reuse the just-shipped Worker Detail endpoint, not new backend logic

`GET /api/workers/:worker_name/detail` (specs/023-worker-detail-page,
`worker/modules/workers-dashboard/detail.ts`'s `buildWorkerDetail`) already returns, per Worker:
`routes: [{ hostname, kind, status, reason, policy: { app_id, app_name, app_domain, policy_rules }
| null }]` and `cloudflare_url`. This is exactly the design's ROUTES + EFFECTIVE POLICY panel data —
`policy_rules` is already the humanized `{ verb: ALLOW|REQUIRE|DENY, label }[][]` shape the design
mockup's `EFFECTIVE POLICY` panel shows in plain language.

**Decision**: the row-expand panel fetches this existing endpoint lazily, once, the first time a
row is expanded (not eagerly for all Workers on page load — would be one request per Worker for
data most rows never expand). Cache the result in component state per Worker so re-expanding the
same row doesn't re-fetch. No new backend endpoint, no change to `buildWorkerDetail`.

**Rejected alternative**: eagerly fetch every Worker's detail on page load to avoid a expand-time
loading flicker. Rejected — on an account with many Workers this is N extra requests for data most
of them will never need; a brief per-row loading state on first expand (matching this app's existing
loading-state conventions) is the better tradeoff.

## §3. Table shell — do NOT reuse `FindingsTable`; build a page-specific table

`FindingsTable` (`app/components/FindingsTable.tsx`) hardcodes the overall-status pill as a fixed
120px-wide **leftmost** column (line 219, before the caller's own `columns` render) — this is not
configurable. The design's own stated rule (confirmed consistent across the Exposure matrix,
Workers inventory, and Storage/KV/D1 mockups — GitHub issue #420 flags the same rule for Workers)
anchors status as the **rightmost** column. These are incompatible: reusing `FindingsTable` as-is
would put status back on the left, reproducing exactly the defect issue #420 reports elsewhere.

Beyond the position conflict, the matrix's column shapes also don't fit `FindingsTable`'s per-row
single-value-per-column model as cleanly: three separate entry-point badge columns plus a
bar-and-label coverage column are all renderable via `FindingsTable`'s `render()` callback in
principle, but combined with the status-position conflict, a dedicated table is the cleaner choice
here rather than bending a shared component two different ways in the same PR.

**Decision**: a new, page-specific table component for this page only. Reused as-is from the
existing design system: `ExposureStatusBadge` (entry-point and status pills), `EmptyState`,
`LoadingSkeleton`, `useRescan` + `RescanButton` (specs/024), `AlertBanner` (top-of-page banner,
unchanged per spec.md's explicit scope boundary).

**Not addressed here**: `FindingsTable`'s hardcoded-left status column is the same root cause behind
GitHub issue #420 (Workers inventory). Making the position configurable on `FindingsTable` itself
would let both pages share one component again, but that's a change to a widely-reused component
(every module dashboard depends on it) and is out of scope for this feature — noted for whoever
picks up issue #420.

## §4. Effective-policy rendering — extract the existing logic instead of duplicating it

`app/pages/WorkerDetailPage.tsx` already contains a private `RoutePolicy` component (lines 51-140ish)
that renders exactly this response shape (`policy_rules` verb/label pairs, the "no policy"
fallback distinguishing critical-with-no-coverage from a transient cross-module join miss per issue
#416) — the same rendering this feature's row-expand EFFECTIVE POLICY panel needs.

**Decision**: extract `RoutePolicy` (and its `VERB_COLOR` map) out of `WorkerDetailPage.tsx` into a
new shared `app/components/RoutePolicy.tsx`, imported by both `WorkerDetailPage.tsx` (updated import,
no behavior change) and the new Exposure matrix page. Avoids duplicating ~80 lines of policy
rendering and its issue-#416 edge-case handling.

## §5. Access-coverage summary column — computed from the inventory response already in hand

The coverage column ("1 / 3 routes", "public by design", etc.) is computed per Worker from data
already present in `GET /inventory`'s `hostnames` array (count of non-critical/non-warning hostnames
over total), not from the Worker Detail endpoint — computing it from the lazily-fetched detail
endpoint would mean fetching every Worker's detail up front just for this column, contradicting §2's
lazy-fetch decision. A Worker with zero hostnames (no HTTP routes) shows an explicit "no http routes"
label instead of a fraction (spec.md Edge Cases / FR-011).

**Decision**: `worst-status-among-hostnames` style computation, client-side, from `GET /inventory`
alone — same data source as the entry-point columns, no additional request.

## §6. Row-detail ACTIONS — visual-only, derived from existing status data (per user-confirmed scope)

Per spec.md's explicit scope boundary (confirmed with the user before drafting), the row-detail
ACTIONS panel renders controls but none call a real Cloudflare-mutating endpoint in this feature.
The design mockup's exact action labels are hand-curated per its own fictional example Workers and
don't map 1:1 onto this app's real, variable data — so the actual label set per row is derived from
that Worker's real status/kind combination via a small lookup table (e.g. a `workers_dev: "critical"`
entry-point status contributes a `"Disable workers.dev"` control; any `warning`-status hostname
contributes a `"Review"` control), not reproduced verbatim from the mockup's specific fictional
scenarios.

**One exception is real, not visual-only**: "View in Cloudflare" links out to `cloudflare_url`
(already returned by the Worker Detail endpoint, §2) — this requires no new mutation capability,
mirrors the existing "Open in Cloudflare" pattern already shipped on the Worker Detail page, and
gives every row at least one control that does something real without touching this feature's scope
boundary.

## §7. A Worker with more than one hostname of the same entry-point kind

Per spec.md Edge Cases (FR-010): the entry-point column's badge reflects the worst status among that
Worker's hostnames of that kind, with a small count indicator when there's more than one (e.g. "2
custom domains"); every individual hostname of that kind remains listed in the row's expanded ROUTES
panel (§2's data already contains every hostname, not just one per kind) — nothing is dropped, only
the closed-row cell is summarized.

## §8. "Jump to row" navigation and search — client-side only

Severity-count chips (reusing the existing critical/warning/protected/n-a counting already computed
for the current flat page) scroll the matching first row into view via a DOM ref + `scrollIntoView`,
and briefly highlight it — no new data. The search box does a case-insensitive substring match
against a Worker's name and all of its hostnames, narrowing the already-loaded row list client-side
— no new endpoint, no debounce needed given this operates on already-loaded, typically small
(tens, not thousands) result sets.

## §9. Testing

Extends the existing `tests/e2e/exposure-inventory.spec.ts` (kept at this filename — tied to the
module/route name, not the page's display title) with the matrix restructure, row-expand, jump-to-
row, and search scenarios. The specs/024 re-scan scenarios already in this file continue to apply
unchanged (re-scan behavior itself isn't changing, just its visual placement in the new toolbar).
