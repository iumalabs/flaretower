# Feature Specification: Security Dashboard

**Feature Branch**: `017-security-dashboard`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Security module dashboard — replaces the existing Security Posture
page's generic flattened rendering (4 checks × N zones as separate rows) with a bespoke,
purpose-built layout per the design source's §13 'Security' mockup. Restructures the existing 4
zone checks into one row per zone; adds 3 new zone-level security settings (Bot Fight Mode, Always
Use HTTPS, Minimum TLS Version) as additional persisted/alertable checks; adds live-fetched
Certificates and WAF Custom Rules panels below the zone table. The Turnstile widgets section stays
completely unchanged. Every check stays zone-scoped rather than adopting the mockup's
account-wide-toggle aggregation, since that aggregation has no honest, non-fabricated definition
for a tool that has never aggregated across zones before."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See each zone's full security posture in one row (Priority: P1)

An operator viewing the Security page sees one row per zone — its SSL/TLS mode, DNSSEC, WAF, and
Rate Limiting status, plus an overall rolled-up status — instead of today's 4 separate rows per
zone (one per underlying check), which forces the operator to mentally reassemble what's really
going on with a single zone.

**Why this priority**: This is the same "one row per resource" transformation every prior module
in this rollout applied — an operator wants "is this zone okay," answerable in one row, not "is
this specific check on this zone okay" repeated 4 times.

**Independent Test**: Can be fully tested by connecting FlareTower to an account with multiple
zones in different states (some fully protected, some with a gap in one check) and confirming each
zone appears exactly once, with an overall status matching the worst of its 4 underlying checks.

**Acceptance Scenarios**:

1. **Given** a zone where all 4 checks are safe, **When** the operator views its row, **Then** the
   row's overall status is safe.
2. **Given** a zone where exactly one check is critical and the rest are safe, **When** the
   operator views its row, **Then** the row's overall status is critical — the worst check
   determines the row.
3. **Given** a zone where one check is warning and none are critical, **When** the operator views
   its row, **Then** the row's overall status is warning, not safe and not critical.

---

### User Story 2 - See Bot Fight Mode, Always Use HTTPS, and Minimum TLS Version per zone (Priority: P2)

An operator viewing a zone's row also sees whether Bot Fight Mode and Always Use HTTPS are enabled,
and what minimum TLS version the zone accepts — three settings this project doesn't check today.

**Why this priority**: These are real, commonly-recommended security settings with a genuine
safe/warning distinction (unlike Email Obfuscation, whose off-state isn't inherently a gap) —
extending the same zone-row table established in User Story 1.

**Independent Test**: Can be fully tested by connecting to an account with zones in different
states for these 3 settings and confirming each zone's row reflects its real, current values.

**Acceptance Scenarios**:

1. **Given** a zone with Bot Fight Mode off, **When** the operator views its row, **Then** that
   check shows warning, and the row's overall status reflects it if it's the worst check.
2. **Given** a zone with Always Use HTTPS off, **When** the operator views its row, **Then** that
   check shows warning.
3. **Given** a zone whose minimum TLS version is 1.0 or 1.1, **When** the operator views its row,
   **Then** that check shows warning; 1.2 or 1.3 shows safe.

---

### User Story 3 - See real certificate expiry and real WAF custom rules (Priority: P3)

An operator viewing the Security page also sees, below the zone table, each zone's active
certificate (host, issuer, days until expiry) and every custom WAF rule configured across the
account's zones (rule name, expression, action, state).

**Why this priority**: Lowest priority of the three — genuinely new, valuable information, but
informational/detective rather than closing an active exposure gap the way User Stories 1-2 do.

**Independent Test**: Can be fully tested by connecting to an account with a soon-expiring
certificate and at least one custom WAF rule (including a "skip"-action rule and a disabled rule),
and confirming both panels show accurate, real values with no fabricated data.

**Acceptance Scenarios**:

1. **Given** a zone whose active certificate expires within 30 days, **When** the operator views
   the Certificates panel, **Then** that row shows a warning state; a certificate expiring further
   out shows safe.
2. **Given** a zone with no active certificate pack found, **When** the operator views the
   Certificates panel, **Then** that row shows an explicit not-evaluated state, never a fabricated
   expiry.
3. **Given** a custom WAF rule whose action is "skip", **When** the operator views the WAF Custom
   Rules panel, **Then** that rule shows warning, distinct from an enabled rule with any other
   action (safe) and a disabled rule (not-evaluated).
4. **Given** custom WAF rules exist on more than one zone, **When** the operator views the WAF
   Custom Rules panel, **Then** every rule's row identifies which zone it belongs to.

### Edge Cases

- What happens when a zone's overall status needs to be computed but one of its checks couldn't be
  evaluated at all (not_evaluated)? The existing severity ranking already places not_evaluated
  above safe but below warning/critical, so a zone with one not_evaluated check and the rest safe
  rolls up to not_evaluated, never silently safe.
- What happens when a zone has zero custom WAF rules? It simply contributes zero rows to the WAF
  Custom Rules panel — not an error, not a placeholder row.
- What happens when a zone has multiple certificate packs? The panel shows the soonest-expiring
  certificate among active packs — a display simplification (this project's per-zone SSL/TLS mode
  check, unrelated to certificates, is unaffected and unchanged).
- What happens when the account has an Email Obfuscation setting some zones have off? This feature
  does not evaluate or display Email Obfuscation at all — no cheap way to know whether that's
  actually a gap for a given zone's content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Security page MUST show exactly one row per zone for the existing SSL/TLS,
  DNSSEC, WAF, and Rate Limiting checks, not one row per underlying check.
- **FR-002**: Each zone row MUST show an overall status equal to the worst (highest-severity)
  status among that zone's individual checks, using this project's existing
  critical > warning > not_evaluated > safe ranking.
- **FR-003**: The existing SSL/TLS, DNSSEC, WAF, and Rate Limiting decision logic MUST remain
  exactly as currently computed — this feature MUST NOT change any existing status/reason
  decision.
- **FR-004**: Each zone row MUST additionally show Bot Fight Mode, Always Use HTTPS, and Minimum
  TLS Version status, each independently evaluated safe/warning per FR-003's "don't touch existing
  logic" spirit applied to these new checks once defined (Bot Fight Mode/Always Use HTTPS: on =
  safe, off = warning; Minimum TLS Version: 1.2/1.3 = safe, 1.0/1.1 = warning).
