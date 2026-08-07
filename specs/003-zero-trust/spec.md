# Feature Specification: Zero Trust / Access

**Feature Branch**: `003-zero-trust`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Module 3 — Zero Trust / Access: applications, policies, groups, service tokens. Per constitution §2 item 3. Module 1 already surfaces Access coverage narrowly scoped to Worker hostnames; this module is the full, account-wide Zero Trust audit — every Access application regardless of what it protects, policy openness account-wide, and service token lifecycle (expiry) visibility."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every Access application and its policies, account-wide (Priority: P1)

An operator opens FlareTower and sees every Cloudflare Access application
in the account — not just the ones covering a Worker hostname (Module 1's
narrower scope) — with its policies, in one place.

**Why this priority**: Access applications protect far more than Workers:
internal tools, VPN-style self-hosted apps, SaaS integrations. An operator
today has no single-page inventory of everything Access is supposed to be
guarding. This is the foundation every other capability in this module
builds on, same role User Story 1 played in Modules 1 and 2.

**Independent Test**: Can be fully tested by connecting FlareTower to an
account with a mix of Access application types (self-hosted, SaaS) and
confirming every one appears with its policies listed, regardless of what
resource it protects.

**Acceptance Scenarios**:

1. **Given** an account with Access applications protecting a mix of
   Workers, non-Worker origin servers, and SaaS integrations, **When** the
   operator opens the inventory, **Then** every application appears exactly
   once, with all of its policies listed.
2. **Given** an application with zero policies attached, **When** the
   operator views it, **Then** it still appears in the inventory (not
   omitted), with its policy list empty.
3. **Given** the same application already appears in Module 1's exposure
   inventory because it covers a Worker hostname, **When** the operator
   views this module's inventory, **Then** the application still appears
   here too — this module's inventory is account-wide and independent of
   Module 1's Worker-hostname scoping, not a filtered subset of it.

---

### User Story 2 - Get flagged when a policy is effectively open, account-wide (Priority: P1)

Any Access application whose policies don't meaningfully restrict who can
reach it — an "Allow, Everyone" policy, a "Bypass" policy, or an
application with no policies at all — is flagged, distinctly and
immediately, everywhere it appears, regardless of what the application
protects.

**Why this priority**: This is the account-wide generalization of the same
risk Module 1 flags narrowly for Worker-covering applications — an
Access-protected internal tool or SaaS integration with an effectively-open
policy is exactly as exposed as an unprotected Worker, and today nothing
surfaces it unless it happens to also cover a Worker hostname.

**Independent Test**: Can be fully tested by creating a test Access
application (protecting anything, not necessarily a Worker) with an
"Allow, Everyone" policy and confirming it renders as flagged, without
Module 1 or any Worker being involved.

**Acceptance Scenarios**:

1. **Given** an application with a policy that allows Everyone, **When**
   the operator views it, **Then** it is flagged, with a reason naming the
   open policy.
2. **Given** an application with only meaningfully-scoped policies (a
   specific IdP group, an email domain, etc.), **When** the operator views
   it, **Then** it is not flagged.
3. **Given** an application with a "Bypass" policy (skips identity
   verification entirely), **When** the operator views it, **Then** it is
   flagged as open, the same as an Allow-Everyone policy.
4. **Given** an application with zero policies attached, **When** the
   operator views it, **Then** it is flagged — an unconfigured application
   is worth surfacing, not silently treated as safe (matches Module 1's
   equivalent decision for zero-policy applications).

---

### User Story 3 - Get flagged when a service token is expiring or has no expiration (Priority: P2)

Every Cloudflare Access service token in the account is inventoried, and
one that is already expired, expiring soon, or was created without any
expiration at all is flagged as worth reviewing.

**Why this priority**: Service tokens are long-lived, non-interactive
credentials — the DNS module's "dangling record" and Module 1's "open
policy" both concern human-facing access; this is the module's equivalent
risk for machine-to-machine access. A forgotten, non-expiring service token
is a standing credential nobody is watching. This depends on User Story 1's
Access application inventory existing conceptually but is independently
testable and delivers value without it (service tokens are inventoried on
their own, not nested under a specific application).

