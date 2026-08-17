# Feature Specification: Manual Re-scan Trigger

**Feature Branch**: `024-manual-rescan-trigger`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Add a manual 'Re-scan' trigger to every module dashboard page that has server-side evaluation state (Exposure, DNS, Storage, Security, Zero Trust, Pages). Closes GitHub issue #414: all six modules already have a working re-evaluate backend endpoint, but there is currently zero UI anywhere that calls it — the only place these endpoints are even mentioned today is empty-state copy instructing the operator to trigger one via a raw curl POST themselves. Primary user story: an operator just fixed something and wants to confirm the fix actually cleared the finding, without waiting for the next scheduled scan or opening a terminal. Secondary story: an operator on a module that has never been evaluated at all needs a way to trigger the very first run from the UI. Explicitly out of scope: anything that mutates actual Cloudflare account configuration, changing the scheduled/cron cadence, and standardizing which pages show an evaluation timestamp."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirm a fix cleared a finding, on demand (Priority: P1)

An operator on any of the six module dashboards (Exposure, DNS, Storage, Security, Zero Trust, Pages) just made a change elsewhere — attached an Access policy, tightened a WAF rule, added a DNS proxy — and wants to see whether that specific finding is now clear, right now, without waiting for the next scheduled scan or leaving the app to run a raw command themselves.

**Why this priority**: This is the entire reason the feature exists (issue #414) — closing the loop between "I fixed something" and "did it work" is the actual workflow gap. Without this, the feature delivers no value.

**Independent Test**: From any of the six module dashboards showing existing results, trigger a re-scan and confirm the page's data refreshes to reflect the just-completed scan, without navigating away or manually reloading the page.

**Acceptance Scenarios**:

1. **Given** an operator is viewing a module dashboard with existing findings, **When** they trigger a re-scan, **Then** the system re-evaluates that module and the page's findings update to reflect the new results once the scan completes.
2. **Given** a re-scan is in progress, **When** the operator looks at the trigger control, **Then** it clearly indicates a scan is running (not just sitting inert) and cannot be triggered again until the current one finishes.
3. **Given** a re-scan completes successfully, **When** the operator looks at the page, **Then** the finding they were checking on shows its current, post-fix status — not stale data from before the fix.
4. **Given** a re-scan fails (e.g. a transient error reaching Cloudflare), **When** the operator looks at the trigger control, **Then** an explicit error is shown and the page's existing data is left untouched, not replaced with an error state or blanked out.

---

### User Story 2 - Trigger the first-ever scan for a never-evaluated module (Priority: P2)

An operator opens a module dashboard that has never been evaluated at all (a fresh deployment, or a module whose scheduled scan hasn't fired yet) and sees an empty state that today only tells them to run a raw command themselves. They need to trigger that first run directly from the page.

**Why this priority**: Real, but a narrower audience than User Story 1 (only hit on a module's very first use, or after data loss) — everything after the first run falls into User Story 1's territory.

**Independent Test**: Open a module dashboard with no evaluation history. Confirm the empty state offers a way to trigger a scan directly, and that doing so transitions the page from the empty state to showing real results once the scan completes.

**Acceptance Scenarios**:

1. **Given** a module has never been evaluated, **When** the operator views its dashboard, **Then** the empty state offers a direct way to trigger the first scan, not just instructions for a manual API call.
2. **Given** the operator triggers the first scan from that empty state, **When** the scan completes, **Then** the page shows the resulting findings, replacing the empty state entirely.

### Edge Cases

- What happens if the operator navigates away from the page (or to a different module) while a re-scan they triggered is still running? The in-progress scan must still complete and persist its results server-side regardless of whether the operator is still looking at the page that triggered it — the trigger only kicks the scan off, it doesn't own the scan's lifecycle.
- What happens if two people trigger a re-scan on the same module at close to the same time? Both scans may run; whichever result is written last is what subsequently loads. Not a scenario this feature needs to prevent or coordinate — the same is already true of the existing scheduled scan racing an interactive one.
- What happens on a module whose re-scan takes longer than a few seconds (a large account with many resources)? The pending state must remain accurate for however long the scan actually takes — no premature "done" while data is still being written, and no confusing indefinite spinner with no explanation if it runs long.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every one of the six module dashboards (Exposure, DNS, Storage, Security, Zero Trust, Pages) MUST offer a control that triggers a fresh evaluation for that module on demand.
- **FR-002**: Triggering a re-scan MUST re-run that module's own detection logic — the exact same detection a scheduled scan already runs — not a separate or lighter-weight check.
- **FR-003**: Once a triggered re-scan completes, the page MUST refresh its displayed findings to reflect the new results automatically, without requiring the operator to manually reload.
- **FR-004**: While a re-scan is in progress, the triggering control MUST clearly communicate that a scan is running and MUST NOT allow a second scan to be triggered concurrently from the same control.
- **FR-005**: If a triggered re-scan fails, the system MUST show an explicit error and MUST leave the page's currently-displayed findings unchanged — a failed re-scan must never blank the page or silently discard what was already showing.
- **FR-006**: A module with no evaluation history MUST offer the same on-demand trigger directly from its empty state, replacing any instruction that tells the operator to issue a manual API call themselves.
- **FR-007**: The re-scan trigger MUST NOT mutate any actual Cloudflare account configuration — it only re-runs this application's own read-only detection, consistent with every affected module's existing detection-only scope.
- **FR-008**: The re-scan trigger MUST be available to the same set of users who can already view the module dashboard — it MUST NOT introduce a new permission restriction beyond what already gates access to the page.

### Key Entities

- **Re-scan trigger**: The on-demand control (available in both the loaded-data state and the never-evaluated empty state of each module dashboard) that starts a fresh evaluation for that specific module and reports back whether it succeeded or failed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can confirm whether a just-made fix cleared a specific finding without leaving the app or using a command-line tool, in under 30 seconds of interaction (not counting the scan's own run time).
- **SC-002**: 100% of the six module dashboards offer the same on-demand re-scan capability — no module is left requiring a manual API call as its only refresh path.
- **SC-003**: Every re-scan attempt ends in one of exactly two clearly distinguishable outcomes for the operator — refreshed results, or an explicit error — never an ambiguous or silent non-outcome.
- **SC-004**: A module that has never been evaluated can go from "empty, instructing a manual API call" to "showing real findings" through UI interaction alone, with zero API calls made outside the application.

## Assumptions

- The re-scan trigger is visible and usable by any user who can already reach the module dashboard it's on — matching the current, pre-existing authorization of the backend evaluation endpoints, which this feature does not change or tighten.
- This feature does not change the scheduled/automatic scan cadence in any way — the manual trigger is additive, for on-demand confirmation, not a replacement for scheduled scanning.
- This feature does not standardize which module dashboards display an evaluation timestamp near the trigger — that existing inconsistency across modules is out of scope here.
- A re-scan may take more than a few seconds on an account with many resources; the trigger's pending state is expected to reflect the scan's real duration rather than assume it's always near-instant.
