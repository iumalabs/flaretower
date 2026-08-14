# Feature Specification: List Pagination

**Feature Branch**: `020-list-pagination`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Add pagination to long list/table pages across FlareTower. Currently no page has pagination: the Audit log fetches a single Cloudflare Audit Logs API page (per_page=100, no cursor follow-up) and silently drops anything beyond 100 events in the 7-day window with no UI indication; DNS, Workers, Storage (R2/KV/D1), Security, Zero Trust, and Pages dashboards all render their full D1 result set in one unbounded table with no page controls, "load more", or limit/offset. Need real pagination (or equivalent, e.g. cursor-following for the Audit log's Cloudflare API source) so large accounts don't get silently truncated data or unusably long single-page tables. Note: specs/016-storage-dashboard deliberately chose NOT to paginate Cloudflare's KV key-listing API for cost reasons (hundreds of paginated calls) — that non-goal should stay as-is; this feature is about pagination of already-fetched/stored findings data, not about fetching more from Cloudflare's KV API."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Audit log shows every event in the window, never a silent subset (Priority: P1)

An operator investigating "what changed in our Cloudflare account recently" opens the Audit log
page for an account with more account activity than fits in one Cloudflare API page. Today, the
page silently shows only the first ~100 events with no indication that more exist — an operator
could conclude "nothing else happened" when in fact dozens of changes are simply not shown. This
is a security-relevant blind spot: the Audit log is the tool an operator reaches for after
something goes wrong.

**Why this priority**: Silent data loss on a security/audit surface is a correctness bug, not a
UX inconvenience — it's the single highest-severity gap this feature closes.

**Independent Test**: Can be fully tested by pointing the Audit log at an account/window with more
than 100 events and confirming every event in the window is reachable (directly or by paging),
with the total count always visible.

**Acceptance Scenarios**:

1. **Given** an account with more than 100 audit events in the selected time window, **When** an
   operator opens the Audit log, **Then** the page shows the true total event count and provides a
   way to reach every event, not just the first 100.
2. **Given** an account with fewer than 100 audit events in the selected window, **When** an
   operator opens the Audit log, **Then** all events are shown with no unnecessary paging controls
   or empty "next" affordances.
3. **Given** an operator has paged/loaded partway through a long Audit log, **When** they apply an
   existing filter (source: dashboard/api), **Then** the filter applies to the full event set, not
   only the portion already loaded.

---

### User Story 2 - Long module dashboard tables stay usable at any account size (Priority: P2)

An operator with a large Cloudflare account (hundreds of DNS records, dozens of Workers, many R2
buckets/KV namespaces/D1 databases, many zones, many Access applications, many Pages projects)
opens any of the six module dashboards. Today each renders every row in one unbroken table —
usable at small scale, but an unusably long single page at large scale (excessive scrolling, no
sense of how much data exists).

**Why this priority**: This is the broader usability problem named in the request, affecting six
existing pages, but — unlike User Story 1 — it's a degraded experience, not silently wrong data.

**Independent Test**: Can be fully tested by loading each of the six module dashboards with a
result set large enough to exceed one page and confirming the table paginates instead of rendering
every row at once.

**Acceptance Scenarios**:

1. **Given** a module dashboard (DNS, Workers, Storage, Security, Zero Trust, or Pages) whose
   result set exceeds one page, **When** an operator opens that page, **Then** only one page of
   rows renders at a time, with a way to reach the rest.
2. **Given** a module dashboard whose result set fits on one page, **When** an operator opens that
   page, **Then** it behaves exactly as it does today — no pagination controls appear for a small
   result set.
3. **Given** a table with an active sort column, **When** an operator moves to a different page,
   **Then** row order remains correct across the whole sorted result set (page 2 continues where
   page 1 left off, not re-sorted only within the current page).

---

### User Story 3 - Operators always know where they are and how much data exists (Priority: P3)

While viewing any paginated table, an operator can see the current page position and the total
number of results, and can move between pages, without needing to count rows or guess whether more
data exists off-screen.

**Why this priority**: This is the shared UI mechanic underlying Stories 1 and 2 — necessary for
both to feel complete, but it's a refinement of "pagination exists" rather than a new capability of
its own, so it ranks after the two data-correctness/usability stories it supports.

**Independent Test**: Can be fully tested by loading any paginated table and confirming the current
page, total pages/results, and forward/backward navigation are all visible and operable without
consulting any other page or data source.

**Acceptance Scenarios**:

1. **Given** a paginated table, **When** an operator views it, **Then** the total result count and
   current page position are visible at all times.
2. **Given** an operator is on the last page of results, **When** they look for a "next" control,
   **Then** it is visibly disabled or absent, not silently broken.
3. **Given** an operator is on the first page of results, **When** they look for a "previous"
   control, **Then** it is visibly disabled or absent, not silently broken.

### Edge Cases

- What happens when a table's underlying result set is empty (zero findings, e.g. a freshly
  evaluated account with nothing to report)? Pagination controls MUST NOT appear, and the existing
  empty-state treatment MUST be unchanged.
- What happens when a new evaluation run completes (new findings/records replace the previous run)
  while an operator is on a page beyond the new result set's page count? The view MUST recover to a
  valid page rather than showing a blank or errored page.
- What happens when an operator has an existing sort or filter active and moves between pages? Sort
  and filter MUST continue to apply across the entire result set, not reset or apply only within
  the currently-loaded page (Story 2, Scenario 3).
- What happens to existing keyboard operability and row-expansion behavior (added for accessibility
  per the shared `FindingsTable` component) once pagination is introduced? Both MUST continue to
  work unchanged on every page.
