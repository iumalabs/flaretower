# Feature Specification: Security Posture

**Feature Branch**: `006-security-posture`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Module 6 — Security Posture: WAF, rate limiting, DNSSEC, SSL/TLS mode, Turnstile. Per constitution §2 item 6. Inventory every zone's SSL/TLS encryption mode, DNSSEC status, WAF managed-ruleset presence, and rate-limiting-ruleset presence, plus the account's Turnstile widgets, following the exact same audit pattern established by Modules 1-5. SSL/TLS mode is the headline risk signal (a zone not fully encrypting traffic between Cloudflare and the origin is directly analogous to Module 1's Worker exposure and Module 5's R2 bucket exposure); DNSSEC/WAF/rate-limiting absence are secondary protection-gap signals; Turnstile is inventory-only (no safe/unsafe judgment — its presence or absence is a normal operator choice, not a security gap)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every zone's security posture, and every Turnstile widget, in one place (Priority: P1)

An operator opens FlareTower and sees, for every zone in the account, its
SSL/TLS encryption mode, DNSSEC status, whether a WAF managed ruleset is
deployed, and whether a rate-limiting ruleset is deployed — plus every
Turnstile widget configured on the account, all in one place.

**Why this priority**: Security-relevant zone settings are scattered
across several different dashboard screens today, and nothing shows them
side by side. This is the foundation every other capability in this
module builds on, the same role User Story 1 played in Modules 1-5.

**Independent Test**: Can be fully tested by connecting FlareTower to an
account with several zones in a mix of configurations and confirming
every zone's four settings, and every Turnstile widget, appear, none
omitted.

**Acceptance Scenarios**:

1. **Given** an account with multiple zones, **When** the operator opens
   the inventory, **Then** every zone appears exactly once with its
   SSL/TLS mode, DNSSEC status, WAF presence, and rate-limiting presence.
2. **Given** the account has zero Turnstile widgets, **When** the
   operator views the inventory, **Then** the Turnstile section shows an
   empty (not omitted, not errored) result.
3. **Given** a zone has no WAF managed ruleset and no rate-limiting
   ruleset deployed at all, **When** the operator views it, **Then** it
   still appears in the inventory, not omitted.

---

### User Story 2 - Get flagged when a zone's SSL/TLS mode doesn't fully encrypt traffic to the origin (Priority: P1)

Every zone's SSL/TLS encryption mode is checked: a mode that leaves the
connection between Cloudflare and the origin unencrypted, or leaves
visitor traffic unencrypted entirely, is flagged.

**Why this priority**: This is the constitution's headline risk for this
module. "Flexible" SSL/TLS mode — a well-documented, easy-to-fall-into
misconfiguration — encrypts the visitor-to-Cloudflare hop but leaves
Cloudflare-to-origin traffic in plaintext, silently undermining the
"secure" padlock a visitor sees. This is the same class of
easy-to-forget, invisible risk as an unprotected Worker (Module 1) or a
public R2 bucket (Module 5).

**Independent Test**: Can be fully tested by creating one zone in each
SSL/TLS mode (Off, Flexible, Full, Full (strict)) and confirming each
renders with the correct distinct status.

**Acceptance Scenarios**:

1. **Given** a zone with SSL/TLS mode "Off", **When** the operator views
   it, **Then** it is flagged critical — visitor traffic is not encrypted
   at all.
2. **Given** a zone with SSL/TLS mode "Flexible", **When** the operator
   views it, **Then** it is flagged critical — the origin connection is
   unencrypted even though the visitor sees a secure padlock.
3. **Given** a zone with SSL/TLS mode "Full", **When** the operator views
   it, **Then** it is flagged warning — both hops are encrypted, but
   Cloudflare does not validate the origin's certificate.
4. **Given** a zone with SSL/TLS mode "Full (strict)" (or the
   Enterprise-only "Strict (SSL-Only Origin Pull)" variant), **When** the
   operator views it, **Then** it is marked safe.

---

### User Story 3 - Get flagged when a zone lacks DNSSEC, a WAF, or rate limiting (Priority: P2)

Every zone is independently checked for three protection layers: whether
DNSSEC is active, whether a WAF managed ruleset is deployed with at least
one enabled rule, and whether a rate-limiting ruleset is deployed with at
least one enabled rule. A zone missing any one of these is flagged for
that specific gap.

**Why this priority**: Unlike SSL/TLS mode, none of these three is
required for every zone to function correctly, so this is a secondary,
not headline, signal — but each is a well-known, commonly-recommended
protection layer that's easy to never get around to enabling, and
nothing today surfaces the gap. Independently testable and delivers
value without User Story 2's SSL/TLS logic.

