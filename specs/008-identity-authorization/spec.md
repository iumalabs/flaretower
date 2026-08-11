# Feature Specification: Identity, Authorization & Audit Data Model

**Feature Branch**: `008-identity-authorization`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Identity, Authorization & Audit Data Model — per constitution's own
dedicated section (not one of the 7 numbered audit modules, but required infrastructure documented
alongside them). Closes the gap where the `users` and `audit_log` tables exist from the baseline
migration but neither is wired into behavior: no operator record is ever created, the `role` column
is never read. `audit_log` itself is scoped, per constitution Principle IX, to actions that change
the managed Cloudflare account's state — no such action exists in the product yet (every module is
read-only today), so this feature builds the write-capable mechanism ready for the first such
action, without inventing a user-facing scenario to exercise it prematurely."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Returning operators are recognized across visits (Priority: P1)

FlareTower currently treats every authenticated request as anonymous beyond the single request —
there is no persistent record of who has ever used the tool, when they first showed up, or when
they were last active. This story gives FlareTower its own lightweight registry of its operators,
independent of whatever Cloudflare Access itself tracks.

**Why this priority**: This is a hard technical prerequisite for User Story 2 (a permission level
has to belong to *someone*) and is independently valuable on its own — an operator roster with
first-seen/last-active visibility is useful even before any authorization feature reads it.

**Independent Test**: Authenticate as a brand-new operator (an identity that has never reached
FlareTower before) and confirm a persistent operator record now exists for them, with a first-seen
timestamp; authenticate again later and confirm the same record's most-recent-activity timestamp
updates rather than a duplicate record being created.

**Acceptance Scenarios**:

1. **Given** an identity that has never authenticated to FlareTower before, **When** they pass the
   existing Access gate for the first time, **Then** a new operator record is created for them.
2. **Given** an identity that has authenticated before, **When** they pass the Access gate again,
   **Then** their existing operator record's most-recent-activity is updated and no second record
   is created.
3. **Given** an operator whose identity provider is known at authentication time, **When** their
   operator record is created or updated, **Then** that identity provider is recorded against them.

---

### User Story 2 - Mutating actions require FlareTower's own permission check (Priority: P2)

Today, anyone who can reach FlareTower through Cloudflare Access can perform any of its in-app
mutating actions — Access only answers "is this person allowed to reach the tool at all," not "is
this person allowed to change this." This story adds FlareTower's own permission level, so in-app
actions that change FlareTower's own state (today: acknowledging an alert) are gated by a decision
FlareTower itself makes and controls, not merely by having reached the tool at all.

**Why this priority**: Valuable and constitution-mandated ("FlareTower roles are the authority for
in-app permissions"), and the first real consumer of the operator registry from User Story 1 — but
secondary to establishing that registry in the first place.

**Independent Test**: As an operator with the default (minimal) permission level, attempt to
acknowledge an alert and confirm it is rejected without changing anything; as an operator with the
elevated permission level, confirm the same action succeeds.

**Acceptance Scenarios**:

1. **Given** an operator with the default permission level, **When** they attempt to acknowledge an
   alert, **Then** the request is rejected and the alert's state does not change.
2. **Given** an operator with the elevated permission level, **When** they acknowledge an alert,
   **Then** the action succeeds exactly as it does today.
3. **Given** an operator with the elevated permission level, **When** they promote another known
   operator to the elevated level, **Then** that operator can subsequently perform mutating actions
   themselves.
4. **Given** a fresh FlareTower deployment with no operators yet, **When** the very first person
   authenticates, **Then** they receive the elevated permission level automatically, so there is
   always at least one operator able to promote others without an out-of-band setup step.
5. **Given** an operator with the elevated permission level, **When** they view the list of known
   operators, **Then** they can see each operator's identity and current permission level, enough
   to decide who to promote.

---

### Edge Cases

- The very first operator ever to authenticate against a fresh deployment is auto-elevated (User
  Story 2, Acceptance Scenario 4) — every operator after that defaults to the minimal level.
- An operator's permission level changes while they already hold a valid Access session: the next
  action they take is evaluated against their current stored permission level, not whatever it was
  when their session began.
- An operator without the required permission level attempts a mutating action: it is rejected
  before any part of it takes effect.
- The identity provider isn't available at authentication time for a given operator: their operator
  record is still created or updated, just without that detail — this is not a failure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create a persistent operator record the first time a given identity
  authenticates successfully, and MUST reuse that same record on every subsequent authentication by
  the same identity rather than creating duplicates.
- **FR-002**: System MUST record, for every operator, when they were first seen and when they were
  most recently active, and MUST keep the most-recent-activity value current.
- **FR-003**: System MUST record which identity provider authenticated an operator whenever that
  information is available at authentication time, without failing authentication when it is not.
- **FR-004**: System MUST assign every newly created operator record a default permission level that
  does not allow performing mutating actions, except as described in FR-005.
- **FR-005**: System MUST automatically grant the elevated permission level to the very first
  operator record ever created on a given deployment, so a fresh deployment always has at least one
  operator able to promote others.
- **FR-006**: System MUST allow an operator holding the elevated permission level to grant or revoke
  the elevated permission level for any other known operator.
- **FR-007**: System MUST determine whether a given request is authorized to perform an in-app
  mutating action by reading that operator's own stored FlareTower permission level, not by trusting
  Cloudflare Access group membership as a substitute.
- **FR-008**: System MUST reject an in-app mutating action from an operator whose permission level
  does not allow it, without performing any part of that action or any state change.
- **FR-009**: System MUST apply FR-007 and FR-008 to the alert-acknowledgment action that already
  exists in every one of the seven existing audit modules, without changing that action's existing
  outward behavior for an already-authorized operator.
- **FR-010**: System MUST provide a mechanism capable of recording a permanent entry — actor,
  action, timestamp, and before/after state — for an action that changes the managed Cloudflare
  account's state, per constitution Principle IX, so that the first such action built in the future
  can adopt it immediately rather than needing its own new audit-recording code. No action in the
  product changes Cloudflare account state today, so this mechanism is not exercised by any
  user-facing flow in this increment.
- **FR-011**: System MUST allow an operator holding the elevated permission level to view the list
  of known operators and each one's current permission level, so that FR-006 (granting or revoking
  the elevated level) can actually be exercised — an operator cannot be promoted by an identifier no
  one can see.

