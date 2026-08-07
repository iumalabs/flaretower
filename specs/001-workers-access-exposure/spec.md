# Feature Specification: Workers & Access Exposure

**Feature Branch**: `001-workers-access-exposure`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Module 1 — Workers & Access exposure: inventory of every Worker in the account: custom domains, workers.dev status, Preview URL status, and whether each publicly reachable hostname is covered by a Cloudflare Access application. Flags any service that is publicly reachable without Access. Surfaces Access policies that are effectively open (e.g. 'Everyone'). Founding problem: with 10-15 Workers it becomes impossible to track by hand which endpoints are publicly reachable — a Worker can be correctly protected behind Access on its custom domain while its workers.dev production URL sits wide open."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every Worker's exposure at a glance (Priority: P1)

An operator managing a Cloudflare account with many Workers opens FlareTower
and sees a single inventory listing every Worker, showing for each one: its
custom domain(s), whether its `workers.dev` URL is enabled and reachable,
whether its Preview URL is enabled and reachable, and whether each of those
publicly reachable hostnames is covered by a Cloudflare Access application.

**Why this priority**: This is the founding problem FlareTower exists to
solve. Without this view, an operator has no way to answer "which of my
Workers are actually publicly reachable right now?" without checking each
one by hand across multiple dashboard screens. Every other capability in this
module builds on this inventory existing.

**Independent Test**: Can be fully tested by connecting FlareTower to an
account with a mix of protected and unprotected Workers and confirming the
inventory lists all of them with accurate exposure status — delivers value
on its own even before any flagging or alerting exists.

**Acceptance Scenarios**:

1. **Given** an account with Workers that have custom domains, `workers.dev`
   URLs, and Preview URLs in various combinations, **When** the operator
   opens the inventory, **Then** every Worker in the account appears exactly
   once, with the status of each of its possible hostnames shown.
2. **Given** a Worker with a custom domain protected by Access but a
   `workers.dev` URL that is enabled and not behind Access, **When** the
   operator views that Worker's entry, **Then** the custom domain shows as
   protected and the `workers.dev` URL shows as unprotected — the two
   hostnames are evaluated independently, not merged into one status.
3. **Given** a Worker with no public hostnames at all (no custom domain,
   `workers.dev` disabled, Preview URL disabled), **When** the operator views
   the inventory, **Then** that Worker appears with no exposure to report,
   not omitted from the list.

---

### User Story 2 - Get flagged when a Worker is exposed without Access (Priority: P1)

Any hostname that is publicly reachable and not covered by a Cloudflare
Access application is visually flagged as critical, immediately and
unambiguously, everywhere it appears — the operator should never have to
cross-reference two screens to realize a Worker is unprotected.

**Why this priority**: Detection without a clear severity signal doesn't
solve the founding problem — an inventory the operator has to interpret
row-by-row is exactly the manual-tracking burden this module exists to
remove. This is equally foundational to User Story 1 and ships with it.

**Independent Test**: Can be fully tested by exposing a Worker's
`workers.dev` URL with no Access application in a test account and
confirming it renders with critical status, distinct from protected
hostnames, without any other module present.

**Acceptance Scenarios**:

1. **Given** a Worker's custom domain is publicly reachable with no Access
   application covering it, **When** the operator views the inventory,
   **Then** that hostname is marked critical.
2. **Given** a Worker's `workers.dev` URL is enabled and no Access
   application covers the `workers.dev` hostname, **When** the operator
   views the inventory, **Then** that `workers.dev` entry is marked critical
   even if the Worker's custom domain is separately protected.
3. **Given** every public hostname for a Worker is covered by an Access
   application, **When** the operator views the inventory, **Then** none of
   that Worker's hostnames are marked critical.

---

### User Story 3 - See Access policies that are effectively open (Priority: P2)

For a hostname that is covered by an Access application, the operator can
see whether that application's policies actually restrict who can reach it,
or whether they amount to no restriction at all (e.g., an "Allow" policy
targeting "Everyone"). A hostname in this state is flagged as a warning,
distinct from both "critical" (no Access at all) and "safe" (meaningfully
restricted).

**Why this priority**: An Access application with an effectively-open policy
gives a false sense of security — it appears "protected" in a naive
Access-application-present check, which is a second, subtler form of the
same founding problem. This depends on User Story 1's inventory existing but
is not required for the inventory or the critical flag to deliver value on
their own.

