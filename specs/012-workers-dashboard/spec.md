# Feature Specification: Workers Dashboard

**Feature Branch**: `012-workers-dashboard`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Workers module operational dashboard — replaces the generic
exposure-findings table currently used for the Workers/Exposure module with a bespoke,
purpose-built inventory page, per the updated design source (§08 'Workers' of FlareTower's design
package, added since the package was last synced to this repo). Sidebar nav splits the current
merged 'Workers & Access' entry into separate 'Workers' and 'Exposure' items. New page shows
per-Worker operational metrics (requests, errors, CPU) alongside the existing exposure status, plus
account-wide aggregate metric cards and a Workers-scoped recent-changes panel. Mutating actions
(deploy, disable, attach) shown in the design are out of scope, matching every other module's
read-only precedent."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every Worker's operational shape in one inventory (Priority: P1)

An operator opens a dedicated "Workers" page (separate from the existing "Exposure" page) and sees
every deployed Worker script listed once, with its environment, route count, last-deploy time, and
its existing exposure status (critical/warning/protected/not evaluated) carried over unchanged from
the Exposure module's evaluation.

**Why this priority**: This is the page's reason to exist independent of any new metric — today,
"which Workers are deployed, where, and how exposed" requires cross-referencing the Exposure page
with the Cloudflare dashboard. A dedicated inventory answers "what do I have running" in one place,
which is a prerequisite for every other story in this spec.

**Independent Test**: Can be fully tested by connecting FlareTower to an account with multiple
deployed Workers across production and preview environments and confirming every one appears
exactly once, with accurate environment, route count, last-deploy time, and exposure status —
delivers value even before any request/error/CPU metric is added.

**Acceptance Scenarios**:

1. **Given** an account with Workers deployed to both production and preview environments, **When**
   the operator opens the Workers page, **Then** every deployed Worker appears exactly once, labeled
   with its environment.
2. **Given** a Worker already flagged critical/warning/protected/not-evaluated by the Exposure module,
   **When** the operator views that Worker's row on the Workers page, **Then** the same status
   appears, unchanged from the Exposure page's own evaluation.
3. **Given** the operator has not yet reached the Workers page, **When** they look at the sidebar,
   **Then** "Workers" and "Exposure" appear as two separate, independently navigable items (no
   longer merged into one).

---

### User Story 2 - See real operational health per Worker and account-wide (Priority: P1)

An operator viewing the Workers page sees, for each Worker, its request count, error count, and CPU
time over the trailing 24 hours, and sees the same figures aggregated across the whole account in a
row of summary metrics at the top of the page (total deployed, total requests with a
day-over-day change, account-wide error rate, and a CPU percentile figure).

**Why this priority**: Exposure status alone doesn't tell an operator which Workers are actually
busy, erroring, or close to a resource limit — this is the "is anything on fire" signal the page's
metric cards and table columns exist to give, and it's the module's headline new value over the
existing generic findings table.

**Independent Test**: Can be fully tested by connecting FlareTower to an account with Workers that
have varying traffic and error levels and confirming the per-Worker figures and the account-wide
summary cards both reflect real values retrievable from Cloudflare — delivers value independently of
User Story 3's change history.

**Acceptance Scenarios**:

1. **Given** a Worker that has served requests and returned some errors in the last 24 hours,
   **When** the operator views its row, **Then** its request count, error count, and a CPU figure
   are shown, sourced from real Cloudflare data (never fabricated placeholders).
2. **Given** an account with several Workers, **When** the operator opens the page, **Then** the
   summary cards show the total deployed count, total requests over the last 24 hours with a
   comparison to the prior day, an account-wide error rate, and an account-wide CPU percentile.
3. **Given** Cloudflare's analytics data for a specific Worker is temporarily unavailable, **When**
   the operator views that Worker's row, **Then** the affected metric shows a clear "not available"
   state rather than a zero or a fabricated number, and every other Worker's row is unaffected.

---

### User Story 3 - See recent changes scoped to Workers (Priority: P2)

An operator viewing the Workers page sees a panel listing recent account changes that are relevant
to Workers specifically (deploys, route/domain changes, Access-application bindings touching a
Worker's routes) — sourced from Cloudflare's own account-level change history, filtered down to
Workers-relevant entries. (Correction from an earlier draft of this spec: this project's existing
Module 7/8 "Audit & Drift" concept is a derived digest of FlareTower's own finding-status
transitions, e.g. "bucket X went from safe to critical" — it is a different, narrower thing than
Cloudflare's own account change history and cannot supply entries like "who deployed this Worker" or
"who bound this route to an Access application." This story requires reading Cloudflare's real
change-history data directly, confirmed as a Phase 0 research item.)

**Why this priority**: Useful context once the inventory and metrics exist, but the page is already
a complete, valuable improvement over today's generic table without it — this is additive, not
foundational.

**Independent Test**: Can be tested independently by seeding the account's existing activity record
with a mix of Workers-relevant and unrelated entries and confirming only the Workers-relevant ones
appear in this page's panel, in reverse-chronological order.

**Acceptance Scenarios**:

1. **Given** the account's activity record contains both a Workers deploy and an unrelated DNS
   record change, **When** the operator views the Workers page's recent-changes panel, **Then** only
   the Workers deploy appears there.
2. **Given** no Workers-relevant activity has occurred yet, **When** the operator views the panel,
   **Then** it shows an explicit empty state rather than an error or indefinite loading spinner.

### Edge Cases

- What happens when the account has zero deployed Workers? The page MUST show an explicit empty
  state, not an empty table indistinguishable from a loading or error state.
- What happens when a Worker has no traffic at all in the last 24 hours? Its request/error/CPU
  figures MUST show as zero, distinguishable from the "not available" state used when Cloudflare's
  analytics data couldn't be retrieved at all.
- How does the page handle a Worker that exists in the deployed-scripts list but has been excluded
  from the Exposure module's own evaluation (e.g. a transient API failure during that module's own
  evaluation run)? Its exposure column MUST show the same "not evaluated" treatment the Exposure
  page itself already uses, not a fabricated status.
