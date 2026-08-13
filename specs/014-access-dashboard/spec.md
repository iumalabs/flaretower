# Feature Specification: Access Dashboard

**Feature Branch**: `014-access-dashboard`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Access module dashboard — replaces the Applications half of the
existing Zero Trust page's generic shared findings-table rendering with a bespoke, purpose-built
applications view, per the design source's §10 'Access' mockup. The Service Tokens half of that same
page is unchanged. Same 'zero-trust' nav key, no nav split. Adds Covers/Policies/Identity/Session
columns, a Policy detail panel (ALLOW/REQUIRE/DENY rule breakdown for a selected application), and a
Groups panel — all reusing the existing Application status semantics unchanged (no new severity
tier). The policy-detail panel's coverage-gap narrative (cross-referencing Worker hostnames) is
explicitly out of scope."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See each application's real-world coverage at a glance (Priority: P1)

An operator viewing the Access page sees, for every Access application, what it protects, how many
policies it has, which identity provider(s) it relies on, its session duration, and its existing
health status — in one table, instead of the current generic table's domain/reason-only view.

**Why this priority**: This is the table redesign's whole point — an operator today can see an
app is "safe" or "warning" and why, but not at a glance which identity provider it trusts or how
long a session lasts, both of which matter for judging whether an app's protection is actually
adequate for what it guards.

**Independent Test**: Can be fully tested by connecting FlareTower to an account with multiple
Access applications using different identity providers and session durations, and confirming every
column shows accurate, real data.

**Acceptance Scenarios**:

1. **Given** an application covering more than one hostname, **When** the operator views its row,
   **Then** the Covers column shows the primary hostname pattern with an indicator of how many more
   it covers.
2. **Given** an application whose policies reference an identity provider, **When** the operator
   views its row, **Then** the Identity column shows that provider's name, not just a raw ID.
3. **Given** an application with no identity-provider-based policy (e.g. service-token-only, or
   fully open), **When** the operator views its row, **Then** the Identity column shows an explicit
   "none" state, never a blank cell or a fabricated provider name.
4. **Given** an application already flagged safe/warning/not-evaluated by this project's existing
   Access evaluation, **When** the operator views its row, **Then** the same status appears
   unchanged — no new severity category is introduced by this feature.

---

### User Story 2 - See a selected application's policy rules in plain language (Priority: P2)

An operator selects one application and sees its access policies broken down into individual
ALLOW/REQUIRE/DENY rule lines in plain language, instead of having to read raw policy JSON in the
Cloudflare dashboard to understand what actually grants access.

**Why this priority**: Genuinely new value (understanding *why* an app is scored the way it is) but
depends on User Story 1's table existing first, and is useful even without the Groups panel.

**Independent Test**: Can be tested independently by selecting applications with different policy
rule types (email domain, specific email, everyone, service token, identity provider, IP range) and
confirming each renders as an accurate plain-language line, with an unrecognized rule type falling
back to a generic label rather than being dropped or mis-described.

**Acceptance Scenarios**:

1. **Given** an application is selected, **When** the operator views the policy detail panel,
   **Then** every one of that application's policies appears, each broken into its individual rules
   labeled by what they do (grant, require an additional condition, or deny).
2. **Given** a policy rule of a type this feature doesn't specifically recognize, **When** it's
   displayed, **Then** it shows a generic, honest label rather than a guessed or incorrect
   description.
3. **Given** no application is selected yet (e.g. the account has zero applications), **When** the
   operator views the page, **Then** the policy detail panel shows an explicit empty state, not an
   error or a panel describing a nonexistent application.

---

### User Story 3 - See which Access Groups exist and how widely each is used (Priority: P3)

An operator viewing the Access page sees a panel listing the account's Access Groups, each with its
membership/rule summary and how many applications reference it.

**Why this priority**: Useful supporting context, but the page delivers its core value (User Stories
1 and 2) without it — independently droppable.

**Independent Test**: Can be tested independently by seeding an account with Access Groups referenced
by varying numbers of applications (including zero) and confirming each group's reference count is
accurate.

**Acceptance Scenarios**:

1. **Given** an Access Group referenced by policies on 4 applications, **When** the operator views
   the Groups panel, **Then** that group shows a count of 4.
