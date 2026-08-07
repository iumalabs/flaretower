# Feature Specification: DNS

**Feature Branch**: `002-dns`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Module 2 — DNS: records across zones, proxied vs DNS-only status, dangling records. Per constitution §2 item 2, building on Module 1's exposure-detection pattern (inventory, flag risk, scheduled drift detection)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every DNS record across every zone in one place (Priority: P1)

An operator managing a Cloudflare account with multiple zones opens
FlareTower and sees every DNS record across every zone — name, type,
target/content, and whether it is proxied through Cloudflare or DNS-only —
in a single inventory, without switching between zone dashboards one at a
time.

**Why this priority**: This is the foundation every other DNS capability in
this module builds on, in the same way Module 1's full exposure inventory
was foundational there. An operator with more than a handful of zones has
no single-page view of their DNS today.

**Independent Test**: Can be fully tested by connecting FlareTower to an
account with multiple zones and multiple record types, and confirming every
record from every zone appears exactly once with accurate type/target/proxy
status — delivers value before any risk-flagging exists.

**Acceptance Scenarios**:

1. **Given** an account with 3 zones, each with a mix of `A`, `CNAME`, `MX`,
   and `TXT` records, **When** the operator opens the DNS inventory,
   **Then** every record from all 3 zones appears, grouped by zone, with no
   omissions.
2. **Given** a record that is proxied through Cloudflare, **When** the
   operator views it, **Then** its proxied status is shown distinctly from
   a DNS-only record in the same zone.
3. **Given** a zone with zero records (freshly added, not yet configured),
   **When** the operator views the inventory, **Then** that zone appears
   with an empty record list, not omitted entirely.

---

### User Story 2 - Get flagged when a DNS record is dangling (Priority: P1)