- What happens when the account has Workers across more than two environments (not just
  production/preview)? Every environment present MUST be shown; the page MUST NOT assume exactly two.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a Workers page, reachable from its own sidebar nav item,
  separate from the existing Exposure page's nav item.
- **FR-002**: The sidebar MUST show a badge count on the Workers nav item (count of deployed
  Workers) and, unchanged, on the Exposure nav item (count of critical findings).
- **FR-003**: The Workers page MUST list every deployed Worker script exactly once, showing its
  name, environment, route count, and last-deploy time.
- **FR-004**: Each Worker's row MUST show its existing exposure status, unchanged from the Exposure
  module's own evaluation for that Worker (critical / warning / protected / not evaluated). Since
  the Exposure module evaluates per-hostname rather than per-Worker, a Worker's row MUST show the
  single worst status among its hostnames (critical outranks warning, which outranks protected/not
  evaluated), consistent with how a reasonable operator would read "is this Worker safe."
- **FR-005**: Each Worker's row MUST show its request count, error count, and a CPU time figure over
  the trailing 24 hours, sourced from real Cloudflare data.
- **FR-006**: The page MUST show account-wide summary metrics: total deployed Worker count (with a
  breakdown by environment), total requests over the trailing 24 hours with a day-over-day
  comparison, an account-wide error rate, and an account-wide CPU percentile figure.
- **FR-007**: When a Worker's operational metrics cannot be retrieved, the system MUST show an
  explicit "not available" state for the affected figure rather than a zero or fabricated value, and
  MUST NOT let that failure block any other Worker's row from rendering.
- **FR-008**: The page MUST show a panel of recent account change history filtered to entries
  relevant to Workers (deploys, route changes, Access bindings touching a Worker's routes), sourced
  from Cloudflare's own account change history — not FlareTower's own derived finding-status digest
  (Module 7/8's existing "Audit & Drift" concept), which cannot represent who-did-what actor/action
  entries.
- **FR-009**: The system MUST NOT provide any control on this page that mutates Cloudflare account
  state (no deploy, disable, or Access-attach actions) — the page is read-only, matching every other
  module.
- **FR-010**: The page MUST show an explicit empty state when the account has zero deployed Workers.

### Key Entities

- **Worker inventory row**: one deployed Worker script — name, environment, route count,
  last-deploy time, request/error/CPU figures (or "not available"), exposure status.
- **Account-wide Workers summary**: aggregate figures shown in the page's metric-card row — total
  deployed, total requests (with day-over-day comparison), error rate, CPU percentile.
- **Workers-scoped activity entry**: a filtered view of this project's existing activity/audit
  record, limited to entries relevant to Workers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can identify every deployed Worker, its environment, and its exposure
  status from a single page, without cross-referencing the Cloudflare dashboard.
- **SC-002**: An operator can identify which Worker is generating the most errors or CPU load across
  the whole account within 10 seconds of opening the page.
- **SC-003**: 100% of Workers in the account appear in the inventory exactly once, with no
  duplicates and no omissions, across accounts of at least 50 Workers.
- **SC-004**: When Cloudflare's operational data for a Worker is temporarily unavailable, the
  operator can still see every other Worker's data unaffected and can distinguish "no traffic" from
  "data unavailable" at a glance.

## Assumptions

- Cloudflare's account-scoped analytics data can be queried per Worker script for request count,
  error count, and CPU time over a trailing 24-hour window, and for the prior 24-hour window (for the
  day-over-day comparison) — this is treated as a working assumption to be confirmed during planning
  research; if a specific figure the design shows turns out not to be obtainable within this
  project's existing read-only token scope, planning MUST document a reduced-scope fallback (e.g.
  omitting the day-over-day comparison) rather than fabricating a value.
- "Deployed Worker" means a Worker script currently present in the account's Workers script list,
  consistent with how the existing Exposure module already enumerates Workers.
- The Workers-scoped recent-changes panel reads Cloudflare's own account change history, filtered to
  Workers-relevant entries — treated as a working assumption that this data is obtainable within a
  read-only token scope, to be confirmed during planning research. This is a new integration this
  spec introduces (not a reuse of Module 7/8's existing derived digest, see User Story 3); Module 018
  (Audit dashboard) is expected to need the same underlying data and should reuse this spec's
  implementation rather than duplicating it, once both exist.
- CPU time is shown as a percentile figure (e.g. P50 per-row, P99 in the account-wide summary),
  matching the design source's own distinction between the per-row and summary figures.
- The nav split (separate "Workers" and "Exposure" sidebar entries) is a one-time structural change
  to existing navigation, not a new module — it is included in this spec because this page is the
  reason the split is needed, not because it independently need its own feature.
