# Feature Specification: Audit & Drift

**Feature Branch**: `007-audit-drift`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Module 7 — Audit & Drift: snapshot history, 'what changed since yesterday,' scheduled scans with alerting. Per constitution §2 item 7, the final module. Unlike Modules 1-6, this module does not inventory a new Cloudflare resource type — it aggregates the finding and alert history every prior module already persists to D1 (14 finding/alert table pairs across exposure, DNS, Zero Trust, Pages, R2/KV/D1, and Security Posture) into one cross-module view: a unified outstanding-alerts inbox, an account-wide posture summary, and a 'what changed since a given point in time' digest. No new Cloudflare API calls are made by this module at all — it is a read-only aggregation layer over state Modules 1-6 already collect."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every outstanding alert from every module, in one place (Priority: P1)

An operator opens FlareTower's Audit view and sees every unacknowledged
alert from all six other modules — exposed Workers, dangling DNS
records, open Access policies, expired service tokens, exposed
`pages.dev` subdomains, unused KV namespaces, weak SSL/TLS modes, and
every other kind of drift finding — in one chronological list, without
visiting six separate module pages.

**Why this priority**: Today, catching every outstanding issue requires
opening six different tabs and checking each module's own alerts
endpoint. A single unified inbox is the most direct expression of the
product's founding goal ("making configuration drift immediately
visible") and the natural capstone once six modules' worth of alerts
exist to aggregate. This is the foundation the rest of this module
builds on, the same role User Story 1 plays in every prior module.

**Independent Test**: Can be fully tested by seeding outstanding alerts
in several different modules' alert tables and confirming every one
appears in the unified inbox, tagged with which module and check
produced it, sorted newest first.

**Acceptance Scenarios**:

1. **Given** unacknowledged alerts exist across multiple modules, **When**
   the operator opens the unified inbox, **Then** every one appears
   exactly once, each labeled with its source module and check kind,
   ordered by detection time (most recent first).
2. **Given** an alert has already been acknowledged in its own module,
   **When** the operator views the unified inbox, **Then** it does not
   appear.
3. **Given** the operator acknowledges an alert from the unified inbox,
   **When** they check that alert's own module later, **Then** it shows
   as acknowledged there too — acknowledging is not a separate,
   parallel state; the unified inbox acts on the same underlying record.
4. **Given** no module has any outstanding alerts, **When** the operator
   opens the unified inbox, **Then** it shows an empty (not omitted, not
   errored) result.

---

### User Story 2 - See what changed since a given point in time (Priority: P1)

An operator picks a point in time (defaulting to 24 hours ago) and sees
every finding, across every module, whose status is different now than
it was at that point — newly critical, newly resolved, newly warning,
and so on — in one digest.

**Why this priority**: This is the constitution's own named capability
for this module ("what changed since yesterday"). Each module's own
scheduled alerting only ever compares one run to the immediately
previous run — if an operator hasn't checked FlareTower in a few days,
or wants a daily digest rather than a live feed, nothing today answers
"what's different since I last looked." This is independently testable
and delivers real standalone value distinct from User Story 1's
point-in-time inbox.

**Independent Test**: Can be fully tested by recording a finding's
status at one point in time, changing it, recording a new status, then
requesting the digest for a window spanning both points and confirming
the change appears with its before/after status.

**Acceptance Scenarios**:

1. **Given** a finding was safe at the start of the requested window and
   is critical now, **When** the operator requests the digest, **Then**
   it appears with both the previous and current status.
2. **Given** a finding's status has not changed across the requested
   window, **When** the operator requests the digest, **Then** it does
   not appear.
3. **Given** an entity was first observed inside the requested window
   (e.g. a bucket created two hours ago) and is already flagged,
   **When** the operator requests the digest, **Then** it appears with
   no previous status, the same "first-ever finding still counts"
   principle every module's own alerting already follows.
4. **Given** the operator does not specify a window, **When** they
   request the digest, **Then** it defaults to the last 24 hours.

---

### User Story 3 - See an account-wide posture summary (Priority: P2)

An operator sees, for every module, a count of how many of its checks
are currently safe, warning, critical, and not evaluated — a one-glance
health rollup of the entire account, without opening any individual
module.

