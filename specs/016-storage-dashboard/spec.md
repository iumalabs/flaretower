# Feature Specification: Storage Dashboard

**Feature Branch**: `016-storage-dashboard`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Storage module dashboard — upgrades the existing Storage page's
three grouped tables (R2 buckets, KV namespaces, D1 databases — this structure already exists,
unlike Pages/DNS which needed restructuring) in place, per the design source's §12 'Storage'
mockup. This is spec 016, the fifth of the 7-spec per-module dashboard rollout. Adds a 'Bound to'
column (which deployed Worker(s) reference each resource) shared across all three groups, a
'Custom domain' column for R2 buckets (already-fetched data, not yet surfaced), and 'Tables'/'Size'
columns for D1 databases (one new small per-database fetch). The Exposure column reuses the
existing safe/warning/critical/not_evaluated status semantics unchanged — no new taxonomy.
R2 Objects/Size and KV Keys/Size are out of scope — no cheap Cloudflare API source exists for
either."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See who actually uses a storage resource (Priority: P1)

An operator viewing the Storage page sees, for every R2 bucket, KV namespace, and D1 database,
which deployed Worker(s) actually reference it — instead of today's page, which can only say
whether a resource is referenced by *some* Worker or none, without naming which one.

**Why this priority**: "Is this bucket safe to delete?" and "which Worker owns this namespace?"
are the two questions an operator actually has when looking at a storage inventory; today's page
can only answer the first, and only as a yes/no.

**Independent Test**: Can be fully tested by connecting FlareTower to an account with resources
referenced by zero, one, and multiple Workers, and confirming each resource's row shows the
correct Worker name, "N workers", or an explicit "no Workers reference this resource" state.

**Acceptance Scenarios**:

1. **Given** a resource referenced by exactly one deployed Worker's bindings, **When** the
   operator views its row, **Then** the Bound to column shows that Worker's name.
2. **Given** a resource referenced by more than one deployed Worker's bindings, **When** the
   operator views its row, **Then** the Bound to column shows a count ("N workers"), not a
   truncated or partial name list.
3. **Given** a resource referenced by zero deployed Workers, **When** the operator views its row,
   **Then** the Bound to column shows an explicit "none" state, never a blank cell.

---

### User Story 2 - See an R2 bucket's public-facing domain at a glance (Priority: P2)

An operator viewing the R2 buckets table sees each bucket's custom domain directly in the table,
instead of having to read the Reason text to find a domain name that may be buried inside a longer
sentence.

**Why this priority**: The custom domain is exactly the fact that turns a private bucket into a
public one; today's page already computes this evaluation but doesn't surface the domain itself as
a scannable column.

**Independent Test**: Can be fully tested by connecting to an account with a bucket that has an
enabled custom domain and one that doesn't, confirming the Custom domain column shows the real
domain or an explicit "none" state.

**Acceptance Scenarios**:

1. **Given** a bucket with an enabled custom domain, **When** the operator views its row, **Then**
   the Custom domain column shows that domain.
2. **Given** a bucket with no enabled custom domain, **When** the operator views its row, **Then**
   the Custom domain column shows an explicit "none" state.

---

### User Story 3 - See a D1 database's real size and table count (Priority: P3)

An operator viewing the D1 databases table sees each database's table count and on-disk size,
data the current page doesn't fetch at all.

**Why this priority**: Lowest priority of the three — table count and size are useful context but
not a security signal the way Bound to or Custom domain are; this is the smallest, most additive
of the three stories.

**Independent Test**: Can be fully tested by connecting to an account with at least one D1
database and confirming the Tables and Size columns show real, non-fabricated values.

**Acceptance Scenarios**:

1. **Given** a D1 database, **When** the operator views its row, **Then** the Tables column shows
   its real table count and the Size column shows its real on-disk size.

### Edge Cases

- What happens when a resource is referenced by zero deployed Workers? The Bound to column MUST
  show an explicit "none" state, never a blank cell or a fabricated Worker name.
