# Feature Specification: R2 / KV / D1

**Feature Branch**: `005-r2-kv-d1`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "Module 5 — R2 / KV / D1: buckets, namespaces, databases; public exposure of R2. Per constitution §2 item 5. Inventory R2 buckets, KV namespaces, and D1 databases across the account, following the exact same audit pattern established by Modules 1-4. R2's public-bucket exposure is the constitution's explicitly named headline risk signal, directly analogous to Module 1's Worker exposure and Module 4's pages.dev exposure. KV namespaces and D1 databases aren't directly internet-exposable, so their audit value is inventory completeness and unused-resource visibility (whether a namespace/database is still referenced by any deployed Worker) rather than a public/private judgment."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every R2 bucket, KV namespace, and D1 database in one place (Priority: P1)

An operator opens FlareTower and sees every R2 bucket, every KV namespace,
and every D1 database in the account, each in its own section, in one
place.

**Why this priority**: Storage resources accumulate quietly over a
project's lifetime — a bucket created for a one-off migration, a
namespace from an abandoned experiment. Today there is no single-page
inventory of everything Cloudflare is storing on the account's behalf.
This is the foundation every other capability in this module builds on,
the same role User Story 1 played in Modules 1-4.

**Independent Test**: Can be fully tested by connecting FlareTower to an
account with several R2 buckets, KV namespaces, and D1 databases and
confirming every one appears, none omitted.

**Acceptance Scenarios**:

1. **Given** an account with R2 buckets, KV namespaces, and D1 databases,
   **When** the operator opens the inventory, **Then** every one of them
   appears exactly once, grouped by resource type.
2. **Given** the account has zero resources of one type (e.g. no D1
   databases yet), **When** the operator views the inventory, **Then**
   that section shows an empty (not omitted, not errored) result.

---

### User Story 2 - Get flagged when an R2 bucket is publicly exposed (Priority: P1)

Every R2 bucket is checked for public reachability: whether its
Cloudflare-managed `r2.dev` public URL is enabled, and whether any custom
domain attached to it is enabled and, if so, whether that domain is
covered by a meaningfully restrictive Access application — the same
hostname-coverage and policy-openness check already established for
Worker hostnames (Module 1) and Pages `pages.dev` subdomains (Module 4).

**Why this priority**: This is the constitution's explicitly named
headline risk for this module. An R2 bucket holding anything
sensitive — user uploads, internal exports, backups — that is reachable
by anyone with the URL is exactly the kind of silent, easy-to-forget
misconfiguration this product exists to surface, the same class of risk
as an unprotected Worker or Pages hostname.

**Independent Test**: Can be fully tested by creating one bucket with its
`r2.dev` domain enabled, one with an enabled custom domain not covered by
any Access application, one with an enabled custom domain covered by an
Allow-Everyone policy, one with an enabled custom domain covered by a
scoped policy, and one bucket with no public access configured at all —
confirming each renders with the correct distinct status.

**Acceptance Scenarios**:

1. **Given** a bucket with its `r2.dev` managed public URL enabled,
   **When** the operator views it, **Then** it is flagged critical —
   `r2.dev` access cannot be gated by Access, so enabling it is always a
   public-exposure decision.
2. **Given** a bucket with an enabled custom domain not covered by any
   Access application, **When** the operator views it, **Then** it is
   flagged critical.
3. **Given** a bucket with an enabled custom domain covered by an
   Access application whose policy is effectively open (Allow-Everyone,
   Bypass, or zero policies), **When** the operator views it, **Then**
   it is flagged warning.
4. **Given** a bucket with an enabled custom domain covered by a
   meaningfully scoped Access policy, **When** the operator views it,
   **Then** it is marked safe.
5. **Given** a bucket with no `r2.dev` access and no enabled custom
   domains, **When** the operator views it, **Then** it is marked safe —
   only reachable through API credentials or a Worker binding, not
   directly from the public internet.

---

### User Story 3 - Get flagged when a KV namespace or D1 database looks unused (Priority: P2)

Every KV namespace and D1 database is checked against every deployed
Worker's bindings; one that is not referenced by any Worker's bindings is
flagged as possibly unused and worth reviewing.

**Why this priority**: Unlike R2, a KV namespace or D1 database is never
directly reachable from the public internet — it is only ever reached
through a Worker binding. Its risk is not exposure but accumulation: a
namespace or database nobody's code still points to is either safe to
delete or, if it still holds live data an operator forgot about, worth a
second look. This is independently testable and delivers stand-alone
value without User Story 2's exposure logic.

**Independent Test**: Can be fully tested by creating one KV namespace
and one D1 database bound to a deployed Worker, and one of each not bound
to any Worker, and confirming the bound ones render safe while the
unbound ones render flagged.

