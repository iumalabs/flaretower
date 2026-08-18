# Feature Specification: Overview Dashboard Redesign

**Feature Branch**: `027-overview-dashboard-redesign`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "Rebuild the Overview page to match the FlareTower identity spec Claude Design project, section 06 'Dashboard overview' — closing GitHub issue #419. Add a header context row (real zone/Worker counts, last-scan time, real scan cadence, an account-wide re-scan-everything action), redesign findings rows to show each finding's real plain-language reason and a per-type contextual action (visual only, alongside the existing real Acknowledge action), and add a 14-day Exposure-over-time trend chart computed on the fly from already-persisted historical findings data (user-confirmed approach — no new snapshot infrastructure), with a bounded query strategy so it doesn't turn one page load into hundreds of database reads."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know when the account was last checked, and check it again on demand (Priority: P1)

An operator opening the Overview page wants to immediately see how big the account is (how many zones, how many Workers), when it was last scanned, how often it gets scanned automatically, and a way to trigger a fresh scan of everything right now — without visiting each module's page individually.

**Why this priority**: The header context row is the design's own framing for the whole page ("is anything wrong right now?") — without knowing when the data is from, every other number on the page is ambiguous.

**Independent Test**: Open the Overview page and confirm the header shows zone count, Worker count, a relative "last scanned" time, the real scan cadence, and a re-scan control; trigger it and confirm every module's data refreshes.

**Acceptance Scenarios**:

1. **Given** the page has loaded, **When** the operator looks at the header, **Then** it shows the number of zones and the number of Workers in the account, sourced from real, already-evaluated data.
2. **Given** at least one module has been evaluated, **When** the operator looks at the header, **Then** it shows how long ago the most recent evaluation across any module completed, and the account's real automatic scan cadence.
3. **Given** the operator triggers the account-wide re-scan, **When** it completes, **Then** every module's own data on this page reflects the new results.
4. **Given** no module has ever been evaluated, **When** the operator looks at the header, **Then** the last-scan and cadence indicators show an explicit "never scanned yet" state rather than a blank or misleading value.

---

### User Story 2 - Understand each finding without leaving the page (Priority: P1)

An operator scanning the Findings panel wants to know, for each open finding, what's actually wrong in plain language and what the affected resource is — not just a severity badge and a raw timestamp — so they can judge urgency without opening the underlying module.

**Why this priority**: This is the core content of the page's primary panel; today's rows carry a machine-readable slug instead of an answer to "what's wrong here," which defeats the point of a unified inbox.

**Independent Test**: Open the page with open findings across at least two different modules and confirm each row shows a real, plain-language reason (not just a status badge and a slug) alongside the existing Acknowledge control.

**Acceptance Scenarios**:

1. **Given** an open finding from any module, **When** the operator views its row, **Then** they see that finding's own real explanation of what's wrong, not a generic or fabricated sentence.
2. **Given** a finding row, **When** the operator views it, **Then** a contextual action label relevant to that specific kind of finding is shown alongside the existing Acknowledge control, and clicking Acknowledge behaves exactly as it does today.
3. **Given** the operator acknowledges a finding, **When** it completes, **Then** the row disappears from the list exactly as it does today — this feature does not change that behavior.

---

### User Story 3 - See whether exposure is trending better or worse (Priority: P2)

An operator wants a quick visual sense of whether the account's overall exposure has been improving, worsening, or holding steady over the past two weeks, without digging through the change log entry by entry.

**Why this priority**: Valuable trend context, but the page is already fully useful (current posture + open findings + recent activity) without it — this is an added-perspective feature, not a blocking one.

**Independent Test**: Open the page and confirm a 14-day chart shows the daily split of critical/warning/safe findings, reflecting real historical data, and that the page still loads in reasonable time.

**Acceptance Scenarios**:

1. **Given** the account has evaluation history going back at least 14 days, **When** the operator views the trend chart, **Then** each of the 14 days shows a real, non-fabricated breakdown of finding severity for that day.
2. **Given** the account has less than 14 days of evaluation history, **When** the operator views the chart, **Then** days before the account's first evaluation show an explicit "no data yet" state rather than a fabricated zero or an invented trend.
3. **Given** the chart is computing real historical data across every module, **When** the page loads, **Then** it does so without an excessive number of separate database reads — the computation is bounded in a way that keeps this page's load time reasonable regardless of how many modules and finding types the account has evaluated.

