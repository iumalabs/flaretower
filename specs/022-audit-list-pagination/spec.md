# Feature Specification: Audit List Pagination

**Feature Branch**: `022-audit-list-pagination`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Add server-side pagination to the two remaining unbounded list
endpoints that spec 020-list-pagination left out of scope: the unified cross-module alerts inbox and
the cross-module 'what changed' feed. Both are D1-backed aggregation queries across every module's
own findings/alert tables, currently returned in full with no limit/offset, sort, or page controls.
Two consumers: (1) Audit & Drift's 'Unified alerts inbox' and 'What changed' tabs, both of which
already use the shared findings-table component but without pagination wired up; (2) the Overview
page's own 'prioritized findings' alerts list and 'recent activity' changes list, which currently
render every row from these same two sources with no bound at all. Confirmed with the project owner:
Overview should NOT gain full pager controls — it stays a bounded, capped view (top N,
most-severe-first) with a clear 'N more, see full list' indicator when the true total exceeds what's
shown, linking to Audit & Drift's own (now-paginated) tabs for the complete list; only Audit &
Drift's tabs get real page/prev/next pagination controls. Must not break the existing
acknowledge-alert action, used from both pages — acknowledging a row removes it from the
currently-displayed list/page client-side, consistent with today's behavior."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Audit & Drift's alerts and changes tabs never silently truncate (Priority: P1)

An operator on an active account opens the Unified alerts inbox or What changed tab on Audit &
Drift. Today, every outstanding alert or every status change across every module is rendered in one
unbounded table — on a large or noisy account this becomes a very long single page. The operator
needs the same page/sort controls the other tabs on this page and the six module dashboards already
have, so the table stays usable and nothing is silently missing.

**Why this priority**: This closes the exact same "unbounded list" gap spec 020 fixed everywhere
else — these two tables are the last ones on the whole site still rendering everything at once.
Without this, the page/sort controls already present on every sibling tab (Audit log, and every tab
on the other three tabbed pages) look inconsistent, and a genuinely large alert/change volume is
just as unusable here as it was on the six dashboards before spec 020.

**Independent Test**: Load Audit & Drift with more outstanding alerts (or changes) than fit on one
page; confirm a page footer appears, showing current page and total, and paging/sorting works
exactly like every other paginated table on the site.

**Acceptance Scenarios**:

1. **Given** more outstanding alerts than fit on one page, **When** the operator opens the Unified
   alerts inbox tab, **Then** only the first page's worth renders, with a page footer showing the
   true total and total page count.
2. **Given** the same over-one-page condition on What changed, **When** the operator pages forward,
   **Then** different rows appear and paging behaves identically to every other paginated table on
   the site (disabled-prev on page 1, disabled-next on the last page).
3. **Given** either table sorted by a column, **When** the operator moves to another page, **Then**
   row order is a true continuation of the full sorted set, not re-sorted within just that page.
4. **Given** a result set that fits on one page, **When** the tab is opened, **Then** it renders
   exactly as it does today — no pager, no behavior change (matches every other paginated table's
   FR-004 precedent from spec 020).

---

### User Story 2 - Overview stays a fast, bounded glance, not a full table (Priority: P2)

An operator opens Overview to answer "is anything wrong right now" before deciding where to go next.
Today its alerts and recent-activity lists render every row unbounded, same as Audit & Drift's
tables did before this feature. Once fixed, Overview shows a short, prioritized top slice of each
list with a clear count of anything not shown, and a way to reach the full list.

**Why this priority**: Valuable and closes the same underlying gap, but Overview's own scannability
matters more than this specific fix's urgency — an operator glancing at Overview is not blocked the
way someone trying to page through a genuinely long Audit & Drift table would be. Depends on User
Story 1 existing (the "full list" Overview links to).

**Independent Test**: Load Overview with more alerts (or changes) than the bounded top-N shows;
confirm exactly N rows render, a "N more — see full list" indicator names the true remaining count,
and it links to Audit & Drift's now-paginated tab.

**Acceptance Scenarios**:

1. **Given** more outstanding alerts than Overview's bounded slice size, **When** the operator opens
   Overview, **Then** only the top-N (by existing severity ordering) render, with an explicit count
   of how many more exist and a link to the full Unified alerts inbox tab.
2. **Given** the same over-the-slice condition for recent activity, **When** the operator opens
   Overview, **Then** the same bounded-plus-indicator treatment applies, linking to What changed.
3. **Given** the total number of alerts/changes is within Overview's slice size, **When** the
   operator opens Overview, **Then** no "more" indicator appears — matches today's behavior exactly.