**Acceptance Scenarios**:

1. **Given** a KV namespace that is not referenced by any deployed
   Worker's bindings, **When** the operator views it, **Then** it is
   flagged warning as possibly unused.
2. **Given** a KV namespace that is bound by at least one deployed
   Worker, **When** the operator views it, **Then** it is marked safe.
3. **Given** a D1 database that is not referenced by any deployed
   Worker's bindings, **When** the operator views it, **Then** it is
   flagged warning as possibly unused.
4. **Given** a D1 database that is bound by at least one deployed
   Worker, **When** the operator views it, **Then** it is marked safe.

---

### User Story 4 - Get notified when storage posture drifts, without opening the panel (Priority: P2)

The same evaluation that powers the interactive inventory also runs on
the existing shared scheduled audit (constitution Principle III, joining
Modules 1-4's scheduled evaluation rather than adding a new Cron
Trigger). When an R2 bucket newly becomes publicly exposed, or a KV
namespace or D1 database newly looks unused, the operator is alerted
without having opened FlareTower.

**Why this priority**: Same "drift between visits" rationale as every
other module's User Story 4. A bucket's `r2.dev` domain enabled for a
quick test and never disabled, or the last Worker referencing a
namespace being redeployed without that binding, both accumulate
silently otherwise.

**Independent Test**: Can be fully tested by running the scheduled scan
against a test account, then enabling a test bucket's `r2.dev` domain
between two scheduled runs, and confirming an alert fires after the run
that observes it.

**Acceptance Scenarios**:

1. **Given** the scheduled scan previously found no exposed buckets or
   unused resources, **When** any of those newly occurs before the next
   scheduled run, **Then** an alert is raised after that run completes.
2. **Given** a finding was already flagged on the previous run and
   remains in the same state, **When** the run completes, **Then** the
   operator is not re-alerted for the same still-flagged item on every
   run.
3. **Given** the scheduled scan cannot evaluate part of the account
   (e.g. an API error), **When** the run completes, **Then** that
   failure is itself surfaced, not silently treated as "nothing new."

---

### Edge Cases

- What happens when a bucket has multiple enabled custom domains, some
  covered and some not? Matching Module 1's established rule, any
  enabled custom domain that is uncovered or covered by an open policy is
  enough to flag the bucket, regardless of other, more restrictive
  domains also present.
- What happens when a bucket's custom domain is attached but not yet
  `enabled`? An attached-but-disabled domain is not currently serving the
  bucket publicly and does not affect this bucket's exposure status —
  domain activation health is not this module's concern (it is Module
  4's, for Pages; a future enhancement could add the equivalent check
  here).
- What happens when the account has zero R2 buckets, zero KV namespaces,
  or zero D1 databases? The corresponding inventory section shows an
  empty (not omitted, not errored) result.
- What happens when a Worker's bindings cannot be listed (e.g. a
  transient API error for one script)? That Worker is treated as unable
  to confirm which resources it references; a namespace or database is
  only marked safe when at least one binding positively confirms it is
  referenced — an unconfirmed Worker does not, by itself, mark every
  resource as unused, but if it was the resource's only known reference
  and could not be checked, the resource's usage status is reported
  not_evaluated rather than a guessed warning or safe.
- What happens the very first time the scheduled scan runs? Every
  critical/warning finding from that first run must still trigger an
  alert — no grace period, same as every other module's equivalent edge
  case.
- What happens when the configured API token lacks sufficient scope to
  list buckets, namespaces, databases, or Worker bindings? Those items
  are shown as "not fully evaluated," never silently omitted or
  presented as safe.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enumerate every R2 bucket, every KV namespace,
  and every D1 database in the account.
- **FR-002**: System MUST present the full inventory of all three
  resource types in a single view, grouped by type, with every resource
  represented exactly once.
- **FR-003**: System MUST determine, for every R2 bucket, whether its
  `r2.dev` managed public URL is enabled, and MUST mark the bucket
  critical when it is.
- **FR-004**: System MUST determine, for every R2 bucket, whether it has
  any enabled custom domain, and for each such domain whether it is
  covered by an Access application, using the same hostname-coverage
  logic already established in Module 1.
- **FR-005**: System MUST mark a bucket critical when it has an enabled
  custom domain not covered by any Access application.
- **FR-006**: System MUST mark a bucket warning when its only public
  exposure is an enabled custom domain covered by an Access application
  whose policy is effectively open (grants access to Everyone, bypasses
  identity, or has zero policies attached) — using the same
  policy-openness logic already established in Modules 1, 3, and 4.