**Independent Test**: Can be fully tested by creating one service token
with a past expiration date, one expiring within the near-term window, one
healthy (far-future expiration), and one with no expiration set, and
confirming each renders with the correct distinct status.

**Acceptance Scenarios**:

1. **Given** a service token whose expiration date has already passed,
   **When** the operator views the service token inventory, **Then** it is
   flagged critical.
2. **Given** a service token expiring within the next 14 days, **When** the
   operator views it, **Then** it is flagged warning, distinct from an
   already-expired token.
3. **Given** a service token with no expiration date ever set, **When** the
   operator views it, **Then** it is flagged warning — a credential that
   never expires is worth an operator's attention even though it isn't
   imminently failing.
4. **Given** a service token with a healthy, far-future expiration date,
   **When** the operator views it, **Then** it is marked safe.

---

### User Story 4 - Get notified when Zero Trust posture drifts, without opening the panel (Priority: P2)

The same evaluation that powers the interactive inventory also runs on the
existing shared scheduled audit (constitution Principle III, joining
Modules 1 and 2's scheduled evaluation rather than adding a new Cron
Trigger). When a policy newly becomes effectively open, or a service token
newly becomes expired or crosses into the expiring-soon window, the
operator is alerted without having opened FlareTower.

**Why this priority**: Same "drift between visits" rationale as every
other module's User Story 4. A policy someone loosens for a debugging
session and forgets to revert, or a service token quietly crossing its
expiry threshold, both accumulate silently otherwise.

**Independent Test**: Can be fully tested by running the scheduled scan
against a test account, then loosening a test application's policy to
Allow-Everyone between two scheduled runs, and confirming an alert fires
after the run that observes it.

**Acceptance Scenarios**:

1. **Given** the scheduled scan previously found no open policies or
   expiring tokens, **When** a policy becomes effectively open before the
   next scheduled run, **Then** an alert is raised after that run
   completes.
2. **Given** a finding was already flagged on the previous run and remains
   in the same state, **When** the run completes, **Then** the operator is
   not re-alerted for the same still-flagged item on every run.
3. **Given** the scheduled scan cannot evaluate part of the account (e.g.
   an API error), **When** the run completes, **Then** that failure is
   itself surfaced, not silently treated as "nothing new."

---

### Edge Cases

- What happens when an application has multiple policies, some scoped and
  some open? Per Access's own evaluation order (Bypass/Service Auth first,
  then Allow/Block in listed order — matching the decision logic already
  established in Module 1's policy-openness check), any policy that grants
  access to Everyone or bypasses identity makes the application open,
  regardless of other, more restrictive policies also present.
- What happens when a policy's decision is "Deny" and targets Everyone?
  This is the opposite of open (it blocks everyone) and must not be
  flagged — same distinction Module 1 already established (decision type
  matters, not just who the policy names).
- What happens when a service token exists but is not referenced by any
  current policy (an orphaned token)? It is still inventoried and evaluated
  for expiry — an orphaned-but-valid token is a separate, lower-priority
  observation than expiry and is not required scope for this spec (may be
  a future enhancement).
- What happens when the account has zero Access applications or zero
  service tokens at all? The inventory shows an empty (not omitted, not
  errored) result for that section.
- What happens the very first time the scheduled scan runs? Every
  critical/warning finding from that first run must still trigger an
  alert — no grace period, same as every other module's equivalent edge
  case.
- What happens when the configured API token lacks sufficient scope to
  list applications, policies, or service tokens? Those items are shown as
  "not fully evaluated," never silently omitted or presented as safe.
- What counts as "expiring soon" for a service token? This spec sets the
  threshold at 14 days, matching common credential-rotation review
  cadences; the exact number is a product decision recorded here, not a
  planning-level detail.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enumerate every Access application in the
  account, regardless of what resource it protects, and MUST list each
  application's policies.
- **FR-002**: System MUST present the full inventory of applications and
  their policies in a single view, with every application represented
  exactly once, independent of Module 1's Worker-hostname-scoped exposure
  inventory.
