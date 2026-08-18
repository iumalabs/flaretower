# Feature Specification: Workers Inventory Layout

**Feature Branch**: `026-workers-inventory-layout`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "Bring the Workers inventory page in line with the FlareTower identity spec Claude Design project, section 08 'Workers' — closing GitHub issue #420. Presentation-layer fix only: exposure/status column moves to the rightmost position (matching the design's stated anchor rule, via a backward-compatible opt-in change rather than a page-specific table rebuild), a missing header toolbar (subtitle, description, Worker-name search, environment filter, and a control surfacing deploy-relevant recent activity) is added, and the CPU P99 metric tile gets a subtitle to match the other three tiles' established pattern. The existing 'Recent changes' panel is explicitly confirmed correct as-is (already required by specs/012's own FR-008, already correctly cased) and is out of scope."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan status at a glance, consistent with every other module (Priority: P1)

An operator scanning the Workers inventory table wants exposure/status to be the last thing their eye lands on for each row — reading operational facts (routes, traffic, errors, CPU, last deploy) left-to-right first, then the verdict — matching how the account is meant to be scanned across every module dashboard. Today the status column sits first, ahead of every operational fact.

**Why this priority**: This is the core, most visible layout defect (GitHub issue #420's headline finding) and the one place a genuine visual pattern (status column position) is inconsistent with the product's own stated design intent.

**Independent Test**: Open the Workers inventory page and confirm the exposure/status column is the last (rightmost) column, with every operational column (Worker, Env, Routes, Requests 24h, Errors, CPU, Last deploy) preceding it in that order — and confirm every other page's table (DNS, Storage, Security, Zero Trust, Pages, Audit) is unaffected and still shows its status column exactly where it does today.

**Acceptance Scenarios**:

1. **Given** the Workers inventory page has loaded, **When** the operator scans a row left to right, **Then** the exposure/status indicator is the last column, after every operational column.
2. **Given** any other module dashboard that uses the same underlying table component, **When** the operator views it, **Then** its status column position is unchanged from before this feature.

---

### User Story 2 - Orient on and narrow the Workers list from the header (Priority: P2)

An operator opening the Workers inventory page wants an immediate account-level summary (how many Workers, how many routes, how many environments) and a short description of what the page shows, plus a way to quickly find one specific Worker by name or narrow the list to just production (or just preview) Workers — without scrolling through the full table.

**Why this priority**: A real usability gap on accounts with many Workers, but the page is already fully functional (correct data, correct table) without it — this is an orientation/navigation improvement layered on top of User Story 1.

**Independent Test**: Open the page and confirm a subtitle and description appear under the title; type part of a Worker's name into the search box and confirm the table narrows to matches; select "Production" from the environment filter and confirm only production Workers remain visible; clear both and confirm the full list returns.

**Acceptance Scenarios**:

1. **Given** the page has loaded, **When** the operator looks at the header, **Then** a subtitle summarizing deployed count, route count, and environment count is shown, along with a one-line description of the page.
2. **Given** the operator types part of a Worker's name into the search box, **When** the input changes, **Then** the table narrows to matching Workers only, without a page reload.
3. **Given** the operator selects an environment filter other than "All", **When** the selection changes, **Then** the table shows only Workers in that environment.
4. **Given** the operator wants to see deploy-relevant recent activity, **When** they use the header's activity control, **Then** they're taken to (or shown) the same deploy-relevant recent-activity information already available on this page's existing Recent changes panel — not a new, separate data source.

---

### User Story 3 - A complete metric-tile row, not three-out-of-four (Priority: P3)

An operator glancing at the four summary tiles at the top of the page (Deployed, Requests 24h, Error rate, CPU P99) expects every tile to carry the same short context line the other three already do — today the CPU P99 tile is the one exception, showing only a bare number.

**Why this priority**: A small visual-consistency polish item — lowest impact of the three stories, since the number itself is already correct and visible.

**Independent Test**: Open the page and confirm all four metric tiles show both a value and a context line underneath it.

**Acceptance Scenarios**:

1. **Given** the page has loaded with data, **When** the operator looks at the CPU P99 tile, **Then** it shows a context line beneath the number, consistent with the other three tiles.

### Edge Cases

- What happens when the account has zero Workers? The empty state already shown today is unaffected by this feature — no toolbar controls need special-casing beyond disabling ones that would act on an empty list.
- What happens when the search box and environment filter are both active at once? Both narrow the same list together (a Worker must match the search text AND the selected environment to remain visible).
- What happens when a search narrows the list to zero matches? An explicit "no matches" state is shown, not a blank table.
- What happens on a page whose Worker list is paginated? The Worker-name search and environment filter apply to the current, already-loaded server-side page's rows, consistent with how this page's existing pagination already works — they are not expected to reach into un-loaded pages.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Workers inventory table MUST show the exposure/status indicator as its last (rightmost) column, with every operational column preceding it.
- **FR-002**: This change MUST NOT alter the status column's position on any other page that shares the same underlying table component — every other page's current layout MUST remain exactly as it is today.
- **FR-003**: The page header MUST show a subtitle summarizing the deployed Worker count, total route count, and environment count.
- **FR-004**: The page header MUST show a one-line description of what the page shows.
- **FR-005**: The page MUST offer a free-text search that narrows the visible Workers to those whose name matches, without reloading the page.
- **FR-006**: The page MUST offer an environment filter (All / Production / Preview) that narrows the visible Workers to the selected environment.
- **FR-007**: The page MUST offer a way to reach the deploy-relevant recent activity already shown in the existing Recent changes panel, reusing that same data rather than introducing a new data source.
- **FR-008**: The CPU P99 metric tile MUST show a context line beneath its value, consistent with the other three metric tiles on this page.
- **FR-009**: This feature MUST NOT change the Recent changes panel's presence, content, or casing — it is already correct per specs/012's FR-008.
- **FR-010**: This feature MUST NOT change the underlying Workers dashboard detection or aggregation logic — it is a presentation-only change to an already-correct dataset.
- **FR-011**: This feature MUST NOT introduce any new Cloudflare-mutating capability — every control added by this feature is read-only/navigational.

### Key Entities

- **Workers table column order**: The sequence in which the Workers inventory table's columns render — reordered by this feature so status is last, everywhere else on the page and product unaffected.
- **Header toolbar**: The subtitle, description, search box, environment filter, and activity control added to the page header.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the Workers inventory table's rows show their exposure/status as the last column, matching the design's stated anchor rule.
- **SC-002**: 100% of other pages sharing the underlying table component show zero change in status column position (regression-checked).
- **SC-003**: An operator can locate a specific Worker by name in under 5 seconds using the search box, without scrolling through the full list manually.
- **SC-004**: An operator can narrow the table to a single environment in one interaction.
- **SC-005**: All four metric tiles on the page show a value and a context line — 0 exceptions.

## Assumptions

- The design's "DEPLOY LOG" control is interpreted as a way to reach the deploy-relevant recent activity already computed for this page's existing Recent changes panel (e.g. bringing it into focus/view), not a new log-collection feature — no new data source is introduced.
- The environment filter and Worker-name search apply to the currently-loaded, already-paginated set of Workers, consistent with this page's existing server-side pagination — they are not expected to search across pages not yet loaded.
- The underlying shared table component gains a backward-compatible, opt-in way to render its status column last instead of first; every page that does not opt in keeps its current (status-first) layout unchanged.
- This feature does not change which users can view the Workers inventory page, matching its current, unrestricted-beyond-page-access authorization.
