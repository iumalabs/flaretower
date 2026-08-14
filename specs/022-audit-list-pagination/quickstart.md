# Quickstart: Audit List Pagination

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-15

Manual validation once implemented — run `deno task dev`, log in via Access. Force pagination with a
small `page_size` if the real account doesn't naturally have enough outstanding alerts/changes to
exceed one page or the top-5 slice (same trick spec 020's own quickstart used).

## Scenario 1 — Audit & Drift's alerts/changes tabs paginate (User Story 1)

1. Open Audit & Drift, Unified alerts inbox tab. If fewer than one page's worth of alerts exist,
   append `?alerts_page_size=...`-equivalent forcing (or temporarily lower `page_size` via the
   route) to exceed one page.
2. Confirm a page footer appears with the true total and total pages; page forward; confirm
   different rows appear and boundary controls (disabled prev on page 1, disabled next on the last
   page) behave like every other paginated table.
3. Sort by a column, page forward; confirm row order is a true continuation of the full sort.
4. Repeat 1-3 on What changed.
5. Confirm a result set that fits on one page shows no pager on either tab (unchanged from before
   this feature).

## Scenario 2 — Overview stays bounded (User Story 2)

1. With more than 5 outstanding alerts, load Overview. Confirm exactly 5 render, most-severe-first,
   and a "N more — see full list" indicator shows the correct remaining count.
2. Click the indicator's link; confirm it lands on Audit & Drift's Unified alerts inbox tab.
3. Repeat for the recent-activity/changes list and What changed.
4. With 5 or fewer alerts (or changes), confirm no "more" indicator appears.

## Scenario 3 — Acknowledge still works correctly (Edge Cases)

1. On Audit & Drift's Unified alerts inbox (any page), acknowledge a critical alert. Confirm it's
   removed from the currently-displayed page immediately, with no forced page jump or reload.
2. On Overview, acknowledge a row from the top-5 slice. Confirm it's removed and the "N more" count
   decreases by one (if it was greater than zero before).
