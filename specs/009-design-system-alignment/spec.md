# Feature Specification: Design System & App Shell Alignment

**Feature Branch**: `009-design-system-alignment`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Design System & App Shell Alignment — cross-cutting infrastructure, not one of the 7 numbered Cloudflare-resource modules, analogous to how Module 8 (Identity, Authorization & Audit) was cross-cutting rather than tied to a single Cloudflare resource. The constitution's 'Design System' section mandates that the visual layer be sourced from docs/design.zip and treated as the source of truth, that component patterns from the package be followed rather than invented fresh, and that status semantics (safe/warning/critical) read consistently everywhere. A cross-check of docs/design.zip against the current app/ implementation found the visual layer has drifted substantially from that source of truth across fonts, favicon, logo, navigation, a missing Overview/Dashboard page, the flagship data-table pattern, border-radius usage, loading/empty states, and an alert banner component. This feature closes those gaps."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent, on-brand app shell everywhere (Priority: P1)

An operator opens FlareTower and, on every page they visit, sees the same
branded left-hand navigation (FlareTower mark, all 8 destinations, a clear
indicator of which page is active), the specified typefaces actually
rendering (not a silent system-font fallback), a matching browser tab icon,
and a consistently sharp-edged visual language — instead of today's
single-row text-only nav bar with no branding, no loaded fonts, no favicon,
and inconsistent rounded corners.

**Why this priority**: Everything else in this feature (the data-table
pattern, the Overview page) is presented inside this shell. Getting the
shell right first means every subsequent story is automatically on-brand
the moment it ships, and this story alone is already a complete, shippable
improvement with no dependency on later stories.

**Independent Test**: Load any of the 7 existing module pages and confirm
the sidebar, logo, typefaces, favicon, and corner treatment match the
design package — deliverable and verifiable without any table or dashboard
changes existing yet.

**Acceptance Scenarios**:

1. **Given** the app is loaded in a browser, **When** the operator looks at
   the browser tab, **Then** they see the FlareTower favicon, not a generic
   default icon.
2. **Given** any module page is open, **When** the operator looks at the
   left side of the screen, **Then** they see a sidebar containing the
   FlareTower logo, all 8 navigation destinations (Overview plus the 7
   modules), and an account/version footer.
3. **Given** the operator navigates from one module to another, **When**
   the new page loads, **Then** the sidebar item for the new page shows the
   active-state treatment (left edge accent bar and background tint) and
   the previous item returns to its inactive style.
4. **Given** a module has at least one unacknowledged critical finding,
   **When** the operator looks at that module's sidebar entry, **Then**
   they see a numeric badge reflecting that count.
5. **Given** any page is rendered, **When** the operator inspects the
   rendered text, **Then** body and heading text is set in IBM Plex Sans
   and code/hostname/identifier text is set in IBM Plex Mono, not a
   fallback system font.

---

### User Story 2 - Unified, filterable findings table per module (Priority: P2)

An operator investigating any single module (e.g. DNS, Storage, Zero
Trust) sees that module's findings in one sortable, filterable data table
with status-count filter chips, an alert banner surfacing the single most
urgent finding when one exists, and rows that expand in place for more
detail — instead of today's ad-hoc grouping of findings into separate
per-parent-entity cards with no filtering, sorting, or expansion.

**Why this priority**: This is the flagship interaction pattern the design
package was built around, and it directly improves the product's core
job (surfacing risk quickly) on the module pages operators already use
today. It depends on User Story 1's shell existing but not on the Overview
page.

**Independent Test**: Open any one module's inventory page (e.g.
Exposure) and confirm findings render in the unified table with working
filter chips and row expansion — independently verifiable per module,
deliverable one module at a time if needed.

**Acceptance Scenarios**:

1. **Given** a module has findings across multiple severities, **When**
   the operator opens that module's page, **Then** all findings appear in
   a single table with status-count filter chips shown above it.
2. **Given** the operator clicks the "critical" filter chip, **When** the
   table re-renders, **Then** only critical-severity rows remain visible,
   with no page reload.
3. **Given** a module has at least one critical finding, **When** the
   operator opens that module's page, **Then** an alert banner naming the
   most urgent finding appears above the table.
4. **Given** the operator clicks a table row, **When** the row expands,
   **Then** additional detail for that row's finding is revealed in place,
   and clicking again collapses it.