**Independent Test**: Can be fully tested by creating one zone with
DNSSEC active and one with it disabled, one zone with an enabled WAF
managed ruleset and one with none deployed, and one zone with an enabled
rate-limiting rule and one with none deployed — confirming each renders
with the correct distinct status.

**Acceptance Scenarios**:

1. **Given** a zone with DNSSEC active, **When** the operator views it,
   **Then** its DNSSEC status is marked safe.
2. **Given** a zone with DNSSEC disabled, pending, or pending-disabled,
   **When** the operator views it, **Then** its DNSSEC status is flagged
   warning — not yet providing protection, whichever direction it's
   transitioning.
3. **Given** a zone with no WAF managed ruleset deployed, or one deployed
   with zero enabled rules, **When** the operator views it, **Then** its
   WAF status is flagged warning.
4. **Given** a zone with a WAF managed ruleset deployed and at least one
   enabled rule, **When** the operator views it, **Then** its WAF status
   is marked safe.
5. **Given** a zone with no rate-limiting ruleset deployed, or one
   deployed with zero enabled rules, **When** the operator views it,
   **Then** its rate-limiting status is flagged warning.
6. **Given** a zone with a rate-limiting ruleset deployed and at least
   one enabled rule, **When** the operator views it, **Then** its
   rate-limiting status is marked safe.

---

### User Story 4 - Get notified when security posture drifts, without opening the panel (Priority: P2)

The same evaluation that powers the interactive inventory also runs on
the existing shared scheduled audit (constitution Principle III, joining
Modules 1-5's scheduled evaluation rather than adding a new Cron
Trigger). When a zone's SSL/TLS mode weakens, or DNSSEC/WAF/rate-limiting
newly becomes absent, the operator is alerted without having opened
FlareTower.

**Why this priority**: Same "drift between visits" rationale as every
other module's User Story 4. An SSL/TLS mode downgraded for a debugging
session and never restored, or a WAF managed ruleset accidentally
removed while editing other rules, both accumulate silently otherwise.

**Independent Test**: Can be fully tested by running the scheduled scan
against a test account, then switching a test zone's SSL/TLS mode from
"Full (strict)" to "Flexible" between two scheduled runs, and confirming
an alert fires after the run that observes it.

**Acceptance Scenarios**:

1. **Given** the scheduled scan previously found no flagged zones,
   **When** any zone's SSL/TLS mode, DNSSEC, WAF, or rate-limiting status
   newly becomes flagged before the next scheduled run, **Then** an
   alert is raised after that run completes.
2. **Given** a finding was already flagged on the previous run and
   remains in the same state, **When** the run completes, **Then** the
   operator is not re-alerted for the same still-flagged item on every
   run.
3. **Given** the scheduled scan cannot evaluate part of the account
   (e.g. an API error), **When** the run completes, **Then** that
   failure is itself surfaced, not silently treated as "nothing new."

---

### Edge Cases

- What happens when a zone's DNSSEC status is "error"? The system could
  not determine whether DNSSEC is actually protecting the zone, so it is
  reported not evaluated rather than guessed safe or warning.
- What happens when a WAF or rate-limiting ruleset is deployed but every
  rule in it is disabled? Treated the same as no ruleset deployed at
  all — a disabled rule provides no actual protection, so the gap is
  real regardless of whether the ruleset object technically exists.
- What happens when the account has zero zones? The inventory shows an
  empty (not omitted, not errored) result.
- What happens the very first time the scheduled scan runs? Every
  critical/warning finding from that first run must still trigger an
  alert — no grace period, same as every other module's equivalent edge
  case.
- What happens when the configured API token lacks sufficient scope to
  read a zone's SSL/TLS setting, DNSSEC status, WAF rulesets, or
  rate-limiting rulesets? Those items are shown as "not fully
  evaluated," never silently omitted or presented as safe.
- What happens to a Turnstile widget with zero domains configured, or
  one not currently bound to any page? It is still inventoried — this
  spec does not evaluate individual widget configuration, only lists
  what exists (User Story 1).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enumerate every zone in the account, and for
  each MUST determine its SSL/TLS encryption mode, DNSSEC status,
  whether a WAF managed ruleset is deployed with at least one enabled
  rule, and whether a rate-limiting ruleset is deployed with at least
  one enabled rule.
- **FR-002**: System MUST enumerate every Turnstile widget configured on
  the account, with no safe/unsafe judgment attached — inventory only.
- **FR-003**: System MUST mark a zone's SSL/TLS mode critical when it is
  "Off" or "Flexible".
- **FR-004**: System MUST mark a zone's SSL/TLS mode warning when it is
  "Full", and safe when it is "Full (strict)" or the equivalent
  Enterprise-only strict-origin-pull mode.
- **FR-005**: System MUST mark a zone's DNSSEC status safe when active,
  and warning when disabled, pending, or transitioning to disabled.