- What happens when the Worker-bindings scan itself partially fails (some scripts' bindings
  couldn't be checked)? The existing safe/warning/not_evaluated usage-status logic already handles
  this (a resource can't be confidently called "unused" when the scan is incomplete) — this feature
  does not change that logic; the Bound to column for an affected resource shows whatever Worker
  names *were* successfully discovered before the failure, which may undercount but never fabricates.
- What happens when a D1 database's detail fetch fails? Its Tables/Size columns MUST show an
  explicit "not available" state, distinct from a real zero value, and MUST NOT block the rest of
  that database's row (existing status/reason) from rendering.
- What happens when an R2 bucket has more than one enabled custom domain? The Custom domain column
  shows one (the first enabled one) — a display simplification, not a claim that it's the bucket's
  only domain; the underlying per-domain data is unaffected and unchanged by this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For every R2 bucket, KV namespace, and D1 database, the Storage page MUST show which
  deployed Worker(s) reference it: the single Worker's name, a count when more than one references
  it, or an explicit "none" state when zero do.
- **FR-002**: The R2 buckets table MUST show each bucket's custom domain (or an explicit "none"
  state).
- **FR-003**: The D1 databases table MUST show each database's table count and on-disk size (or an
  explicit "not available" state if that data couldn't be fetched).
- **FR-004**: The existing Exposure status (safe/warning/critical/not_evaluated) for every
  resource MUST remain exactly as currently computed — this feature MUST NOT add a new severity
  tier or a second status taxonomy for that column, and MUST NOT change any existing status/reason
  decision.
- **FR-005**: The system MUST NOT provide any control on this page that mutates Cloudflare state
  (no bindings-map view, no re-scan) — the page remains read-only, matching every other module.
- **FR-006**: The page header MUST show a summary computable from real, already-available data
  (total resource count, count publicly exposed) — it MUST NOT show a total-size figure, since no
  cheap, honest data source exists for aggregate storage size across all three resource types.
- **FR-007**: R2 bucket object count/size and KV namespace key count/size are explicitly out of
  scope for this feature — no per-resource endpoint exists for either without disproportionate
  cost (full key-space pagination for KV, GraphQL Analytics for R2), so this feature MUST NOT
  fabricate or approximate these values.

### Key Entities

- **Bound-to relationship**: for a given R2 bucket, KV namespace, or D1 database, the set of
  deployed Worker script names whose bindings reference it — zero, one, or many.
- **D1 database detail**: table count and on-disk size for a single database, in addition to the
  identity/usage data this project already captures.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can identify which Worker(s) reference any storage resource by reading
  its row, without cross-referencing a separate bindings view.
- **SC-002**: 100% of an account's R2 buckets, KV namespaces, and D1 databases show a real,
  non-fabricated Bound to value, across accounts of at least 20 resources per type.
- **SC-003**: Every value shown on this page (Bound to, Custom domain, Tables, Size) traces to a
  real Cloudflare API response — none are estimated, interpolated, or hardcoded.

## Assumptions

- "Bound to" is derived from data this project already fetches for its existing usage-status
  evaluation (a Worker-bindings scan across every deployed Worker) — extended to preserve the
  referencing Worker's name instead of discarding it, and extended to also recognize R2-bucket
  bindings (not scanned at all today). No new Cloudflare API call for this part.
- D1's table count and on-disk size require one new small per-database detail fetch, distinct from
  the list call this project already makes — a working assumption confirmed during planning
  research, with no new Cloudflare API token scope expected (same D1 read access already granted).
- R2 bucket object count/size and KV namespace key count/size, both visible in the design mockup,
  are deliberately out of scope — presentational detail that would require disproportionate new
  complexity (full key-space pagination for KV; GraphQL Analytics wiring for R2) for a fact this
  project has no cheap, honest way to obtain per resource.
- The mockup's bespoke Exposure pill text ("INTERNAL"/"ORPHANED" for KV/D1, "PUBLIC READ"/
  "PRIVATE" for R2) is not built as a second taxonomy — it's already equivalently communicated by
  this project's existing Reason text, and duplicating it as bespoke pill labels would contradict
  this rollout's established precedent (specs 012-015) of reusing existing status vocabulary
  rather than inventing new ones per page.
- The page's current three-grouped-tables layout (R2 buckets / KV namespaces / D1 databases,
  already matching the mockup's "grouped tables rather than tabs" structure) is unchanged by this
  feature — only new columns are added to each existing table.