- What happens when the Audit log's underlying Cloudflare account has an extremely large amount of
  activity in the selected window (far beyond a few hundred events)? The backend fetches up to a
  defined safe cap and stops — it MUST NOT attempt to retrieve unbounded history in one request —
  and the UI MUST clearly show that the result was capped rather than presenting it as complete
  (FR-012).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Audit log MUST make every event within the selected time window reachable by an
  operator — no event may be dropped from view solely because it fell outside a single fixed-size
  API response, with no equivalent way to reach it.
- **FR-002**: The Audit log MUST display the true total count of matching events up to the backend
  fetch cap (FR-012), not just the count of events currently rendered on screen, so an operator can
  always tell whether more exist within that cap.
- **FR-003**: Each of the six module dashboard tables (DNS, Workers, Storage, Security, Zero Trust,
  Pages) MUST paginate its result set once that result set exceeds one page's worth of rows, rather
  than rendering the entire result set in a single unbroken table.
- **FR-004**: A module dashboard table whose result set fits within one page MUST render exactly as
  it does today, with no pagination controls shown.
- **FR-005**: Operators MUST be able to move forward and backward through a paginated table's
  results and MUST be able to see their current position (e.g. current page and total
  pages/results).
- **FR-006**: Existing sort behavior on a paginated table MUST operate over the table's entire
  result set, not only the rows on the currently displayed page.
- **FR-007**: Existing table behaviors — status badges, row expansion, and keyboard operability —
  MUST continue to work unchanged on every page of a paginated table.
- **FR-008**: If the underlying result set changes size (e.g. a new evaluation run) such that an
  operator's current page no longer exists, the view MUST recover to a valid page rather than
  showing a blank, out-of-range, or errored state.
- **FR-009**: Pagination of module dashboard result sets MUST cover only data already
  fetched/stored by FlareTower (D1-persisted findings); it MUST NOT change what is fetched from
  Cloudflare's own APIs. In particular, the Storage dashboard's existing decision not to
  paginate Cloudflare's KV key-listing API (specs/016-storage-dashboard) is unaffected by this
  feature and remains out of scope.
- **FR-010**: Module dashboard tables MUST paginate server-side: each request for a page of
  results MUST return only that page's rows plus the total result count, not the entire result
  set. The full result set MUST NOT be transferred to the browser in one response once it exceeds
  one page.
- **FR-011**: The Audit log MUST retrieve events beyond Cloudflare's single-page limit by having
  the backend follow Cloudflare's own pagination cursor itself, up to a defined safe cap, and
  return the combined result as one response — an operator MUST NOT need to take a manual action
  (e.g. "load more") to see events within the cap.
- **FR-012**: If the Audit log's true event count for the selected window exceeds the backend's
  defined safe fetch cap, the system MUST clearly indicate that the shown result is capped (not
  silently present a partial set as if it were complete) — consistent with this project's existing
  "no silent caps" convention (e.g. the Workers dashboard's analytics truncation indicator).

### Key Entities

This feature does not introduce new persisted data. It adds a pagination boundary — page
number/cursor and page size — around two already-existing kinds of data:

- **Finding row**: an existing DNS/Workers/Storage/Security/Zero Trust/Pages record as already
  persisted in D1 by that module's own evaluation logic. Pagination selects a subset of these for
  display; it does not change what a finding row contains.
- **Audit log entry**: an existing Cloudflare account-activity event as already returned by the
  Cloudflare Audit Logs API integration built in specs/012-workers-dashboard and reused by
  specs/018-audit-dashboard. Pagination changes how many of these are retrieved and when, not
  their shape.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator viewing the Audit log for a window with more than 100 events can reach
  100% of those events up to the backend's defined safe fetch cap — none are permanently hidden by
  a single-API-page limit, and if the true count exceeds the cap, the operator is clearly told so
  rather than being shown a partial result as if it were complete.
- **SC-002**: Every module dashboard table remains fully usable (renders in a bounded amount of
  time, does not require excessive scrolling to reach the end of the visible page) regardless of
  how large the underlying account's result set is.
- **SC-003**: On every paginated table, an operator can state the total number of results and their
  current position without consulting any source outside that page.
- **SC-004**: Existing table behavior (sorting, keyboard operability, row expansion, empty states)
  shows zero regressions after pagination ships, verified by the existing Playwright coverage for
  each affected page continuing to pass unmodified in intent.

## Assumptions

- Module dashboard tables paginate server-side (FR-010): each page request returns only that
  page's rows plus the total count, rather than the browser continuing to receive the full result
  set and slicing it locally.
- The Audit log's backend follows Cloudflare's own pagination cursor itself, up to a defined safe
  cap, and returns one combined response (FR-011) rather than requiring an operator-driven "load
  more" action; exceeding that cap is surfaced explicitly, never silently (FR-012).
- A single default page size is used across all six module dashboard tables; operators do not need
  a per-page-size control for this feature to deliver its value. (If real usage later shows a
  strong need to customize page size, that is follow-up scope, not part of this feature.)
- The Audit log's existing filters (source: dashboard/api) and JSONL export continue to operate
  exactly as they do today; this feature changes how many events are reachable and how, not the
  existing filter/export behavior.
- "Long page" for the six module dashboards means the number of rows already persisted in D1 for
  the latest evaluation run — this feature does not change evaluation frequency, what gets
  evaluated, or the underlying data collected by each module.
- No new user-facing role/permission is introduced — pagination controls are available to any
  operator who could already view the page today.