- **FR-006**: System MUST mark a zone's WAF status warning when no
  managed ruleset is deployed, or one is deployed with zero enabled
  rules, and safe when at least one managed rule is enabled.
- **FR-007**: System MUST mark a zone's rate-limiting status warning when
  no ruleset is deployed, or one is deployed with zero enabled rules,
  and safe when at least one rule is enabled.
- **FR-008**: System MUST evaluate SSL/TLS mode, DNSSEC, WAF, and
  rate-limiting using the same logic in both the on-demand interactive
  view and the existing shared recurring scheduled run (constitution
  Principle III), with no divergence between the two.
- **FR-009**: System MUST alert when the scheduled run finds a zone
  newly in a flagged state (SSL/TLS, DNSSEC, WAF, or rate-limiting) that
  was not flagged on the previous run.
- **FR-010**: System MUST NOT re-alert on every scheduled run for a
  finding whose flagged state is unchanged from the previous run.
- **FR-011**: System MUST require the operator to be authenticated
  before viewing any Security Posture data.
- **FR-012**: System MUST clearly indicate, per zone and per check, when
  it could not be fully evaluated (e.g. insufficient token scope, an API
  error, a DNSSEC "error" status), and MUST NOT present an unevaluated
  item as safe.
- **FR-013**: System MUST NOT modify any zone setting, DNSSEC
  configuration, WAF ruleset, rate-limiting ruleset, Turnstile widget, or
  other Cloudflare account configuration as part of this feature — this
  module is detection-only; configuration mutation is out of scope for
  this spec.

### Key Entities

- **Zone Security Settings**: one zone's SSL/TLS encryption mode,
  DNSSEC status, WAF managed-ruleset presence, and rate-limiting-ruleset
  presence — four independently evaluated facts about the same zone.
- **Turnstile Widget**: an account-level bot-challenge widget — sitekey,
  name, configured domains. Read fresh on each view, not evaluated.
- **Security Posture Finding**: the evaluated state of one zone's
  SSL/TLS mode, DNSSEC status, WAF status, or rate-limiting status at a
  point in time — safe, warning, critical (SSL/TLS mode only), or not
  evaluated — per the product's established status semantics (shared
  across all modules).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can see every zone's SSL/TLS mode, DNSSEC
  status, WAF status, and rate-limiting status, plus every Turnstile
  widget, within one minute of opening the panel.
- **SC-002**: 100% of zones and Turnstile widgets appear in the
  inventory — zero silent omissions.
- **SC-003**: A zone whose SSL/TLS mode weakens to "Off" or "Flexible" is
  detected and alerted on within one scheduled scan cycle, with no
  operator action required.
- **SC-004**: An operator can distinguish, for every zone check,
  "confirmed safe," "confirmed flagged," and "not fully evaluated" —
  zero items left ambiguous.
- **SC-005**: Across repeated scheduled runs with no underlying change,
  the operator receives zero duplicate alerts for the same unchanged
  finding.

## Assumptions

- The Cloudflare API token configured for FlareTower has, at minimum,
  read-only access to zone settings (SSL/TLS mode), DNSSEC status, zone
  rulesets (WAF and rate-limiting phases), and Turnstile widgets. Per
  the project constitution, this module requires read-only scope only.
  **The exact dashboard permission-group names for zone-ruleset read
  access (WAF vs. rate-limiting) were not fully disambiguated during
  research and need confirmation against a live token-creation screen
  before this module's quickstart run** — the same kind of open
  verification item every prior module has carried into its Polish
  phase.
- Zones are enumerated the same way Module 2 (DNS) already does
  (`GET /zones?account.id=...`), fetched independently rather than
  shared from Module 2's own inventory call, per the
  "duplication beats premature cross-module coupling" precedent already
  applied by Modules 3-5.
- Individual WAF/rate-limiting rule configuration (which specific rules,
  their thresholds, custom rules beyond the managed ruleset) is out of
  scope for this spec — only "is at least one rule from the relevant
  ruleset enabled" is evaluated. Auditing rule-level detail is
  reasonable future scope.
- Turnstile widget-level configuration correctness (domain bindings,
  challenge mode appropriateness) is out of scope — User Story 1 only
  inventories widgets that exist.
- How an alert reaches the operator is out of scope for this spec,
  consistent with every other module's Assumptions.
- Historical drift tracking belongs to the future Audit & Drift module
  (constitution §2 item 7) and is out of scope here.
- No Cloudflare API scopes beyond zone-settings/DNSSEC/ruleset/Turnstile
  read access and the already-established scopes from prior modules are
  requested for this module; mutation capability (e.g. one-click SSL/TLS
  mode fix, enabling DNSSEC) is explicitly future scope.