### Edge Cases

- What happens when a module has never been evaluated at all? It's excluded from the last-scan and trend-chart calculations the same way it's already excluded from the existing posture totals (not folded in as zero).
- What happens when a finding's reason text is unusually long? It renders as the row's explanatory sentence without breaking the row's layout (wraps, doesn't truncate silently).
- What happens if the account-wide re-scan is triggered while a previous one is still running? The control clearly indicates a scan is already in progress and doesn't allow a second one to start from the same control.
- What happens if one of the six modules' re-scan fails while the others succeed? The operator sees which one failed, and the modules that succeeded still refresh — one failure doesn't roll back or hide the others' fresh results.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The page header MUST show the number of zones and the number of Workers in the account, derived from real, already-evaluated data.
- **FR-002**: The page header MUST show how long ago the most recent evaluation across any module completed, or an explicit "never scanned" state if none has ever run.
- **FR-003**: The page header MUST show the account's real automatic scan cadence — never a fabricated or example number.
- **FR-004**: The page header MUST offer a control that triggers a fresh evaluation of every module, and MUST clearly indicate when this is already in progress.
- **FR-005**: Each finding row MUST show that finding's own real, plain-language explanation of what's wrong, not a fabricated or generic sentence.
- **FR-006**: Each finding row MUST show a contextual action label relevant to that finding's specific kind, in addition to the existing Acknowledge control.
- **FR-007**: The existing Acknowledge action's behavior MUST NOT change — clicking it MUST continue to remove the finding from the list exactly as it does today.
- **FR-008**: No contextual action introduced by this feature other than the existing Acknowledge MUST perform any real mutation.
- **FR-009**: The page MUST show a 14-day trend of critical/warning/safe finding counts, using only real, already-persisted historical data — never fabricated figures.
- **FR-010**: A day within the 14-day window that predates the account's evaluation history MUST show an explicit "no data" state, not a fabricated zero.
- **FR-011**: The trend computation MUST be bounded in cost so that computing it does not turn a single page load into an impractical number of separate database reads.
- **FR-012**: This feature MUST NOT change the underlying per-module detection or evaluation logic — it only reads and re-presents already-correct data, plus the additive account-wide re-scan convenience action.
- **FR-013**: This feature MUST NOT change the alerts/changes pagination behavior already established for this page.

### Key Entities

- **Header context**: The zone count, Worker count, last-scan time, scan cadence, and re-scan control shown at the top of the page.
- **Finding row**: One open finding's severity, plain-language reason, affected entity, contextual action label, and the existing Acknowledge control.
- **Exposure trend point**: One day's critical/warning/safe finding counts within the 14-day window, or an explicit "no data" state for days before the account had any evaluation history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can state the account's size (zones, Workers) and when it was last scanned within 5 seconds of opening the page, without visiting any other page.
- **SC-002**: 100% of open finding rows show a real, non-fabricated explanation of what's wrong — zero rows show only a status badge and a raw identifier.
- **SC-003**: An operator can trigger a full account-wide re-scan and see refreshed results without leaving the page or invoking any individual module's own re-scan control.
- **SC-004**: The trend chart renders using only real data — 100% of populated days trace to an actual historical evaluation; 0% are fabricated.
- **SC-005**: The page's load time is not measurably worse for an account with a long evaluation history than for a newly-onboarded one — the trend computation's cost does not scale in a way an operator would notice.

## Assumptions

- This app has no concept of a human-friendly "account name" (only an opaque Cloudflare account identifier) — the header shows zone/Worker counts, not a fabricated account name like the design mockup's example.
- The account-wide re-scan action triggers the same six per-module evaluation actions an operator could already trigger individually from each module's own page — it introduces no new mutation capability.
- The findings-row contextual action labels are visual/informational only in this feature (matching the precedent already established for this app's other recently-redesigned pages) — a future feature may wire specific ones to real remediation actions, each requiring its own review given how varied and sometimes destructive real remediation for these 17 finding kinds would be.
- The trend chart's per-day computation reuses this app's existing "state as of a cutoff time" query pattern rather than introducing new snapshot storage — its performance characteristics are a planning-phase decision, not a scope change.
