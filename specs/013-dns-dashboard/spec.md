# Feature Specification: DNS Dashboard

**Feature Branch**: `013-dns-dashboard`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "DNS module dashboard — replaces the existing DNS page's generic
shared findings-table rendering with a bespoke, purpose-built records view, per the design source's
§09 'DNS' mockup. Unlike spec 012 (Workers), this does not split or add a nav item — the DNS module
already has exactly one page, and this spec upgrades that page in place. Adds zone tabs (records
shown one zone at a time, not all zones flattened together), a Proxy status column distinct from the
existing Finding column, a TTL column (not currently captured), and two new Finding cases: an
ineffective DMARC policy on a `_dmarc` TXT record, and an informational 'points at a Cloudflare
platform domain' label. Mutating/export action buttons shown in the mockup are out of scope, matching
spec 012's own precedent."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse one zone's records at a time (Priority: P1)

An operator with multiple DNS zones in their account opens the DNS page and sees one zone's records
at a time, selected via a row of zone tabs (each showing the zone's name and record count), instead
of every zone's records flattened into a single continuous table.

**Why this priority**: The current page flattens every zone's records together, which becomes
unwieldy as the number of zones and records grows — this is the page's core navigational
improvement and everything else builds on it existing.

**Independent Test**: Can be fully tested by connecting FlareTower to an account with multiple zones
and confirming the page shows one zone's records at a time, switching correctly when a different
zone tab is selected — delivers value even before any new Finding logic is added.

**Acceptance Scenarios**:

1. **Given** an account with 3 zones, **When** the operator opens the DNS page, **Then** 3 zone tabs
   appear, each labeled with its zone name and record count, and the records table shows only the
   initially-selected zone's records.
2. **Given** the operator is viewing one zone's records, **When** they select a different zone tab,
   **Then** the table updates to show only that zone's records, with no page reload.
3. **Given** a zone has zero records, **When** its tab is selected, **Then** the table shows an
   explicit empty state for that zone rather than an empty table indistinguishable from a loading
   state.

---

### User Story 2 - See proxy status and TTL alongside each record's finding (Priority: P2)

An operator viewing a zone's records sees, per record, its Cloudflare proxy status (proxied / DNS
only / not applicable) shown separately from its finding status, plus its TTL — both currently
missing from the page.