5. **Given** a critical-severity row is present, **When** the operator
   views the table, **Then** that row is marked simultaneously by
   background tint, a left edge bar, and the shape+color status badge —
   not by color alone.
6. **Given** a module's evaluation has never run, **When** the operator
   opens that page, **Then** they see the empty-state treatment (icon,
   heading, description, call-to-action), not plain unstyled text.
7. **Given** a module's data is still loading, **When** the operator opens
   that page, **Then** they see the shimmer-skeleton loading treatment,
   not plain unstyled text.

---

### User Story 3 - Cross-module Overview page (Priority: P3)

An operator opens FlareTower and, on a new Overview page reachable from
the navigation, immediately sees whether anything across the whole account
needs attention right now: aggregate counts of critical/warning/
safe/not-applicable findings across all 7 modules, a list of the most
urgent findings with a way to jump to or act on each, and a log of recent
evaluation activity — without visiting any individual module page first.

**Why this priority**: This is the highest-value single screen for a
returning operator, but it is additive on top of Stories 1 and 2 (it
summarizes data those stories' pages already expose) rather than a
prerequisite for them, so it is ordered last.

**Independent Test**: Navigate to the Overview page and confirm the
aggregate counts match the sum of what each individual module page shows,
without needing any module-specific UI change beyond what Stories 1–2
already deliver.

**Acceptance Scenarios**:

1. **Given** findings exist across several modules, **When** the operator
   opens the Overview page, **Then** they see one count per severity level
   aggregated across all 7 modules.
2. **Given** the aggregate counts are displayed, **When** compared against
   manually summing each module's own page, **Then** the totals match
   exactly.
3. **Given** at least one critical finding exists anywhere in the account,
   **When** the operator opens the Overview page, **Then** it appears in a
   prioritized findings list with a way to inspect or act on it.
4. **Given** evaluation runs have happened recently, **When** the operator
   opens the Overview page, **Then** they see a chronological log of
   recent scan activity.
5. **Given** every module currently has zero findings of any kind, **When**
   the operator opens the Overview page, **Then** it shows a confirmed-
   all-clear state, not an error and not a "no data" empty state.

### Edge Cases

- What happens when an operator's screen reader or a printed/grayscale
  context strips all color? Status must still be distinguishable by shape
  alone (design package's own "shape carries the state" requirement) —
  this applies to every status indicator introduced or touched by this
  feature, not just the ones already covered by the existing status badge.
- What happens when a module page is opened by an operator whose role
  cannot acknowledge alerts? The table and banner must still render fully;
  only the action affordances gated by role should be hidden or disabled,
  consistent with existing per-module authorization behavior.
- What happens when a hostname, Worker name, or other identifier is too
  long for its table column? It must truncate with an ellipsis rather than
  breaking the row layout, per the design package's existing column
  treatment.
- What happens when the Overview page's aggregation encounters a module
  whose latest evaluation run failed entirely (see prior convergence work
  on per-source "unavailable" signaling)? That module's contribution to
  the aggregate counts must be shown as not-available, not silently
  counted as zero.
- What happens on a narrow browser window? The design package is
  specified against a fixed desktop grid; no mobile/responsive layout is
  required by this feature (see Assumptions).
- What happens to a module's nav badge count when that module has zero
  critical findings? The badge must not render at all, not render as "0".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST render the FlareTower logo mark in the
  navigation shell on every page.
- **FR-002**: The app MUST present navigation as a left sidebar containing
  all 8 destinations (Overview plus the 7 existing modules), each with an
  icon and label.
- **FR-003**: The navigation MUST visually indicate which destination is
  currently active, distinct from all inactive destinations.
- **FR-004**: The navigation MUST show a numeric badge on a module's
  destination when that module has one or more unacknowledged critical
  findings, and MUST show no badge when that count is zero.
- **FR-005**: The app MUST load and apply the IBM Plex Sans and IBM Plex
  Mono typefaces wherever `tokens.css`'s `--font-sans`/`--font-mono` are
  referenced, rather than falling back to a system font.
- **FR-006**: The app MUST serve a favicon derived from the design
  package's simplified mark.
- **FR-007**: All UI components introduced or touched by this feature
  MUST use zero border-radius (sharp corners), and existing components
  that currently use non-zero border-radius MUST be corrected to match.
- **FR-008**: `tokens.css`'s `--surface-2` value MUST match the design
  package's source value.
- **FR-009**: Each of the 7 existing module inventory pages MUST present
  its findings as a single sortable, filterable data table rather than
  grouped per-parent-entity cards.
- **FR-010**: Each module's data table MUST support filtering to a single
  status severity via clickable status-count filter chips.
- **FR-011**: A table row containing a critical-severity finding MUST be
  marked simultaneously by background tint, a left edge bar, and the
  shape+color status badge.
- **FR-012**: A table row MUST expand in place on click to reveal
  additional detail for that row's finding, and collapse again on a
  second click.
- **FR-013**: When a module page has at least one critical finding, that
  page MUST show an alert banner naming the single most urgent finding,
  above the data table.
- **FR-014**: Every module page's loading state MUST use a shimmer-
  skeleton visual treatment instead of plain unstyled text.
- **FR-015**: Every module page's "no evaluation run yet" state MUST use
  an empty-state visual treatment (icon, heading, description, and a
  call-to-action) instead of plain unstyled text.
- **FR-016**: A new Overview page MUST be reachable from the navigation
  and MUST show, aggregated across all 7 modules: a count of findings per
  severity, a prioritized list of the most urgent findings, and a log of
  recent evaluation-run activity.
- **FR-017**: The Overview page's aggregate counts MUST be computed from
  the same underlying finding data each module's own page displays, with
  no separate or divergent counting logic.
- **FR-018**: When a module's latest evaluation run could not be read at
  all, the Overview page's aggregation MUST show that module as
  not-available rather than counting it as zero findings.
- **FR-019**: This feature MUST NOT alter any module's Cloudflare
  detection/evaluation logic, D1 schema, or Cloudflare API usage — it is
  a presentation-layer change only.
- **FR-020**: The app MUST NOT introduce a light color theme or a
  theme-switching control as part of this feature (see Assumptions) —
  dark remains the only supported theme.

### Key Entities

- **Aggregated Finding Summary**: A derived, not separately stored, view
  computed at request time from each module's existing latest-run finding
  data — a count per severity, a prioritized subset of the most urgent
  individual findings, and per-module read-availability, all scoped to
  what the Overview page needs to render.
- **Navigation Badge Count**: A per-module count of unacknowledged
  critical findings, derived from the same data each module's page
  already reads, used only to decide whether/what a nav badge shows.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every one of the 8 pages (Overview + 7 modules) uses
  identical navigation, typography, and iconography — a side-by-side
  comparison across all 8 shows no inconsistency in shell styling.
- **SC-002**: An operator can narrow any module's findings table to a
  single severity in one click, with the result visible in under 1
  second and no full-page reload.
- **SC-003**: A critical finding is identifiable via at least 3
  simultaneous visual cues that do not depend on color perception alone.
- **SC-004**: From the Overview page alone, an operator can correctly
  state whether the account currently has any critical or warning
  findings, without visiting any other page, 100% of the time.
- **SC-005**: Zero hardcoded hex color values exist outside
  `app/styles/tokens.css` across every file touched by this feature.
- **SC-006**: Every existing automated test (unit and end-to-end) that
  passed before this feature continues to pass after it, and new
  end-to-end coverage exists for at least the filter-chip, row-expansion,
  and Overview-aggregation behaviors introduced by this feature.

## Assumptions

- Only the existing dark theme is in scope; the design package's
  documented light-theme token remap is explicitly out of scope for this
  feature and is not being decided one way or the other here — a future
  feature can pick it up if there is ever a product need for a
  light-mode/theme toggle.
- The design package's fixed desktop grid is treated as the target;
  no dedicated mobile/responsive layout is required by this feature,
  consistent with the current app's existing lack of one.
- The Overview page's activity log and any trend/history element may draw
  on whatever evaluation-run history is already cheaply available (e.g.
  from Module 7's audit/changes data) rather than requiring new
  time-series storage to be built for this feature.
- Each module's data-table column set is module-specific (matching that
  module's existing finding fields), rather than forcing all 7 modules
  into one identical column layout — the shared component is the
  table/filter/expand/banner *pattern*, not one fixed column schema.
- Role-based action gating already established for existing mutating
  actions (e.g. acknowledge) continues to apply unchanged; this feature
  only changes how findings are *presented*, not who can act on them.