---

### Edge Cases

- What happens to the acknowledge-alert action once a table is paginated? Acknowledging a row
  removes it from the currently-displayed page/slice immediately (client-side), same as today — it
  does not force a re-fetch or jump the operator to a different page. On Audit & Drift, if
  acknowledging empties the current page but earlier alerts still exist, the table is left showing
  the now-shorter page rather than auto-navigating elsewhere (consistent with how paginated tables
  elsewhere on the site already behave when a row's status changes out from under the current
  filter).
- What happens on Overview specifically when acknowledging the last row currently shown drops the
  visible count below N, while more unacknowledged alerts exist beyond the top-N? The "N more" count
  updates to reflect the new remaining total; Overview does not backfill the freed slot from the
  next page inline, since Overview does not maintain its own paging state (User Story 2) — the row
  is simply removed as it is today, and the "N more" number decreases by one instead of by whatever
  was removed if that row happened to be within the counted-but-hidden set. (Overview never
  re-fetches on acknowledge today; this feature doesn't change that.)

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The Unified alerts inbox and What changed tabs on Audit & Drift MUST support
  server-side pagination — page/page_size query parameters, a page footer showing current page and
  true total, and prev/next controls — matching the existing pattern used by every other paginated
  table on the site (spec 020-list-pagination).
- **FR-002**: Both tabs MUST support server-side sorting by at least one column, with sort order
  applying across the whole result set (a later page continues the same sort), not just the
  currently-loaded page.
- **FR-003**: A result set that fits on one page MUST render with no pager and no behavior change
  from today, on both tabs (spec 020's FR-004 precedent).
- **FR-004**: Overview's alerts list and recent-activity list MUST each show a bounded, fixed-size
  top slice, most-severe-first (matching the alerts list's existing client-side severity ordering;
  the changes list gains the same severity-first default, since it has no timestamp field to sort by
  recency with — see research.md), rather than every matching row.
- **FR-005**: When the true total for either of Overview's lists exceeds what's shown, Overview MUST
  display an explicit count of how many more exist, distinct from silently showing a partial list as
  if it were complete.
- **FR-006**: Overview's "more" indicator MUST link to the corresponding now-paginated Audit & Drift
  tab, so the operator can reach the complete list.
- **FR-007**: Overview MUST NOT gain page/prev/next controls of its own — it stays a single bounded
  view, not a paginated one.
- **FR-008**: Acknowledging an alert MUST continue to remove it from whichever list/page it's
  currently visible in (Audit & Drift's current page, or Overview's top slice), without forcing a
  page jump or a full re-fetch, on both pages.
- **FR-009**: An invalid page/page_size/sort_key/sort_dir value MUST be rejected with a clear error
  rather than silently falling back to a default (spec 020's existing validation convention).

### Key Entities

- **Unified alert**: An existing entity (spec 018-audit-dashboard) — one row per outstanding,
  unacknowledged status-change alert across every module. This feature changes only how many are
  retrieved and shown at once, not what an alert contains.
- **Change entry**: An existing entity (spec 018-audit-dashboard) — one row per entity whose status
  changed within the observed window, across every module. Same scope of change as above.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On an account with more outstanding alerts (or changes) than fit on one page, every
  one is reachable via Audit & Drift's paginated tabs — none silently missing, matching spec 020's
  original guarantee for the six module dashboards.
- **SC-002**: Overview continues to answer "is anything wrong" in a fixed, small amount of reading
  regardless of account size — its two lists never grow past their bounded top-N, even on an account
  with hundreds of outstanding alerts.
- **SC-003**: An operator who needs the complete alerts or changes list reaches it from Overview in
  one click (the "more" indicator's link), no manual navigation guesswork.
- **SC-004**: Acknowledging an alert from either page behaves identically to today — zero regression
  in that existing flow.

## Assumptions

- Overview's bounded top-N slice size is a small, fixed number consistent with its existing "glance"
  role — the exact number is an implementation detail (data-model.md / plan.md), not a product
  decision requiring its own clarification, since any reasonable small value (e.g. 5-10) satisfies
  "fast glance" equally well.
- This feature adds no new entities or Cloudflare API calls — both endpoints are already D1-backed,
  fully aggregated per-request; pagination is a query-shape change only, reusing spec 020's existing
  shared pagination helper and the shared table component's existing pagination mode.
- Sortable columns on both tabs mirror whatever columns are already sortable today in their
  client-side (unpaginated) rendering — this feature moves sorting server-side, it doesn't add or
  remove which columns can be sorted.