- **FR-005**: The system MUST NOT evaluate or claim a safe/warning judgment for Email Obfuscation —
  this project has no way to know whether a zone's content makes that setting relevant.
- **FR-006**: The page MUST show a Certificates panel with one row per zone: the zone's active
  certificate's hosts, issuer, and days until expiry (or an explicit not-evaluated state when no
  active certificate pack is found), with a warning state for a certificate expiring within 30
  days.
- **FR-007**: The page MUST show a WAF Custom Rules panel with one row per custom WAF rule across
  every zone, each row identifying its zone, rule name, expression, action, and a status (disabled
  = not-evaluated, enabled with a "skip" action = warning, any other enabled action = safe).
- **FR-008**: The system MUST NOT provide any control on this page that mutates Cloudflare
  configuration (no baseline comparison, no apply-baseline) — the page remains read-only, matching
  every other module.
- **FR-009**: The existing Turnstile widgets section MUST remain unchanged in behavior and
  position on the page.
- **FR-010**: The system MUST NOT display per-rule traffic/hit-count data for WAF Custom Rules —
  no cheap, honest data source exists for it.

### Key Entities

- **Zone security row**: zone name, per-check status/reason for SSL/TLS, DNSSEC, WAF, Rate
  Limiting, Bot Fight Mode, Always Use HTTPS, Minimum TLS Version, and an overall rolled-up status.
- **Zone certificate**: zone name, certificate hosts, issuer, days until expiry (or not-evaluated).
- **WAF custom rule**: zone name, rule description/name, expression, action, enabled/disabled,
  derived status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can assess any single zone's full security posture (7 checks) by reading
  one row, without cross-referencing multiple rows for the same zone.
- **SC-002**: 100% of an account's zones appear in the zone table exactly once, with no duplicates
  and no omissions, across accounts of at least 20 zones.
- **SC-003**: Every value shown on this page (all 7 per-zone checks, certificate expiry, WAF rule
  fields) traces to a real Cloudflare API response — none are estimated, interpolated, or
  hardcoded.
- **SC-004**: A zone with a genuine security gap in any one of its 7 checks is visually
  distinguishable from a fully-protected zone within the same glance at the zone table.

## Assumptions

- The mockup's "account-wide toggle aggregating N zones into one row, with a scope note like '1
  zone lagging'" presentation is not built — this project has never aggregated a status across
  zones this way, and inventing that aggregation's exact rules (which zone's value to display,
  what counts as "lagging") would mean fabricating a judgment call with no existing precedent.
  Every check instead stays zone-scoped, following this rollout's established "one row per real
  resource" precedent (Pages/DNS/Access all did this rather than literally cloning a mockup layout
  that didn't map to real per-resource data).
- Bot Fight Mode, Always Use HTTPS, and Minimum TLS Version are read via the same generic
  zone-settings endpoint this project's SSL/TLS check already uses for its own setting — a working
  assumption confirmed during planning research, with no new Cloudflare API token scope expected.
- Email Obfuscation is deliberately excluded — its off-state isn't inherently a security gap (the
  design mockup's own example shows it off with a neutral, non-warning reason), and this project
  cannot honestly evaluate whether it matters for a given zone without knowing that zone's content.
- Certificates and WAF Custom Rules are fetched live on every inventory request rather than
  persisted and alerted — mirroring this rollout's existing precedent (the Access Groups panel) for
  informational panels that don't need historical drift tracking the way the 7 core checks do.
- WAF Custom Rules are shown with an explicit per-row zone identifier rather than presented as one
  unified account-wide list — Cloudflare's custom WAF rulesets are genuinely zone-scoped, and
  presenting them as unified would misrepresent the real data shape.
- Per-rule traffic/hit-count data is out of scope — no cheap Cloudflare API source exists without
  GraphQL Analytics, a disproportionate addition for one column (matching this rollout's precedent
  for trimming analytics-requiring detail).