A DNS record (typically `CNAME`, but also `A`/`AAAA` records pointing at
addresses no longer under the operator's control) that resolves to a
resource which no longer exists — a decommissioned third-party service, a
deleted cloud resource, an expired external domain — is flagged as a
subdomain-takeover risk, distinctly and immediately, everywhere it appears.

**Why this priority**: A dangling DNS record is a well-known, actively
exploited class of vulnerability (subdomain takeover): an attacker who
notices the dangling target can claim the now-unowned resource and serve
content under the operator's own domain. This is the DNS module's
equivalent of Module 1's "publicly reachable and unprotected" critical
finding — the single highest-value thing this module must surface.

**Independent Test**: Can be fully tested by creating a CNAME record in a
test zone pointing at a resource confirmed to no longer exist (e.g. a
deleted cloud storage bucket's default hostname) and confirming it renders
as critical, distinct from healthy records, without any other module
present.

**Acceptance Scenarios**:

1. **Given** a `CNAME` record pointing at a hostname that no longer
   resolves to an active resource of the expected kind (e.g. a
   `*.s3.amazonaws.com` target with no bucket behind it), **When** the
   operator views that record, **Then** it is marked critical with a reason
   naming the dangling target.
2. **Given** a `CNAME` record pointing at a hostname that resolves
   normally and appears to serve content, **When** the operator views that
   record, **Then** it is marked safe, not flagged.
3. **Given** FlareTower cannot conclusively determine whether a record's
   target is dangling (e.g. the target's hosting provider isn't one of the
   known dangling-prone patterns, or a check times out), **When** the
   operator views that record, **Then** it is marked not evaluated, never
   silently safe.

---

### User Story 3 - See proxied vs. DNS-only status clearly (Priority: P2)

For every record capable of being proxied (`A`, `AAAA`, `CNAME`), the
operator can see at a glance whether it is proxied through Cloudflare
(traffic passes through Cloudflare's network — WAF, DDoS protection,
caching apply) or DNS-only (traffic goes directly to the origin, bypassing
those protections and revealing the origin's IP address).

**Why this priority**: A record that was proxied and got switched to
DNS-only — intentionally or by mistake — silently loses every
Cloudflare-layer protection and exposes the origin IP. This is a real,
common misconfiguration class distinct from the dangling-record risk (User
Story 2): the resource behind the record is legitimate and controlled by
the operator, but it's unnecessarily exposed at the network layer. Depends
on User Story 1's inventory existing but doesn't require User Story 2 to
deliver value on its own.

**Independent Test**: Can be fully tested by toggling a test record's proxy
status to DNS-only and confirming the inventory reflects it distinctly from
proxied records, without dangling-record detection being implemented.

**Acceptance Scenarios**:

1. **Given** a record proxied through Cloudflare, **When** the operator
   views it, **Then** it is marked as proxied.
2. **Given** a record set to DNS-only, **When** the operator views it,
   **Then** it is marked as DNS-only, and — for a record type where this
   matters most (an origin-facing `A`/`AAAA`/`CNAME`, not `MX`/`TXT`/other
   record types that are DNS-only by nature and carry no such risk) — this
   is visually distinguished as worth the operator's attention, not
   presented as a routine, unremarkable state.
3. **Given** a record type that cannot be proxied regardless of setting
   (e.g. `MX`, `TXT`, `NS`), **When** the operator views it, **Then** it is
   shown as not applicable for proxy status, not as "DNS-only" (avoiding a
   false impression that something was turned off).

---

### User Story 4 - Get notified when DNS drifts, without opening the panel (Priority: P2)

The same record evaluation that powers the interactive inventory also runs
on a recurring schedule, independent of anyone viewing the UI, following
the same shared-evaluation-module pattern as Module 1 (constitution
Principle III). When a record newly becomes dangling, or a previously
proxied record newly becomes DNS-only, the operator is alerted without
having opened FlareTower to notice.

**Why this priority**: DNS misconfiguration and dangling records both
accumulate silently between an operator's occasional manual reviews — the
same "drift between visits" problem the founding brief and Module 1 both
target. This is the DNS module's scheduled-mode counterpart to the
interactive inventory.

**Independent Test**: Can be fully tested by running the scheduled scan
against a test account, then introducing a dangling record between two
scheduled runs, and confirming an alert fires after the run that observes
it — without needing the interactive UI to be open.

**Acceptance Scenarios**:

1. **Given** the scheduled scan previously found no dangling records,
   **When** a record becomes dangling before the next scheduled run,
   **Then** an alert is raised after that run completes.
2. **Given** a record was already flagged dangling on the previous run and
   remains dangling, **When** the run completes, **Then** the operator is
   not re-alerted for the same still-dangling record on every run.
3. **Given** the scheduled scan cannot evaluate part of the account (e.g.
   an API error, a target-resolution timeout), **When** the run completes,
   **Then** that failure is itself surfaced, not silently treated as "no
   new dangling records."

---

### Edge Cases

- What happens when the same hostname has multiple DNS records of
  different types (e.g. both an `A` and a `CNAME`-incompatible
  configuration, or multiple `A` records for round-robin)? Each record must
  be evaluated and shown as its own entry, not merged or deduplicated by
  hostname alone.
- What happens when a zone is paused or not actively proxying any traffic
  through Cloudflare (e.g. "DNS-only zone" / partial setup)? Records must
  still be inventoried; proxied-status evaluation reflects the actual
  per-record setting, not an assumption based on zone-level configuration.
- How does the system handle a wildcard record (`*.example.com`)? It is
  inventoried like any other record; dangling-target evaluation for a
  wildcard's implied targets is out of scope (only the record's own
  explicit target, if any, is evaluated).
- What happens when the configured Cloudflare API token lacks sufficient
  scope to list records in some zones? Those zones' records must be shown
  as "not fully evaluated," never silently omitted or presented as safe.
- What happens the very first time the scheduled scan runs, with no prior
  run to compare against? Every dangling-record or newly-DNS-only finding
  from that first run must still trigger an alert — no grace period, same
  as Module 1's equivalent edge case.
- What happens when a record's target briefly fails to resolve due to
  transient DNS propagation or the target service's own downtime, not
  because it's genuinely dangling? A single check is expected to
  occasionally have false positives from transient issues; this spec
  requires the reason shown to name what was actually observed (e.g. "no
  active resource found at target" vs. "target did not respond") so an
  operator can distinguish a likely-transient result from a
  high-confidence dangling finding — it does not require multi-check
  confirmation before flagging (that refinement is a reasonable future
  enhancement, not required for this module to ship).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enumerate every zone in the connected Cloudflare
  account.
- **FR-002**: System MUST enumerate every DNS record in every zone,
  including its name, type, target/content, and proxy status.
- **FR-003**: System MUST present the full inventory of zones and their
  records in a single view, with every zone represented exactly once and
  every record within it represented exactly once.
- **FR-004**: For record types capable of being proxied (`A`, `AAAA`,
  `CNAME`), System MUST clearly distinguish proxied from DNS-only status;
  for record types that cannot be proxied, System MUST show proxy status as
  not applicable rather than as DNS-only.
- **FR-005**: System MUST evaluate `CNAME` (and other externally-pointing)
  records against known patterns of dangling targets (resources that no
  longer exist at a third-party or cloud provider) and MUST mark a record
  as critical when its target is confirmed dangling.
- **FR-006**: System MUST mark a record as not evaluated, not safe, when it
  cannot conclusively determine whether the record's target is dangling.
- **FR-007**: System MUST evaluate records using the same logic in both the
  on-demand interactive view and a recurring scheduled run, with no
  divergence in what counts as dangling, DNS-only-of-note, or safe between
  the two (constitution Principle III).
- **FR-008**: System MUST alert when the scheduled run finds a record newly
  in a dangling or notably-DNS-only state that was not in that state on the
  previous run.
- **FR-009**: System MUST NOT re-alert on every scheduled run for a record
  whose flagged state is unchanged from the previous run.
- **FR-010**: System MUST require the operator to be authenticated before
  viewing any DNS data.
- **FR-011**: System MUST clearly indicate, per zone or per record, when it
  could not be fully evaluated (e.g. insufficient token scope, an API
  error, a target-resolution failure), and MUST NOT present an unevaluated
  item as safe.
- **FR-012**: System MUST NOT modify any DNS record, zone setting, or other
  Cloudflare account configuration as part of this feature — this module is
  detection-only; configuration mutation is out of scope for this spec.

### Key Entities

- **Zone**: A DNS zone in the Cloudflare account (a domain and its
  records). Relevant attributes: name, ID.
- **DNS Record**: A single record within a zone — name, type
  (A/AAAA/CNAME/MX/TXT/NS/etc.), target/content, proxy-capable flag, and
  current proxied/DNS-only setting (when proxy-capable).
- **Dangling Target Finding**: The evaluated state of one record's
  external target — safe, critical (confirmed dangling), or not evaluated
  — per the product's established status semantics (shared with Module 1).
- **DNS Finding**: The evaluated state of one record at a point in time,
  covering both the dangling-target check and the proxied/DNS-only-of-note
  check — safe, warning, critical, or not evaluated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator managing an account with multiple zones can see
  every DNS record across every zone within one minute of opening the
  panel.
- **SC-002**: 100% of zones and their records appear in the inventory —
  zero silent omissions.
- **SC-003**: A record that becomes dangling is detected and alerted on
  within one scheduled scan cycle, with no operator action required to
  trigger the check.
- **SC-004**: An operator can distinguish, for every record, "confirmed
  safe," "confirmed dangling/critical," and "not fully evaluated" — with
  zero records left ambiguous as to which state they're in.
- **SC-005**: Across repeated scheduled runs with no underlying change, the
  operator receives zero duplicate alerts for the same unchanged finding.

## Assumptions

- The Cloudflare API token configured for FlareTower has, at minimum,
  read-only access to Zones and DNS Records across the account. Per the
  project constitution, this module requires read-only scope only.
- Dangling-target detection is pattern-based (checking a record's target
  against known signatures of decommissioned/claimable third-party and
  cloud-provider resources — e.g. an unclaimed S3 bucket, an unclaimed
  GitHub Pages site, an unclaimed Heroku app) rather than an exhaustive,
  guaranteed-complete security audit. New provider patterns are added
  incrementally over time; this spec does not require a specific, fixed
  list of patterns to ship complete.
- "DNS-only-of-note" (User Story 3) applies to origin-facing record types
  where bypassing Cloudflare's proxy has a real security/protection
  implication (`A`, `AAAA`, `CNAME`); it does not apply to record types
  that are inherently DNS-only (`MX`, `TXT`, `NS`, etc.).
- The scheduled scan's exact cadence is a planning-level decision, not
  fixed by this spec — this spec requires only that a recurring,
  unattended check exists and that drift is caught within it.
- How an alert reaches the operator (e-mail, in-app banner, other channel)
  is a planning-level decision out of scope for this spec, consistent with
  Module 1's own Assumptions.
- Historical drift tracking ("what changed since yesterday") belongs to
  the future Audit & Drift module (constitution §2 item 7) and is out of
  scope here — this module needs only current-state evaluation plus
  new-vs-repeat alerting, matching Module 1's scope boundary.
- No Cloudflare API scopes beyond DNS/Zone read access are requested for
  this module; adding mutation capability (e.g. one-click "remove dangling
  record") is explicitly future scope, not part of this spec.