- **FR-003**: System MUST mark an application as flagged when any of its
  policies grants access to Everyone (with an "allow"-type decision) or
  bypasses identity verification, or when the application has zero
  policies attached.
- **FR-004**: System MUST NOT flag an application based on a policy whose
  decision denies access, even if that policy's selector targets Everyone.
- **FR-005**: System MUST enumerate every Access service token in the
  account, including its expiration date if one is set.
- **FR-006**: System MUST mark a service token critical when its
  expiration date has already passed.
- **FR-007**: System MUST mark a service token warning when its expiration
  date is within 14 days, or when it has no expiration date set at all.
- **FR-008**: System MUST mark a service token safe when its expiration
  date is healthy (more than 14 days away).
- **FR-009**: System MUST evaluate applications, policies, and service
  tokens using the same logic in both the on-demand interactive view and
  the existing shared recurring scheduled run (constitution Principle
  III), with no divergence between the two.
- **FR-010**: System MUST alert when the scheduled run finds an
  application or service token newly in a flagged state that was not
  flagged on the previous run.
- **FR-011**: System MUST NOT re-alert on every scheduled run for a
  finding whose flagged state is unchanged from the previous run.
- **FR-012**: System MUST require the operator to be authenticated before
  viewing any Zero Trust data.
- **FR-013**: System MUST clearly indicate, per application or service
  token, when it could not be fully evaluated (e.g. insufficient token
  scope, an API error), and MUST NOT present an unevaluated item as safe.
- **FR-014**: System MUST NOT modify any Access application, policy,
  service token, or other Cloudflare account configuration as part of this
  feature — this module is detection-only; configuration mutation is out
  of scope for this spec.

### Key Entities

- **Access Application**: An account-wide Cloudflare Access application —
  name, domain/type, its policies. Independent of what resource it
  protects (Worker, other origin, SaaS).
- **Access Policy**: A rule attached to an application — decision type
  (allow/deny/bypass/etc.), whether it targets Everyone or a scoped
  selector (group, email domain, IdP, etc.).
- **Service Token**: A long-lived, non-interactive Access credential —
  name, expiration date (if any).
- **Zero Trust Finding**: The evaluated state of one application or one
  service token at a point in time — safe, warning, critical, or not
  evaluated — per the product's established status semantics (shared
  across all modules).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can see every Access application and every
  service token in the account, account-wide, within one minute of opening
  the panel.
- **SC-002**: 100% of Access applications and service tokens appear in the
  inventory — zero silent omissions.
- **SC-003**: An application whose policy becomes effectively open is
  detected and alerted on within one scheduled scan cycle, with no
  operator action required.
- **SC-004**: An operator can distinguish, for every application and every
  service token, "confirmed safe," "confirmed flagged," and "not fully
  evaluated" — zero items left ambiguous.
- **SC-005**: Across repeated scheduled runs with no underlying change, the
  operator receives zero duplicate alerts for the same unchanged finding.

## Assumptions

- The Cloudflare API token configured for FlareTower has, at minimum,
  read-only access to Access applications, policies, and service tokens
  account-wide. Per the project constitution, this module requires
  read-only scope only.
- The 14-day "expiring soon" threshold for service tokens (FR-007) is a
  fixed product decision for this spec, not user-configurable in this
  iteration — making it configurable is reasonable future scope, not
  required to ship.
- Groups (constitution §2 item 3's "groups") are referenced by policies as
  a selector type but this spec does not require a standalone
  groups-management or group-membership audit view; that is reasonable
  future scope within this module, not required for the module's first
  shippable increment (mirrors how Module 1 shipped detection before any
  mutation capability, and how Module 2 shipped dangling-detection before
  a full DNSSEC/CAA audit).
- How an alert reaches the operator is out of scope for this spec,
  consistent with every other module's Assumptions.
- Historical drift tracking belongs to the future Audit & Drift module
  (constitution §2 item 7) and is out of scope here.
- No Cloudflare API scopes beyond Access/service-token read access are
  requested for this module; mutation capability (e.g. one-click policy
  tightening, token rotation) is explicitly future scope.