**Independent Test**: Can be fully tested by covering a test hostname with
an Access application whose only policy is "Allow — Everyone" and confirming
it renders as a warning, not as safe, without any other module present.

**Acceptance Scenarios**:

1. **Given** a hostname covered by an Access application whose only policy
   allows "Everyone," **When** the operator views that hostname's entry,
   **Then** it is marked warning, not safe.
2. **Given** a hostname covered by an Access application with a policy
   scoped to a specific identity provider group or email domain, **When**
   the operator views that hostname's entry, **Then** it is marked safe.
3. **Given** an Access application with zero policies attached, **When** the
   operator views the hostname(s) it covers, **Then** those hostnames are
   marked warning (a policy-less application denies everyone by default in
   Cloudflare Access, but the absence of any explicit policy is itself
   surfaced rather than silently treated as safe).

---

### User Story 4 - Get notified when exposure drifts, without opening the panel (Priority: P2)

The same exposure evaluation that powers the interactive inventory also runs
on a recurring schedule, independent of anyone viewing the UI. When a
hostname that was previously safe or warning newly becomes critical (public
and unprotected), the operator is alerted without having to have opened
FlareTower to notice.

**Why this priority**: The founding problem is explicitly about
configuration drift ("a Worker can be correctly protected... while its
production URL sits wide open") — drift that happens between visits to the
panel is invisible under User Stories 1–3 alone. This is the module's
scheduled-mode counterpart to the interactive inventory, required by the
project's operating model, but it is meaningfully separate work from the
on-demand view and can be tested independently.

**Independent Test**: Can be fully tested by running the scheduled audit
against a test account, then changing a hostname from protected to
unprotected between two scheduled runs, and confirming an alert fires after
the run that observes the change — without needing the interactive UI to be
open or even implemented.

**Acceptance Scenarios**:

1. **Given** the scheduled audit ran previously and found no critical
   hostnames, **When** a hostname becomes publicly reachable without Access
   before the next scheduled run, **Then** an alert is raised after that run
   completes.
2. **Given** the scheduled audit finds a hostname that was already critical
   on the previous run and remains critical, **When** the run completes,
   **Then** the operator is not re-alerted for the same still-critical
   hostname on every single run (repeat noise is avoided).
3. **Given** the scheduled audit cannot evaluate part of the account (e.g.
   an API error), **When** the run completes, **Then** that failure is
   itself surfaced rather than silently treated as "no new critical
   findings."

---

### Edge Cases

- What happens when a Worker has multiple routes mapped to the same custom
  domain, or the same custom domain is shared across more than one Worker?
  The hostname's exposure status must still be evaluated and shown clearly,
  without duplicate or contradictory entries for the same hostname.
- What happens when the account-level `workers.dev` subdomain is disabled
  entirely? Every Worker's `workers.dev` hostname must reflect "not
  reachable," not "reachable and unprotected."
- What happens when the configured Cloudflare API token lacks sufficient
  scope to evaluate some Workers, zones, or Access applications? Those items
  must be shown as "not fully evaluated," never silently presented as safe.
- What happens when an Access application covers a hostname at a broader
  level (e.g. an entire zone or a wildcard) rather than the exact hostname?
  The evaluation must still correctly attribute coverage to the specific
  hostname being checked.
- What happens the very first time the scheduled audit runs, with no prior
  run to compare against? Every critical or warning finding from that first
  run must still trigger an alert — there is no grace period during which
  drift goes unreported.
- How does the system handle a Worker that exists but has never been
  deployed (no active version)? It must not be presented as exposed if it
  has no reachable hostname.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enumerate every Worker that exists in the
  connected Cloudflare account.
- **FR-002**: For each Worker, System MUST determine the status of each of
  its possible public hostnames: custom domain(s), the `workers.dev`
  hostname, and the Preview URL.
- **FR-003**: For each publicly reachable hostname, System MUST determine
  whether a Cloudflare Access application covers that hostname.
- **FR-004**: System MUST mark as critical any publicly reachable hostname
  not covered by any Access application.
- **FR-005**: For a hostname covered by an Access application, System MUST
  evaluate whether that application's policies meaningfully restrict access
  and MUST mark the hostname as warning when the policies are effectively
  open (including the case of an application with no policies at all) or
  safe when access is meaningfully restricted.
- **FR-006**: System MUST present the full inventory of Workers and their
  hostnames' exposure status in a single view, with every Worker in the
  account represented exactly once.
- **FR-007**: System MUST evaluate exposure using the same logic in both the
  on-demand interactive view and a recurring scheduled run, with no
  divergence in what counts as critical, warning, or safe between the two.
- **FR-008**: System MUST alert when the scheduled run finds a hostname
  newly in critical or warning state that was not in that state on the
  previous run.
- **FR-009**: System MUST NOT re-alert on every scheduled run for a hostname
  whose critical or warning state is unchanged from the previous run.
- **FR-010**: System MUST require the operator to be authenticated before
  viewing any exposure data.
- **FR-011**: System MUST clearly indicate, per Worker or hostname, when it
  could not be fully evaluated (e.g. insufficient token scope, an API
  error), and MUST NOT present an unevaluated item as safe.
- **FR-012**: System MUST NOT modify any Worker, Access application, Access
  policy, or other Cloudflare account configuration as part of this
  feature — this module is detection-only; configuration mutation is out of
  scope for this spec.

### Key Entities

- **Worker**: A deployed Cloudflare Worker script in the account. Relevant
  attributes: name, its custom domain(s), `workers.dev` status, Preview URL
  status.
- **Hostname**: A specific publicly-addressable endpoint through which a
  Worker can be invoked — a custom domain, the account's `workers.dev`
  subdomain for that Worker, or its Preview URL. Each hostname is evaluated
  independently.
- **Access Application**: A Cloudflare Zero Trust Access application that
  may cover one or more hostnames, gating who can reach them.
- **Access Policy**: A rule attached to an Access Application. Can be
  meaningfully restrictive (e.g. scoped to a group or email domain) or
  effectively open (e.g. "Allow — Everyone," or absent entirely).
- **Exposure Finding**: The evaluated state of one hostname at a point in
  time — safe, warning, or critical — per the product's established status
  semantics.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator managing an account with 10-15 Workers can
  identify every publicly reachable, Access-unprotected hostname within one
  minute of opening the panel.
- **SC-002**: 100% of Workers in the connected account appear in the
  inventory — zero silent omissions.
- **SC-003**: A hostname that transitions from protected to unprotected is
  detected and alerted on within one scheduled audit cycle, with no operator
  action required to trigger the check.
- **SC-004**: An operator can distinguish, for every item in the inventory,
  "confirmed safe," "confirmed warning," "confirmed critical," and "not
  fully evaluated" — with zero items left ambiguous as to which of these
  four states they're in.
- **SC-005**: Across repeated scheduled runs with no underlying change, the
  operator receives zero duplicate alerts for the same unchanged finding.

## Assumptions

- The Cloudflare API token configured for FlareTower has, at minimum,
  read-only access to Workers scripts/routes/domains, Zero Trust Access
  applications and policies, and account-level settings (e.g. the
  `workers.dev` subdomain toggle). Per the project constitution, this module
  requires read-only scope only — no write scope is needed for detection.
- "Publicly reachable" means reachable by an anonymous request without a
  Cloudflare Access challenge; a hostname sitting behind Access is not
  itself a finding, regardless of which policy protects it (beyond the
  effectively-open check in User Story 3).
- The scheduled audit's exact cadence (e.g. hourly vs. every few minutes) is
  a planning-level decision and is not fixed by this spec — this spec
  requires only that a recurring, unattended check exists and that drift is
  caught within it.
- How an alert reaches the operator (e-mail, in-app banner, other channel)
  is a planning-level decision out of scope for this spec; this spec
  requires only that an alert-worthy event is reliably detected and
  distinguished from a repeat of an already-known finding.
- Historical drift tracking — "what changed since yesterday," a full
  snapshot history browsable over time — belongs to the future Audit &
  Drift module (constitution §2 item 7) and is out of scope here. This
  module needs only current-state evaluation plus new-vs-repeat alerting,
  not a browsable history.
- No Cloudflare API scopes beyond what is listed above are requested for
  this module; adding mutation capability (e.g. one-click "attach Access
  application") is explicitly future scope, not part of this spec.
