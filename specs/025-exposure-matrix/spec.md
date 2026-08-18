# Feature Specification: Exposure Matrix

**Feature Branch**: `025-exposure-matrix`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "Rebuild the Exposure page (currently 'Exposure inventory,' a flat one-row-per-(worker,hostname) list) as the 'Exposure matrix' described in the FlareTower identity spec Claude Design project, section 05 — closing GitHub issue #421. This is the design doc's own 'flagship view.' Restructure to one row per Worker crossed against columns for every way in (custom domain, workers.dev, preview URL), an access-coverage summary column, and status anchored rightmost. Add severity-count filters that double as jump-to-row navigation, a free-text worker search, and reuse the existing Re-scan control in a real toolbar. Clicking a row expands it to reveal routes, the effective Access policy in plain language, and a set of contextual action controls whose label varies by what's wrong with that Worker — action controls render visually per the design but do not call any Cloudflare-mutating capability in this feature; that is out of scope pending its own dedicated review given several of the mockup's actions are destructive (e.g. deleting a Worker)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every Worker's full exposure surface at a glance (Priority: P1)

An operator opens the Exposure page wanting to know, for every Worker in the account, exactly which of its possible entry points (a custom domain, the generated workers.dev subdomain, a preview URL) are open to the internet without a policy in front of them — and how that adds up to an overall coverage picture for that Worker. Today the page instead lists one row per (Worker, hostname) pair, so an operator has to mentally re-group scattered rows back into "per Worker" to answer that question.