2. **Given** an Access Group referenced by no application's policies, **When** the operator views
   the panel, **Then** it shows a count of 0, not omitted from the list.
3. **Given** the account has zero Access Groups, **When** the operator views the panel, **Then** it
   shows an explicit empty state.

### Edge Cases

- What happens when an application's policy references an identity provider that no longer exists
  (deleted after the policy was created)? The Identity column and policy detail MUST show an
  explicit "unknown provider" state rather than omitting the rule or crashing.
- What happens when an application has zero policies at all? It still appears in the table (existing
  behavior — a zero-policy app is already flagged per FR-004 below); its Policies column shows 0 and
  its policy detail panel shows an explicit "no policies" state.
- What happens when fetching Access Groups fails entirely (e.g. insufficient token scope)? The
  Groups panel MUST show an explicit "not available" state rather than an empty (falsely
  "confirmed zero groups") list, and MUST NOT block the applications table or policy detail panel
  from rendering.
- What happens when the account has more applications than could reasonably fit without a policy
  detail panel making sense for all of them at once? Only one application's policy detail is shown
  at a time (the currently selected one) — this is expected, not a gap.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Access applications table MUST show, per application: its name, the hostname
  pattern(s) it covers, its policy count, the identity provider(s) its policies rely on (or an
  explicit "none" state), its session duration (or an explicit "not set" state), and its existing
  health status.
- **FR-002**: Health status MUST be the existing safe/warning/not-evaluated classification this
  project's Access evaluation already produces, unchanged — this feature MUST NOT add a new
  severity tier or change what causes an application to be flagged.
- **FR-003**: The system MUST let an operator select one application and see its policies broken
  into individual, plain-language ALLOW/REQUIRE/DENY rule lines.
- **FR-004**: A policy rule type not specifically recognized MUST render as a clearly-labeled
  generic entry, never a guessed or fabricated description, and never silently omitted.
- **FR-005**: The system MUST show a panel listing the account's Access Groups, each with its
  membership/rule summary and the count of applications whose policies reference it (including a
  group referenced by zero applications).
- **FR-006**: The system MUST NOT provide any control on this page that mutates Cloudflare Access
  state (no new application, no identity-provider management) — the page remains read-only, matching
  every other module.
- **FR-007**: The Policy detail panel MUST NOT include a hostname-coverage narrative — it shows only
  the selected application's own policy rules, not a cross-reference against any other module's data.
- **FR-008**: A failure to fetch Access Groups MUST NOT block the applications table or policy
  detail panel from rendering, and MUST show its own explicit "not available" state distinct from a
  confirmed-empty group list.

### Key Entities

- **Access application row**: name, covered hostname pattern(s), policy count, identity provider
  summary, session duration, health status (unchanged from existing evaluation).
- **Policy rule line**: a verb (grant/require/deny) and a plain-language description of one rule
  within one policy.
- **Access Group**: name, membership/rule summary, count of applications referencing it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can identify which identity provider protects any given application
  without leaving this page.
- **SC-002**: An operator can understand exactly what grants access to a selected application
  (every ALLOW/REQUIRE/DENY rule) within one interaction (selecting it), without reading raw API
  responses.
- **SC-003**: 100% of an account's Access applications appear in the table exactly once, across
  accounts of at least 20 applications.
- **SC-004**: A failure to fetch Access Groups never prevents the operator from seeing the
  applications table or a selected application's policy detail.

## Assumptions

- Access Groups and Identity Providers are read under the same token scope this project already
  holds for Access applications/policies (`Access: Apps and Policies Read`); this is a working
  assumption to be confirmed during planning research, with a documented new-scope fallback if not.
- Session duration and the raw policy rule arrays (`include`/`require`/`exclude`) needed for the
  plain-language breakdown are already returned by the same `GET /accounts/{id}/access/apps` call
  this project's Access module already makes — a working assumption, confirmed during planning
  research.
- The rule-humanizer covers the realistic common cases (email domain, specific email, everyone,
  service token, identity-provider/login method, IP range, group reference) — an application using a
  rule type outside this set still renders (FR-004's generic-label fallback), so this is a coverage
  goal, not a hard requirement to handle every Cloudflare Access rule type that exists.
- The Service Tokens section of the existing Zero Trust page is unaffected by this feature — it
  keeps its current generic table rendering.
