# Feature Specification: Audit Dashboard

**Feature Branch**: `018-audit-dashboard`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Audit module dashboard — adds a real 'Audit log' panel to the
existing Audit & Drift page per the design source's §14 'Audit' mockup. This is spec 018, the
seventh and last of the 7-spec per-module dashboard rollout. Reuses
worker/modules/workers-dashboard/audit-log.ts's fetchAccountAuditLog() completely unmodified
(built specifically for this reuse) — no new Cloudflare API call, no new token scope. Filter
chips limited to the 2 real values Cloudflare's Audit Logs API actually returns (dashboard/api) —
Wrangler/Terraform chips shown in the mockup have no real data source and are excluded. Adds a
client-side JSONL export. The existing Unified alerts inbox / What changed / Account-wide posture
summary sections are untouched — this spec is purely additive."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See real account activity, not just this project's own findings (Priority: P1)

An operator viewing the Audit & Drift page sees a chronological feed of real Cloudflare account
activity from the last 7 days — who did what, when, and what changed — alongside the existing
sections, which only ever show this project's own evaluated findings and status transitions.

**Why this priority**: This is the entire point of the feature — every other section on this page
answers "what does FlareTower think changed," but an operator investigating an incident needs "what
actually happened in the account," which only Cloudflare's own audit trail can answer.

**Independent Test**: Can be fully tested by connecting FlareTower to an account with recent
dashboard and API activity and confirming the Audit log panel shows real entries with accurate
time, actor, action, target, and result values.

**Acceptance Scenarios**:

1. **Given** an account with activity in the last 7 days, **When** the operator views the Audit log
   panel, **Then** each entry shows a real timestamp, actor, action, target, and (when available) a
   summary of what changed.
2. **Given** an account with zero activity in the last 7 days, **When** the operator views the
   panel, **Then** it shows an explicit empty state, not an error.
3. **Given** the Cloudflare Audit Logs API is temporarily unavailable, **When** the operator views
   the panel, **Then** it shows an explicit unavailable state, distinct from "confirmed zero
   activity."

---

### User Story 2 - Narrow the feed to a real activity source (Priority: P2)

An operator can filter the Audit log panel to only dashboard-initiated or only API-initiated
activity.

**Why this priority**: A real, useful narrowing — but secondary to simply having the feed at all.

**Independent Test**: Can be fully tested by connecting to an account with both dashboard and API
activity and confirming each filter shows only the matching entries.

**Acceptance Scenarios**:

1. **Given** entries from both sources, **When** the operator selects the "Dashboard" filter,
   **Then** only dashboard-initiated entries remain visible.
2. **Given** entries from both sources, **When** the operator selects "All sources," **Then** every
   entry is visible again.

---

### User Story 3 - Export the visible entries (Priority: P3)

An operator can download the currently-filtered Audit log entries as a file for offline review or
attaching to an incident report.

**Why this priority**: Convenient but not essential — the operator can already read every entry on
the page.

**Independent Test**: Can be fully tested by applying a filter, triggering the export, and
confirming the downloaded file contains exactly the currently-visible entries and no others.

**Acceptance Scenarios**:

1. **Given** a filtered view, **When** the operator triggers the export, **Then** the downloaded
   file contains only the entries currently visible, one JSON object per line.

### Edge Cases

- What happens when an entry has no available "what changed" detail (e.g. a login event)? The
  Result column shows an explicit empty/dash state, never a fabricated summary.
- What happens when the account has real activity from a source other than dashboard or API (should
  this ever occur)? It still appears under "All sources," just not matched by either specific
  filter — never silently dropped.
- What happens when the export is triggered with zero entries currently visible (e.g. an empty
  filter result)? It still produces a valid (empty) file, not an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Audit & Drift page MUST show a panel listing real Cloudflare account activity
  from the last 7 days: time, actor, action, target, and (when available) a summary of what
  changed.
- **FR-002**: The system MUST NOT fabricate a "what changed" summary when none is available from
  the underlying activity record.
- **FR-003**: The panel MUST distinguish "confirmed zero activity in the window" from "activity
  could not be retrieved."
- **FR-004**: The operator MUST be able to filter the panel to All sources, Dashboard-only, or
  API-only — reflecting only the source values Cloudflare's own activity records actually contain.
- **FR-005**: The system MUST NOT offer a filter option for an activity source Cloudflare's records
  cannot actually distinguish.
- **FR-006**: The operator MUST be able to export the currently-filtered entries as a downloadable
  file, one entry per line.
- **FR-007**: The system MUST NOT provide any control on this panel that mutates Cloudflare account
  state — it remains read-only, matching every other module.
- **FR-008**: The existing Unified alerts inbox, What changed, and Account-wide posture summary
  sections MUST remain unchanged in behavior and position on the page.

### Key Entities

- **Account activity entry**: timestamp, actor identity, activity source (dashboard or API),
  action description, target, and an optional summary of what changed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can identify what real account activity occurred in the last 7 days
  without leaving the Audit & Drift page.
- **SC-002**: Every value shown in the Audit log panel traces to a real Cloudflare Audit Logs API
  response — none are estimated, interpolated, or hardcoded.
- **SC-003**: An operator can produce a file of the currently-filtered activity for offline review
  in under 5 seconds.

## Assumptions

- Cloudflare's Audit Logs API distinguishes activity only by "dashboard" or "api" interface — there
  is no way to further distinguish an API call made by Wrangler, Terraform, or any other API
  client, so filter options are limited to what's actually derivable, not the design mockup's
  broader (Wrangler/Terraform-inclusive) set.
- The 7-day activity window is fixed, not operator-adjustable, for this feature — a full
  date-range picker is a reasonable future enhancement but disproportionate to this feature's
  primary value (having the feed at all).
- The account-wide activity feed this feature adds is unrelated to, and does not replace, this
  project's own existing finding-status change digest ("What changed") — the two answer different
  questions ("what did Cloudflare record happening" vs. "what did FlareTower's own evaluations
  detect changed") and both remain valuable side by side.
- Export is a client-side-only action over already-fetched, already-visible data — it does not
  itself contact Cloudflare's API again, and it never mutates any Cloudflare or FlareTower state.