**Why this priority**: This is the core value of the page (per the design's own "flagship view" framing) — closing GitHub issue #421. Without the Worker-as-row, entry-point-as-column restructure, none of the other improvements in this feature matter.

**Independent Test**: Open the Exposure page against an account with Workers that have varying combinations of custom domain / workers.dev / preview URL. Confirm each Worker appears exactly once, with a separate status indicator per entry-point type it has (and a clear "not present" state for entry-point types it doesn't have), plus one overall coverage summary and one overall status per Worker.

**Acceptance Scenarios**:

1. **Given** a Worker with a protected custom domain and an unprotected workers.dev subdomain, **When** the operator views its row, **Then** the custom domain column shows a protected indicator and the workers.dev column shows an unprotected indicator, distinctly, in the same row.
2. **Given** a Worker with no preview URL at all, **When** the operator views its row, **Then** the Preview URL column shows an explicit "not present" state, never a blank cell and never a false "protected" reading.
3. **Given** the full table of Workers, **When** the operator scans the rightmost column, **Then** every row's overall status (critical / warning / protected / not-applicable) is immediately visible without needing to inspect the entry-point columns individually.
4. **Given** a Worker whose account-wide coverage can be summarized as a fraction (e.g. some but not all of its entry points are protected), **When** the operator views its row, **Then** an access-coverage summary for that Worker is shown alongside its status.

---

### User Story 2 - Drill into one Worker's routes and policy without leaving the page (Priority: P2)

An operator spots a Worker of concern in the matrix and wants to see its actual routes and the plain-language Access policy protecting (or failing to protect) each one — today this requires navigating away to the separate Worker Detail page. They want the same depth of detail available inline, so they can compare several Workers' policies back-to-back without losing their place in the matrix.

**Why this priority**: Valuable follow-through on User Story 1's at-a-glance view, but the matrix restructure alone (US1) already delivers most of the issue's value even before this drill-in exists.

**Independent Test**: From the matrix, expand a Worker's row and confirm its routes and effective Access policy appear inline, in plain language, without a page navigation — then collapse it and expand a different row to confirm the same works independently per row.

**Acceptance Scenarios**:

1. **Given** a Worker's row is collapsed, **When** the operator clicks anywhere on the row, **Then** it expands in place to show that Worker's routes (each with its own status) and its effective Access policy in plain language.
2. **Given** an expanded row, **When** the operator clicks it again, **Then** it collapses back to the single-row view.
3. **Given** a Worker with no Access application covering any of its routes, **When** its row is expanded, **Then** the effective-policy detail explicitly states there is no covering policy, rather than showing an empty or blank panel.
4. **Given** the expanded detail is showing contextual action controls specific to that Worker's finding (e.g. an option to disable an open entry point, or attach a policy), **When** the operator views them, **Then** the controls are visually present and clearly labeled per what's actually wrong with that Worker — but no click on them changes any real Cloudflare configuration in this feature (that capability is explicitly out of scope here; see Assumptions).

---

### User Story 3 - Navigate and narrow a large Worker list quickly (Priority: P3)

An operator on an account with many Workers wants to jump straight to the ones that need attention, or narrow the list to a specific Worker by name, and wants the same on-demand re-scan control already available on every other module dashboard.

**Why this priority**: A usability improvement on top of US1/US2 — valuable on large accounts, but the page is already functional and correct without it.

**Independent Test**: On a page with several Workers of mixed severity, click a severity count to confirm the view jumps to the first matching row; separately, type a Worker name fragment into the search box and confirm the list narrows to matches; separately, trigger a re-scan and confirm it behaves the same as every other module's re-scan control.

**Acceptance Scenarios**:

1. **Given** the page shows counts of Workers by severity, **When** the operator clicks the critical count, **Then** the view scrolls to the first critical-severity row.
2. **Given** the operator types part of a Worker's name into the search box, **When** the input changes, **Then** the table narrows to only Workers whose name (or one of their hostnames) matches, without a page reload.
3. **Given** the operator triggers a re-scan from this page, **When** it completes, **Then** the matrix refreshes to reflect the new results, consistent with every other module dashboard's existing re-scan behavior.

### Edge Cases

- What happens when a Worker has more than one hostname of the same entry-point type (e.g. two custom domains)? The entry-point column shows that Worker's worst status among its hostnames of that type, and the full list of that type's hostnames remains available in the row's expanded routes detail — no hostname is silently dropped from the page.
- What happens when a Worker has zero HTTP routes at all (e.g. a queue-consumer-only Worker)? It still appears as one row, with every entry-point column and the coverage column showing an explicit "not applicable" state, distinct from "not evaluated" or "protected."
- What happens when the search box narrows the table to zero matching Workers? An explicit "no matches" state is shown, not a blank table.
- What happens when a Worker is intentionally public and confirmed as such by an owner? Its overall status reads as a distinct "not applicable / public by design" state, not "critical," consistent with how the underlying detection already treats confirmed-public Workers today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Exposure page MUST show exactly one row per Worker, never one row per hostname.
- **FR-002**: Each Worker's row MUST show a separate status indicator for each of its three possible entry-point types (custom domain, workers.dev, preview URL), with an explicit "not present" state for any type the Worker doesn't have.
- **FR-003**: Each Worker's row MUST show one overall status (critical / warning / protected / not-applicable) as the rightmost column, and this column MUST remain the visual anchor for scanning severity regardless of what other columns exist.
- **FR-004**: Each Worker's row MUST show an access-coverage summary describing how covered that Worker's entry points are overall.
- **FR-005**: The page MUST let an operator expand any Worker's row in place to reveal that Worker's routes (each with its own status) and its effective Access policy in plain language, without navigating to a different page.
- **FR-006**: The expanded row detail MUST show a set of contextual action controls whose labeling reflects what's actually wrong with that specific Worker — but activating any of them MUST NOT perform any real mutation against the Cloudflare account in this feature (out of scope; see Assumptions).
- **FR-007**: The page MUST show a count of Workers per overall-status severity, and clicking a count MUST scroll the view to the first Worker row of that severity.
- **FR-008**: The page MUST offer a free-text search that narrows the visible rows to Workers whose name or any of their hostnames match, without reloading the page.
- **FR-009**: The page MUST offer the same on-demand re-scan control already present on every other module dashboard, and it MUST behave consistently with those (pending/error/refresh states).
- **FR-010**: A Worker with more than one hostname of the same entry-point type MUST NOT have any of those hostnames silently omitted from the page — its column cell reflects the worst status among them, and every instance remains visible in that row's expanded detail.
- **FR-011**: A Worker with zero HTTP routes MUST render as a row with an explicit "not applicable" state across its entry-point and coverage columns, not as an error or an omitted row.
- **FR-012**: The page's title and terminology MUST refer to this view as the "Exposure matrix," replacing the current "Exposure inventory" naming.
- **FR-013**: This feature MUST NOT change the underlying exposure-detection logic or the scheduled-scan cadence — it restructures how already-correct results are presented.

### Key Entities

- **Worker row**: One Worker's full exposure picture — its name, its status per entry-point type (custom domain / workers.dev / preview URL), its overall coverage summary, and its overall status.
- **Entry-point status**: The exposure status of one specific way into a Worker (a hostname of a given kind), reusing the same critical / warning / protected / not-evaluated vocabulary already used elsewhere in the product.
- **Row detail**: The expanded, in-place view of one Worker's routes, effective Access policy in plain language, and contextual (visual-only, in this feature) action controls.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can identify, for any single Worker, which of its entry points are unprotected without cross-referencing multiple rows — 100% of Workers are represented as exactly one row.
- **SC-002**: An operator can go from "which Workers need attention" to "why, in plain language" without leaving the page, for any Worker, in under 10 seconds of interaction.
- **SC-003**: On an account with many Workers, an operator can locate a specific Worker by name in under 5 seconds using the search box, without scrolling through the full list manually.
- **SC-004**: 100% of Workers with no entry point of a given type show an explicit, unambiguous "not present" state for that type — never a blank or misleading cell.

## Assumptions

- The contextual action controls shown in an expanded row's detail are visual only in this feature — they render with labeling appropriate to that Worker's finding, but no control in this feature calls any Cloudflare-mutating API. Wiring any of them to a real mutation (some of which, per the design, include destructive operations) is explicitly out of scope here and will be considered as separate, individually-reviewed future work.
- The underlying per-Worker route and Access-policy data needed for the expanded row detail is assumed to already exist in the product (surfaced today on the separate Worker Detail page) and is being reused here, not recomputed from scratch.
- The existing on-demand re-scan capability (available on every other module dashboard) is assumed to be reused as-is on this page, not redesigned.
- This feature does not change which users can view the Exposure page, matching its current, unrestricted-beyond-page-access authorization.
- A Worker's "effective Access policy in plain language" reuses the same plain-language rule vocabulary (allow/require/deny) already established elsewhere in the product for presenting Access policies to operators.