**Why this priority**: Complements User Story 1's itemized inbox with
the opposite view: a manager or an operator doing a quick daily check
wants "is anything on fire" before they want the full itemized list.
Independently testable and valuable without User Stories 1 or 2.

**Independent Test**: Can be fully tested by seeding findings with known
statuses across several modules and confirming the summary's counts per
module and per status match exactly.

**Acceptance Scenarios**:

1. **Given** findings exist across multiple modules with a mix of
   statuses, **When** the operator requests the summary, **Then** each
   module shows the correct count of safe, warning, critical, and not
   evaluated findings from its latest run.
2. **Given** a module has not run an evaluation yet, **When** the
   operator requests the summary, **Then** that module shows as "no
   data yet," not zero counts (zero counts would misleadingly imply a
   clean bill of health).

---

### User Story 4 - Get a daily drift digest logged automatically (Priority: P2)

The same "what changed since a given point in time" logic that powers
User Story 2's interactive digest also runs on the existing shared
scheduled audit (constitution Principle III, joining Modules 1-6's
scheduled evaluation rather than adding a new Cron Trigger), computing
how many findings changed status across the account in the last 24
hours and recording that count.

**Why this priority**: Same "don't require the operator to remember to
check" rationale as every other module's scheduled story — but scoped
to what this module actually adds: it does not invent a new alert
stream (the fourteen underlying alert streams already exist and already
notify on their own drift), it materializes the daily rollup number so
"how much changed today" is answered without re-scanning every
module's history live each time the digest is requested.

**Independent Test**: Can be fully tested by running the scheduled scan
against a test account on two consecutive (simulated) days with a known
number of status changes between them, and confirming the logged count
matches.

**Acceptance Scenarios**:

1. **Given** five findings changed status in the last 24 hours,
   **When** the scheduled scan runs, **Then** it logs that five findings
   changed, the same visible-without-opening-the-panel principle every
   other module's scheduled story already establishes.
2. **Given** nothing changed in the last 24 hours, **When** the
   scheduled scan runs, **Then** it logs zero changes — a quiet
   confirmation, not silence that could be mistaken for the scan not
   having run at all.

---

### Edge Cases

- What happens to an entity that no longer appears in a module's latest
  run at all (e.g. a bucket was deleted, a Worker was removed)? This
  module does not attempt to detect "the entity itself disappeared" as
  a kind of change — it only compares the status of entities that
  appear in both the current and the compared-against point in time.
  Detecting removed entities is reasonable future scope, not required
  for this module's first shippable increment (mirrors how every prior
  module deferred a related but distinct enhancement — e.g. Module 5
  deferring rule-level WAF detail, Module 6 deferring individual
  Turnstile widget correctness).
- What happens when a module's underlying finding or alert table can't
  be queried at all (a genuine D1 error, not "no rows yet")? That
  module's contribution to the unified inbox, summary, or digest is
  shown as "not available," and the rest of the aggregation still
  completes — one module's D1 read failure must not blank out the
  other five.
- What happens when two different modules' entities happen to have the
  same display name (e.g. a DNS zone and a Security Posture zone with
  the same `zone_name`)? Each aggregated item is always labeled with
  its source module and check kind, so this is never ambiguous to the
  operator even if two labels read identically.
- What happens the very first time this module's scheduled digest runs,
  with no prior digest to compare against? It still computes and logs
  the count of changes within the default 24-hour window using the
  underlying modules' own historical findings — this module needs no
  "first run" state of its own, since it has no persisted state beyond
  what it reads live from the other six modules.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST aggregate every unacknowledged alert from all
  six other modules into a single unified list, each entry labeled with
  its source module and check kind, ordered by detection time.
- **FR-002**: System MUST allow acknowledging an alert from the unified
  inbox, and that acknowledgment MUST be reflected identically in the
  alert's own originating module — the unified inbox acts on the same
  underlying record, not a separate copy.
- **FR-003**: System MUST allow requesting a "what changed" digest for a
  time window, defaulting to the last 24 hours when no window is
  specified, listing every finding across every module whose status
  differs between the start and end of the window.