- **FR-007**: System MUST mark a bucket safe when it has no enabled
  `r2.dev` domain and either no enabled custom domains or every enabled
  custom domain is covered by a meaningfully scoped Access policy.
- **FR-008**: System MUST determine, for every KV namespace and every D1
  database, whether it is referenced by at least one deployed Worker's
  bindings, and MUST mark it warning when it is not referenced by any.
- **FR-009**: System MUST mark a KV namespace or D1 database safe when at
  least one deployed Worker's bindings reference it.
- **FR-010**: System MUST evaluate R2 bucket exposure and KV/D1 usage
  using the same logic in both the on-demand interactive view and the
  existing shared recurring scheduled run (constitution Principle III),
  with no divergence between the two.
- **FR-011**: System MUST alert when the scheduled run finds a bucket,
  namespace, or database newly in a flagged state that was not flagged on
  the previous run.
- **FR-012**: System MUST NOT re-alert on every scheduled run for a
  finding whose flagged state is unchanged from the previous run.
- **FR-013**: System MUST require the operator to be authenticated before
  viewing any R2/KV/D1 data.
- **FR-014**: System MUST clearly indicate, per bucket, namespace, or
  database, when it could not be fully evaluated (e.g. insufficient token
  scope, an API error), and MUST NOT present an unevaluated item as safe.
- **FR-015**: System MUST NOT modify any R2 bucket, KV namespace, D1
  database, custom domain, or other Cloudflare account configuration as
  part of this feature — this module is detection-only; configuration
  mutation (e.g. disabling public access, deleting an unused resource) is
  out of scope for this spec.

### Key Entities

- **R2 Bucket**: name, whether its `r2.dev` managed domain is enabled,
  its enabled custom domains (if any).
- **KV Namespace**: id, title.
- **D1 Database**: uuid, name.
- **Worker Binding Reference**: which KV namespaces and D1 databases a
  deployed Worker's bindings reference — read fresh from each Worker's
  configuration on every evaluation, not persisted as its own entity.
- **Storage Finding**: the evaluated state of one R2 bucket's exposure,
  or one KV namespace's or D1 database's usage, at a point in time — safe,
  warning, critical, or not evaluated (R2 bucket exposure only; KV/D1
  usage has no critical outcome) — per the product's established status
  semantics (shared across all modules).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can see every R2 bucket, KV namespace, and D1
  database in the account within one minute of opening the panel.
- **SC-002**: 100% of R2 buckets, KV namespaces, and D1 databases appear
  in the inventory — zero silent omissions.
- **SC-003**: An R2 bucket that becomes publicly exposed is detected and
  alerted on within one scheduled scan cycle, with no operator action
  required.
- **SC-004**: An operator can distinguish, for every bucket, namespace,
  and database, "confirmed safe," "confirmed flagged," and "not fully
  evaluated" — zero items left ambiguous.
- **SC-005**: Across repeated scheduled runs with no underlying change,
  the operator receives zero duplicate alerts for the same unchanged
  finding.

## Assumptions

- The Cloudflare API token configured for FlareTower has, at minimum,
  read-only access to R2 buckets (including their public-access and
  custom-domain configuration), KV namespaces, D1 databases, and Worker
  script bindings, in addition to the Access application read scope
  Modules 1, 3, and 4 already require. Per the project constitution, this
  module requires read-only scope only.
- The R2 exposure check (User Story 2) reuses the exact hostname-coverage
  and policy-openness decision logic already built for Module 1 and
  reused by Module 4 — this module does not redefine what "covered" or
  "effectively open" means, only applies the existing definition to R2
  custom domains.
- "Referenced by a deployed Worker's bindings" (User Story 3) is
  evaluated against every Worker's current, live configuration on each
  run — a Worker that is deployed but whose latest deployed version no
  longer includes a binding it once had no longer counts as referencing
  that resource. This module does not track historical binding usage.
- Worker for Platforms dispatch namespaces and their scripts are out of
  scope for the binding cross-reference in User Story 3 — only bindings
  on directly deployed Worker scripts are checked, mirroring Module 1's
  existing scope boundary for the account's Worker inventory.
- Bucket, namespace, and database object listings (contents, keys, rows)
  are explicitly out of scope — this module inventories and evaluates
  the resources themselves, never their stored data.
- How an alert reaches the operator is out of scope for this spec,
  consistent with every other module's Assumptions.
- Historical drift tracking belongs to the future Audit & Drift module
  (constitution §2 item 7) and is out of scope here.
- No Cloudflare API scopes beyond R2/KV/D1/Worker-bindings read access
  and the already-established Access read access are requested for this
  module; mutation capability (e.g. one-click disabling public access,
  deleting an unused resource) is explicitly future scope.
