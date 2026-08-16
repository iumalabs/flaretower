# Feature Specification: Worker Detail Page

**Feature Branch**: `023-worker-detail-page`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Add a Worker detail drill-down page, reachable by clicking a row in the Workers dashboard table. Closes GitHub issue #413: the design's own 'Worker detail' mockup is a full per-Worker screen — routes & hostnames table, effective Access policy, recent changes scoped to that Worker — and the shipped Workers page has no equivalent (flat rows, no chevron, no click-through). Most of the underlying data already exists elsewhere in the app and should be reused: per-Worker hostnames/routes and exposure status (already surfaced via Exposure inventory's row-expand), effective Access policy in plain language (already used on the Zero Trust page), and recent changes scoped to one Worker (already computed account-wide and Workers-filtered on the Workers dashboard). Action buttons implying write operations (disable workers.dev, attach Access app, re-scan) are out of scope — this is read-only, matching every other module dashboard's posture today. An outbound 'Open in Cloudflare' link is in scope."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Investigate a flagged Worker from its exposure status (Priority: P1)

An operator scanning the Workers dashboard table sees a Worker with a CRITICAL or WARNING exposure status. Instead of separately checking the Exposure inventory (to see which hostname is the problem), the Zero Trust page (to see what policy, if any, covers it), and the Audit log (to see what changed recently), they click that Worker's row and land on one screen with all three answers.