**Why this priority**: Useful operational context (is this record actually going through Cloudflare,
what's its cache lifetime) that's visible in the design and easy to add once User Story 1's table
structure exists, but the page is already a real improvement without it.

**Independent Test**: Can be tested independently by confirming a proxied record, a DNS-only record,
and a non-proxy-capable record (e.g. an MX record) each show the correct, visually distinct proxy
status, and that every record shows its TTL.

**Acceptance Scenarios**:

1. **Given** a record proxied through Cloudflare, **When** the operator views its row, **Then** its
   proxy status shows "proxied," visually distinct from a DNS-only or not-applicable record.
2. **Given** a record type that cannot be proxied (e.g. MX, TXT), **When** the operator views its
   row, **Then** its proxy status shows "not applicable," not a false "DNS only."
3. **Given** any record, **When** the operator views its row, **Then** its TTL is shown (or "auto"
   for a proxied record, matching Cloudflare's own convention for proxied-record TTL).

---

### User Story 3 - See an ineffective DMARC policy flagged (Priority: P2)

An operator viewing their zone's records sees a warning on a `_dmarc` TXT record whose policy
provides no real enforcement (`p=none`), distinguishing it from a `_dmarc` record with an enforcing
policy.

**Why this priority**: A real, well-defined gap in email-spoofing protection that's easy to miss
among dozens of unrelated records — genuinely new detection value this spec adds, but independent of
User Stories 1 and 2's structural changes.

**Independent Test**: Can be tested independently by evaluating a `_dmarc` record with `p=none`
(expect warning), one with `p=quarantine` or `p=reject` (expect no new warning from this check), and
a zone with no `_dmarc` record at all (expect no finding fabricated for a record that doesn't exist).

**Acceptance Scenarios**:

1. **Given** a zone's `_dmarc` TXT record has a policy of `p=none`, **When** the operator views that
   record's row, **Then** it shows a warning identifying the ineffective policy.
2. **Given** a zone's `_dmarc` TXT record has a policy of `p=quarantine` or `p=reject`, **When** the
   operator views that record's row, **Then** no DMARC-policy warning appears on it.
3. **Given** a zone has no `_dmarc` record at all, **When** the operator views that zone, **Then**
   nothing fabricates a DMARC finding for a record that doesn't exist — this check only ever applies
   to a `_dmarc` record that is actually present.

### Edge Cases

- What happens when a zone's record count changes between page loads (a record added/removed
  outside FlareTower)? The zone tab's record count and the table MUST reflect the most recently
  evaluated data — no stale count left over from a prior selection.
- What happens when the account has exactly one zone? A single zone tab still appears (not
  suppressed), keeping the page's layout and behavior consistent regardless of zone count.
- What happens when a `_dmarc` record's value can't be parsed as a normal `tag=value; ...` DMARC
  policy string? It MUST be treated as not matching the ineffective-policy case (no fabricated
  warning) rather than crashing or silently marking it critical.
- What happens when TTL data itself couldn't be retrieved for a record whose other fields evaluated
  successfully? The TTL field shows an explicit "not available" state for that record only — it MUST
  NOT block the record's own Finding/Proxy status from rendering.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST show one row of zone tabs, one per zone in the account, each labeled
  with the zone's name and its record count.
- **FR-002**: The system MUST show only the currently-selected zone's records in the table, updating
  immediately when a different zone tab is selected, without a full page reload.
- **FR-003**: Each record's row MUST show its type, name, content/target, proxy status, TTL, and
  finding status.
- **FR-004**: Proxy status MUST distinguish three states: proxied through Cloudflare, DNS-only (not
  proxied but capable of being), and not applicable (a record type that cannot be proxied at all,
  e.g. MX/TXT/NS).
- **FR-005**: Finding status MUST carry over this project's existing dangling-target (critical) and
  DNS-only-exposure (warning) detection unchanged from the current DNS module's evaluation.
- **FR-006**: The system MUST flag a `_dmarc` TXT record whose policy is `p=none` as a warning,
  distinct from the existing dangling/DNS-only findings, without fabricating this finding for a zone
  that has no `_dmarc` record.
- **FR-007**: The system MUST show an informational (non-warning) label on a record whose content
  points at a Cloudflare-hosted platform domain (e.g. a `*.pages.dev` target), distinguishing it from
  an actual warning or critical finding.
- **FR-008**: The page MUST show an account-wide summary (total zones, total records, count of
  records with a dangling-target finding) above the zone tabs.
- **FR-009**: The page MUST show, for the currently-selected zone, a count of how many of its
  records are shown and its own per-status count summary (e.g. critical/warning counts).
- **FR-010**: The system MUST NOT provide any control on this page that mutates Cloudflare DNS state
  or exports zone data — the page remains read-only, matching every other module.
- **FR-011**: A zone with zero records MUST show an explicit empty state when selected, distinct from
  a loading state.

### Key Entities

- **Zone tab**: one DNS zone — name, record count, whether currently selected.
- **DNS record row**: one DNS record — type, name, content, proxy status, TTL, finding status (and,
  when applicable, the DMARC-policy or platform-domain label).
- **Account-wide DNS summary**: total zones, total records, count of records with a dangling-target
  finding.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can view any single zone's records, isolated from every other zone's
  records, within one interaction (selecting its tab).
- **SC-002**: An operator can identify a record with a real security-relevant finding (dangling
  target, DNS-only exposure, or ineffective DMARC policy) without cross-referencing any tool outside
  this page.
- **SC-003**: 100% of records in the selected zone appear in the table exactly once, with no
  duplicates and no omissions, across zones of at least 50 records.
- **SC-004**: A zone with an ineffective DMARC policy is flagged; a zone with an enforcing DMARC
  policy or no DMARC record at all shows no fabricated DMARC warning.

## Assumptions

- "Zone" and its record set continue to come from this project's existing DNS module (Module 2) —
  this spec changes how that data is displayed and extends what's evaluated, not how zones/records
  are enumerated from Cloudflare.
- TTL is treated as per-finding data worth persisting alongside a record's other evaluated fields
  (status, reason), not a separate live-only fetch — consistent with how every other field on this
  page is already sourced from a persisted evaluation run, not fetched fresh on every page load.
- The DMARC-policy check only recognizes the standard `_dmarc` TXT record name and a `p=` tag within
  its value; non-standard DMARC record placements are out of scope.
- The "points at a Cloudflare platform domain" label is presentational only — it does not gate or
  change any severity, and does not require cross-referencing this project's own Pages/Workers
  modules; it is a simple pattern match against the record's own content value.
- Zone tab selection is client-side, local UI state — it does not need to be persisted across page
  reloads or shared via a URL, consistent with this project's existing state-based (routerless)
  navigation approach.
