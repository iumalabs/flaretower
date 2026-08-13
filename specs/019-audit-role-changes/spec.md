# Feature Specification: Audit Operator Role Changes

**Feature Branch**: `019-audit-role-changes`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Audit operator role changes — closes a real gap discovered while
auditing constitution Principle IX compliance: POST /api/identity/users/:sub/role
(worker/modules/identity/routes.ts, spec 008) mutates an operator's authorization level (member
<-> admin, i.e. a privilege escalation/de-escalation) via setOperatorRole()
(worker/modules/identity/users.ts) with zero audit trail — no audit_log write, no before/after role
captured anywhere. This is FlareTower's own authorization state, not Cloudflare account state, so it
isn't a literal violation of Principle IX's letter ('anything that changes Cloudflare account
state') — but it is exactly the gap the principle's own rationale describes ('what did they do
here?' cannot be an afterthought): if a compromised admin session silently promotes another account
to admin, there is currently no record of who did it or when. Reuses the exact same shared
record-keeping mechanism every other account-mutating module's evaluate route already uses, rather
than inventing a second mechanism."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An operator's role change leaves a permanent record of who made it (Priority: P1)

An admin changes another known operator's role (promoting a member to admin, or demoting an admin
back to member) using FlareTower's existing operator-management capability. Today, the change takes
effect immediately but leaves no trace anywhere of who made it or when. Going forward, the moment
that change takes effect, a permanent internal record is created capturing who made the change,
whose role changed, what it changed from, what it changed to, and when — so a later admin
investigating "who gave this account admin access, and when?" has a real answer instead of no
answer at all.

**Why this priority**: This is the entire reason the feature exists. Role changes are the single
most security-sensitive action an admin can take inside FlareTower itself (they directly control who
else can take further sensitive actions), and today they are the only such action with zero
accountability trail. Everything else is secondary.

**Independent Test**: As an admin, change a known operator's role. Confirm a new internal record now
exists for that specific change, showing the acting admin, the target operator, the previous role,
the new role, and a timestamp. Confirm a second role change (e.g. reversing the first) produces a
second, distinct record rather than overwriting the first.

**Acceptance Scenarios**:

1. **Given** an admin operator and a known operator currently set to "member", **When** the admin
   changes that operator's role to "admin", **Then** a new record is created showing the admin as
   the actor, the target operator, "member" as the previous role, "admin" as the new role, and the
   time of the change.
2. **Given** the same operator is later changed back from "admin" to "member", **When** that second
   change is made, **Then** a second, separate record is created reflecting that specific
   transition — the first record from Scenario 1 is untouched.
3. **Given** an admin attempts to change the role of an operator that does not exist, **When** the
   attempt is made, **Then** the attempt is rejected exactly as it is today, and no record is
   created (since no actual role changed).
4. **Given** the underlying record-keeping cannot be completed for any reason, **When** an admin
   attempts a role change, **Then** the role change itself does not take effect either — the role
   and its record either both succeed or both fail together, so the two can never fall out of sync.

---

### Edge Cases

- What happens when an admin submits a role change to the value an operator already holds (e.g.
  "member" → "member")? This is treated as a deliberate action and still produces a record — from
  the system's point of view, an admin explicitly confirming/re-asserting a role is a real action
  worth being accountable for, and skipping the record in this one case would make it ambiguous
  later whether a resubmission was silently ignored or never attempted.
- What happens if an admin changes their own role (self-demotion from admin to member, or the
  reverse)? Already possible today and unchanged by this feature; the record must still capture it
  accurately, with the acting admin and the target operator being the same person.
- What happens to the very first operator, who is automatically made an admin on their first-ever
  login (existing behavior, unrelated to this feature)? That automatic elevation remains unrecorded,
  as it is today — there is no other party acting on the new operator's behalf to be the "who" in a
  role-change record, matching this project's existing precedent that account-bootstrap actions
  aren't treated as one party mutating another's state.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: FlareTower MUST record every completed operator role change, capturing: the acting
  admin's identity, the target operator's identity, the role before the change, the role after the
  change, and when the change occurred.
- **FR-002**: A role change MUST NOT be considered complete unless its record was also successfully
  created — if the record cannot be created, the role change itself MUST NOT take effect, so the
  two can never disagree about the operator's actual current role.
- **FR-003**: This record MUST use the same underlying record-keeping mechanism FlareTower already
  uses for every other account-mutating action, not a separate mechanism specific to this feature.
- **FR-004**: An attempted role change that does not actually change anything, because the target
  operator does not exist, MUST NOT produce a record.
- **FR-005**: An admin changing their own role MUST produce an accurate record, with the acting
  admin and the target operator correctly reflected as the same operator.
- **FR-006**: This feature MUST NOT change who is authorized to perform a role change — that remains
  restricted to admins, as it is today.
- **FR-007**: This feature MUST NOT change the automatic elevation of the first-ever operator to
  admin on their first login — that action remains unrecorded, as it is today.
- **FR-008**: This new record MUST NOT be surfaced in any existing or new user-facing view as part
  of this feature — it exists purely as an internal accountability record; deciding whether and how
  to ever display it is a separate, later decision.

### Key Entities

- **Role Change Record**: One record per completed operator role change — who made it, whose role
  changed, the role before, the role after, and when. Distinct from Cloudflare's own account
  activity log (a different, already-existing, externally-sourced concept) and from any of
  FlareTower's own finding/alert history for Cloudflare resources — this is specifically a record of
  "who changed FlareTower's own authorization state, and how."

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of operator role changes made after this feature ships have a corresponding
  record capturing the acting admin, the target operator, the previous role, the new role, and a
  timestamp.
- **SC-002**: Zero operator role changes can take effect without their corresponding record also
  having been successfully created — a simulated record-keeping failure results in the role
  remaining unchanged, not a role change with a missing record.
- **SC-003**: An admin reviewing FlareTower's internal accountability records can answer "who
  changed this operator's role, and when, and what did it change from/to?" for any role change made
  after this feature ships, without needing to ask anyone or check any external system.
- **SC-004**: The role-change action's outcome as seen by the calling admin (success/error responses)
  is unchanged from before this feature — the only observable difference is the new internal record.

## Assumptions

- **Reuses an existing mechanism, doesn't invent one**: FlareTower already has an established,
  shared record-keeping mechanism used by every other account-mutating action. This feature is
  expected to reuse that mechanism unmodified rather than build a second, parallel one — the specific
  technical shape of that reuse is a planning-phase decision, not a product decision this spec needs
  to make.
- **No-op role submissions are still recorded**: see Edge Cases — submitting a role change to an
  operator's current role is treated as a deliberate, recordable action rather than silently
  ignored.
- **Self-role-changes are in scope, unchanged in behavior**: an admin has always been able to change
  their own role; this feature does not add or remove that ability, it only ensures such a change is
  recorded accurately like any other.
- **First-operator bootstrap stays out of scope**: the automatic admin elevation of the very first
  operator is a distinct, pre-existing code path with no acting third party, and is intentionally not
  covered by this feature.
- **No new user-facing surface**: this feature does not add any screen, table, or view for reviewing
  these new records. A future decision to expose them (and where) is explicitly left for later,
  separate consideration.
- **Scope is limited to role changes**: no other operator field (email, IdP, last-seen time) is a
  security-authorization decision the way role is, and none of them are brought into scope by this
  feature.