### Key Entities

- **Operator**: A person recognized by FlareTower through its existing authentication gate, tracked
  across visits independently of whatever Cloudflare Access itself retains. Has exactly one
  permission level at any given time, a first-seen timestamp, a most-recent-activity timestamp, and
  (when known) the identity provider that authenticated them.
- **Permission Level**: A FlareTower-native designation — minimal (default) or elevated — that
  governs whether an operator may perform in-app mutating actions or change another operator's
  permission level. Independent of Cloudflare Access group membership; Access decides who can reach
  the tool, this decides what a recognized operator may do inside it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator who has never used FlareTower before is recognized and given a permission
  level automatically on their first authenticated visit, with no manual setup step required for
  that recognition to happen.
- **SC-002**: 100% of in-app mutating-action attempts by an operator whose permission level doesn't
  allow it are blocked before any state changes, with zero exceptions.
- **SC-003**: A brand-new FlareTower deployment always has at least one operator capable of
  promoting others immediately after its first-ever authenticated visit, with no external
  configuration step beyond deploying the system and setting up Access as already required today.
- **SC-004**: When the first Cloudflare-account-mutating action is later built, it can record its
  audit trail using this feature's mechanism without that mechanism needing new development.

## Assumptions

- **`audit_log` stays scoped to real Cloudflare-account mutations**, matching the constitution's
  literal wording (Principle IX: "anything that changes Cloudflare account state") and the
  precedent already set and documented across all 7 existing modules (e.g.
  `specs/001-workers-access-exposure/data-model.md`'s explicit note that alert-acknowledgment is
  FlareTower's own internal state, not a Cloudflare account mutation, and therefore intentionally
  does not write to `audit_log`). This feature does not reopen or change that precedent — it only
  builds the recording mechanism `audit_log` will need for the future, and does not retrofit it onto
  acknowledge.
- **Two-tier permission model**: the existing `role` column already defaults new rows to
  `'member'`, implying a minimal/elevated (`member` / `admin`) split was anticipated rather than a
  richer role matrix. This spec adopts that two-tier model rather than inventing additional levels;
  a richer model can be layered on later without breaking this one.
- **Scope of the permission check**: only in-app mutating actions (today: alert acknowledgment)
  require the elevated permission level. Read-only actions (viewing inventories, alerts, summaries,
  the changes digest) remain available to any recognized operator, consistent with how every module
  has behaved so far and with not expanding scope beyond what this increment needs.
- **First-user auto-elevation is a standard, defensible default** for a self-hosted admin tool
  already gated by Cloudflare Access — only identities the deployer has already let through Access
  can ever reach FlareTower at all, so the "first operator becomes able to promote others"
  convention doesn't hand elevated access to anyone who wasn't already trusted enough to reach the
  tool in the first place.
- **No admin UI in this increment**: promoting an operator (FR-006) is an operation FlareTower must
  support end-to-end, but a dedicated screen for it is not required by this spec if a minimal
  existing surface (e.g. an authenticated endpoint) satisfies the acceptance scenarios — the plan
  phase decides the concrete shape.
- **No new Cloudflare API scopes or calls**: this feature operates entirely on FlareTower's own D1
  tables and the identity the existing Access gate already validates; it does not call the
  Cloudflare API, except optionally to enrich an operator's identity-provider detail (FR-003) via
  Cloudflare Access's own identity-enrichment endpoint — never a Cloudflare *account* API call.