**Why this priority**: This is the entire reason the feature exists (issue #413) — going from "a row is flagged" to "I understand why and what to do about it" currently requires manually cross-referencing three different pages. Without this, the feature delivers no value.

**Independent Test**: From the Workers dashboard, click any Worker row. Land on a detail page showing that Worker's routes/hostnames with their individual exposure status, matching what Exposure inventory shows for the same Worker today.

**Acceptance Scenarios**:

1. **Given** the Workers dashboard is showing a Worker with a CRITICAL exposure status, **When** the operator clicks that Worker's row, **Then** a detail page for that Worker opens showing every one of its routes/hostnames with their individual exposure status (critical/warning/protected/n-a), matching the status each hostname already shows on Exposure inventory.
2. **Given** a Worker has multiple hostnames with different exposure statuses (e.g., one protected custom domain, one exposed generated subdomain), **When** viewing its detail page, **Then** each hostname's own status is shown distinctly — never rolled up into a single average or just the worst one, since a reader needs to know which specific route is the problem.
3. **Given** the operator is on a Worker's detail page, **When** they want to go back, **Then** they can return to the Workers dashboard without losing their place (same table page/sort/filter state they had before clicking through).

---

### User Story 2 - See what's actually protecting each route (Priority: P2)

For each of the Worker's routes, the operator sees whether an Access application covers it and, if so, what that policy actually allows/denies in plain language — not just "covered: yes/no" but the same kind of human-readable policy breakdown already shown on the Zero Trust page (e.g., "ALLOW emails ending in @acme.dev", "DENY everyone else").

**Why this priority**: Knowing a route is "exposed" is necessary but not sufficient to act on it — the operator needs to know what would need to change (attach a new policy, tighten an existing one, or confirm nothing's needed) without leaving this page to go read the Zero Trust page's own policy detail.

**Independent Test**: Open the detail page for a Worker with at least one route covered by an Access application. Confirm the policy's rules render in the same plain-language format as Zero Trust's own policy detail panel (allow/require/deny lines), not just a covered/not-covered flag.

**Acceptance Scenarios**:

1. **Given** a Worker route is covered by an Access application, **When** viewing the detail page, **Then** that application's policy is shown in plain language (allow/require/deny rules), not just a yes/no coverage flag.
2. **Given** a Worker route has no Access application covering it, **When** viewing the detail page, **Then** that route explicitly states no policy covers it, distinct from a route that's covered by a policy that happens to deny everyone.

---

### User Story 3 - See recent changes scoped to this one Worker (Priority: P3)

The operator sees a chronological feed of recent changes affecting this specific Worker (e.g., "workers.dev subdomain re-enabled," "route bound to a new Access application") — the same kind of entries the Audit & Drift page shows account-wide, filtered down to just this Worker.

**Why this priority**: Explains *when and how* a Worker went from fine to flagged, which matters for understanding whether something changed recently (a deploy, a policy edit) versus a long-standing gap — but it's a secondary read after the operator already understands the Worker's current exposure and policy state from User Stories 1–2.

**Independent Test**: Open the detail page for a Worker with at least one recent change recorded. Confirm the change appears in a list scoped to that Worker, and that a Worker with no recent changes shows an explicit empty state rather than an empty list with no explanation.

**Acceptance Scenarios**:

1. **Given** a change was recorded against this Worker in the retained audit history, **When** viewing the detail page, **Then** that change appears in a "recent changes" list scoped to this Worker only, not mixed with other Workers' changes.
2. **Given** a Worker has no recorded changes in the retained history, **When** viewing its detail page, **Then** an explicit "no recent changes" message is shown, not an empty space that could be mistaken for a loading or broken state.

### Edge Cases

- What happens when the operator clicks through to a Worker's detail page but that Worker is no longer present by the time the detail data loads (e.g., removed or renamed between the dashboard's last refresh and the click)? The page must show an explicit "this Worker was not found in the last evaluation run" state, not a blank page, a crash, or silently falling back to a different Worker.
- What happens when a Worker has zero HTTP routes (e.g., a queue-consumer-only Worker, already a real case on Exposure inventory today)? The page must state plainly that exposure doesn't apply, matching how Exposure inventory already handles this case, not show an empty routes table with no explanation.
- What happens when the underlying evaluation data is stale or a source is unavailable (mirroring the "unavailable source" distinction every other module dashboard already makes)? The detail page must carry the same distinction through — a section with no data because the source failed must not look identical to a section with no data because there's genuinely nothing to report.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Workers dashboard MUST let an operator navigate from any Worker row to a dedicated detail page for that Worker.
- **FR-002**: The Worker detail page MUST show every one of that Worker's routes/hostnames, each with its own individual exposure status — reusing the same status categories (critical/warning/protected/n-a) and underlying data already used by Exposure inventory, not a separate or re-derived classification.
- **FR-003**: For each route covered by an Access application, the detail page MUST show that application's policy in the same plain-language rule format already used on the Zero Trust page, not just a boolean covered/not-covered indicator.
- **FR-004**: For each route not covered by any Access application, the detail page MUST state that explicitly, distinct from a route covered by a policy that denies everyone (both are "safe" outcomes but for different reasons, and the operator needs to know which).
- **FR-005**: The detail page MUST show a list of recent changes scoped to this Worker only, drawn from the same retained change history the Audit & Drift page already shows account-wide.
- **FR-006**: A Worker with no recent changes MUST show an explicit empty state for that section, distinct from a section that's empty because its data source is unavailable.
- **FR-007**: A Worker with zero HTTP routes MUST show an explicit "exposure does not apply" state for the routes section, not an empty table.
- **FR-008**: Navigating directly to a detail page for a Worker not present in the last evaluation run MUST show an explicit not-found state, not a blank page or a crash.
- **FR-009**: The detail page MUST include an outbound link to that Worker's own page in the Cloudflare dashboard.
- **FR-010**: The detail page MUST NOT expose any action that mutates Cloudflare state (disabling a subdomain, attaching a policy, triggering a re-scan, or similar) — it is read-only, matching every other module dashboard's current posture.
- **FR-011**: Returning from the detail page to the Workers dashboard MUST preserve the dashboard's page/sort/filter state the operator had before navigating away.
- **FR-012**: Every place the detail page distinguishes "no data because nothing to report" from "no data because a source failed" MUST carry through the same unavailable-source distinction already established on every other module dashboard, not silently collapse the two into one empty-looking state.

### Key Entities

- **Worker detail view**: The full picture of one Worker — its identity (name, environment), its routes/hostnames with individual exposure status, the Access policy (if any) covering each route, and its recent change history. Composed entirely from data already computed by the Workers, Exposure, Zero Trust, and Audit modules; introduces no new evaluation or classification logic of its own.
- **Route entry**: One hostname bound to the Worker — its exposure status, and either the plain-language policy covering it or an explicit statement that nothing covers it.
- **Scoped change entry**: One audit history entry whose target is this Worker, in the same shape already used by the Audit & Drift page's own change feed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can go from seeing a flagged Worker on the Workers dashboard to understanding which specific route is the problem and what (if anything) is protecting it, without navigating to any other page.
- **SC-002**: Every exposure status, policy detail, and change entry shown on the detail page matches exactly what the same Worker's data already shows on the Exposure, Zero Trust, and Audit & Drift pages today — no discrepancy between the summary views and this detail view.
- **SC-003**: 100% of Workers reachable from the dashboard table produce a working detail page, including edge cases (zero routes, no recent changes, an unavailable data source) — none of them error, blank, or silently omit a section without explanation.
- **SC-004**: Returning from the detail page to the dashboard preserves the operator's prior view state (page/sort/filter) in 100% of cases — no lost place requiring the operator to re-filter or re-page to get back to where they were.

## Assumptions

- This feature is read-only/inspection-only. The mockup's action buttons that imply write operations against the Cloudflare API (disabling workers.dev, attaching an Access application, triggering a re-scan) are explicitly out of scope — no such mutation endpoints exist anywhere in this app today outside of the audit alert acknowledge flow, and adding them is a separate, much larger feature with its own security/authorization implications.
- "Open in Cloudflare" is in scope as a plain outbound link (using the account ID and Worker name FlareTower already has) — it makes no API call and mutates nothing, so it doesn't carry the same risk as the other action buttons.
- No new backend evaluation, classification, or data-fetching logic is expected — the detail page composes data already computed by the Workers, Exposure, Zero Trust, and Audit modules, filtered/joined down to one Worker.
- Navigation is in-app state (consistent with this app's existing router-less, state-based navigation), not a URL route with its own bookmarkable address — consistent with how every other module page navigates today.