- **FR-004**: System MUST include, for each changed finding in the
  digest, its previous status (or none, if the entity was first
  observed inside the window) and its current status.
- **FR-005**: System MUST NOT include a finding in the digest when its
  status is unchanged across the requested window.
- **FR-006**: System MUST present an account-wide summary showing, per
  module, the count of currently safe, warning, critical, and not
  evaluated findings from that module's latest run.
- **FR-007**: System MUST distinguish a module that has not yet run any
  evaluation from a module with zero flagged findings — the former MUST
  NOT be presented as if it had a clean bill of health.
- **FR-008**: System MUST compute the "what changed" digest using the
  same logic in both the on-demand interactive view and the existing
  shared recurring scheduled run (constitution Principle III), with no
  divergence between the two.
- **FR-009**: System MUST require the operator to be authenticated
  before viewing any Audit & Drift data.
- **FR-010**: System MUST clearly indicate when one module's underlying
  data could not be read at all, and MUST continue aggregating the
  other modules' data rather than failing the entire request.
- **FR-011**: System MUST NOT modify any finding produced by another
  module, and MUST NOT modify any Cloudflare account configuration —
  this module is a read-only aggregation layer; the only write it
  performs is acknowledging an alert, which is the same write that
  module's own acknowledge endpoint already performs.

### Key Entities

- **Unified Alert**: one alert from one of the six other modules'
  alert tables, labeled with its source module and check kind for
  display — not a new persisted record, a read-through view of the
  original.
- **Posture Summary Entry**: one module's current count of safe,
  warning, critical, and not-evaluated findings, or an explicit
  "no data yet" state.
- **Change Entry**: one finding whose status differed between two
  points in time within a requested window — source module, check
  kind, entity label, previous status (or none), current status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can see every outstanding alert from every
  module in one place within one minute of opening the Audit view, with
  zero need to visit any individual module's own page first.
- **SC-002**: 100% of unacknowledged alerts across all six modules
  appear in the unified inbox — zero silent omissions.
- **SC-003**: An operator can determine what changed across the entire
  account in the last 24 hours in a single request, with no manual
  cross-referencing of six separate module histories.
- **SC-004**: A module with a genuine data-read failure is clearly
  distinguished from a module with a clean bill of health — zero
  modules misrepresented either way.
- **SC-005**: Acknowledging an alert from the unified inbox is
  reflected in that alert's own module with no additional operator
  action.

## Assumptions

- This module reads directly from the fourteen finding/alert table
  pairs Modules 1-6 already populate
  (`exposure_findings`/`exposure_alerts`, `dns_findings`/`dns_alerts`,
  `zt_app_findings`/`zt_app_alerts`, `zt_token_findings`/`zt_token_alerts`,
  `pages_domain_findings`/`pages_domain_alerts`,
  `pages_subdomain_findings`/`pages_subdomain_alerts`,
  `pages_deployment_findings`/`pages_deployment_alerts`,
  `r2_bucket_findings`/`r2_bucket_alerts`,
  `kv_namespace_findings`/`kv_namespace_alerts`,
  `d1_database_findings`/`d1_database_alerts`,
  `ssl_tls_findings`/`ssl_tls_alerts`, `dnssec_findings`/`dnssec_alerts`,
  `waf_findings`/`waf_alerts`, `rate_limiting_findings`/`rate_limiting_alerts`).
  It does not call the Cloudflare API and requires no new API token
  scopes beyond what Modules 1-6 already need.
- The cost of scanning each source table's history to find every entity
  that changed within a requested window is proportional to how much
  history that table retains, which is unbounded today (no module
  deletes old finding rows) — this is acceptable at the expected
  single-account scale; a future Audit module enhancement could add
  retention/archival if history volume ever becomes a real performance
  concern, but that is out of scope here.
- Detecting an entity's outright disappearance from a module's
  inventory (as opposed to a status change on an entity still present)
  is out of scope for this spec's first shippable increment (spec Edge
  Cases).
- How an alert or digest reaches the operator outside of the FlareTower
  UI (email, Slack, etc.) is out of scope for this spec, consistent
  with every other module's Assumptions.
- This module introduces no new Cloudflare API scopes and requires no
  README token-scope updates beyond what Modules 1-6 already document.
