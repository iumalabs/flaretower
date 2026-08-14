# Quickstart: List Pagination

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-14

Manual validation against a real Cloudflare account (real-account dependency, same caveat as every
prior module — left unchecked in `tasks.md` until run). Large result sets are the whole point of
this feature, so scenarios below assume an account with enough resources to exceed one page; where
that's not naturally available, temporarily lower `page_size` via the query param to force paging
with a smaller account instead of needing hundreds of real resources.

## Scenario 1 — Audit log shows every event, not just the first 100 (User Story 1)

1. Open the Audit & Drift page for an account/window with more than 100 audit events (or note the
   real count if under 100 — Scenario 1b covers that case).
2. Confirm the total event count shown matches what's actually reachable, not capped at ~100.
3. Confirm every event in the 7-day window is visible/reachable, not just the first page
   Cloudflare's API would have returned on its own.
4. Apply the existing source filter (dashboard/api) — confirm it applies across the full fetched
   set, not just a visible subset.

**1b — under-cap account**: for an account with fewer than 100 events, confirm behavior is
unchanged from today (all events shown, no new UI clutter).

**1c — over-cap account** (if reachable): if the account's true event count exceeds
`AUDIT_LOG_FETCH_CAP`, confirm the UI clearly states the result is capped rather than presenting a
partial list as complete (FR-012).

## Scenario 2 — Module dashboard tables paginate (User Story 2)

Repeat for each of Workers, DNS, Storage (all 3 sub-tables), Security, Zero Trust, Pages:

1. Load the page. If the underlying result set is small, add `?page_size=5` (or the module's
   equivalent scoped param, e.g. `bucket_page_size=5` for Storage's R2 table) to the API call to
   force multiple pages without needing hundreds of real resources.
2. Confirm only one page's worth of rows renders.
3. Confirm the page footer shows current page + total pages/results.
4. Move to the next page — confirm different rows appear and the "previous" control is now enabled.
5. Move to the last page — confirm "next" is disabled/absent.
6. Sort by a sortable column, then move to page 2 — confirm row order is correct as a continuation
   of the full sorted set (e.g. sorting ascending by name, page 2's first row's name sorts after
   page 1's last row's name), not re-sorted only within page 2.

## Scenario 3 — Small result sets are unaffected (User Story 2, negative case)

1. Load a module dashboard whose real result set fits in one page (no `page_size` override).
2. Confirm it renders exactly as before this feature shipped — no pagination footer, no behavior
   change.

## Scenario 4 — Existing table behaviors survive pagination (Edge Cases)

1. On any paginated table, expand a row with detail content — confirm it still expands/collapses
   correctly.
2. Tab to a sort header using the keyboard, press Enter/Space — confirm it still sorts (now via the
   server-side path).
3. Confirm critical-status rows still show the tint + edge bar + badge treatment on every page, not
   just page 1.

## Known limitation (research.md §5)

Status-filter chips (critical/warning/protected/n/a counts) are hidden on paginated tables — their
counts would otherwise only reflect the currently-loaded page, which reads as wrong. Re-adding
true account-wide filter counts is out of scope for this feature (would need a new `GROUP BY
status` aggregation query per module).
