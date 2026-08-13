# Feature Specification: Pages Dashboard

**Feature Branch**: `015-pages-dashboard`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Pages module dashboard — replaces the existing Pages page's generic
shared findings-table rendering (which currently flattens 3 separate checks per project — subdomain
exposure, production deployment health, and each custom domain — into 3+ separate rows per project)
with a bespoke, purpose-built one-row-per-project view, per the design source's §11 'Pages' mockup.
Same 'pages' nav key, no nav split. Adds a Production domain, Branch, and Last build column; the
Health pill reuses the existing subdomain-exposure status semantics unchanged, folding the mockup's
second Access-specific pill into the existing Reason text rather than inventing a new taxonomy."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See each project's real state in one row (Priority: P1)

An operator viewing the Pages page sees one row per project — its production domain, production
branch, most recent build's status and recency, and its existing exposure health — instead of today's
3-or-more separate rows per project (one per underlying check), which forces the operator to mentally
reassemble what's really going on with a single project.

**Why this priority**: This is the whole point of the redesign — today's page answers "is this
specific check safe" three times per project; an operator actually wants "is this project okay,"
answerable in one row.

**Independent Test**: Can be fully tested by connecting FlareTower to an account with multiple Pages
projects in different states (some with active custom domains, some without; different production
branches; a mix of build outcomes) and confirming each project appears exactly once, with accurate
values in every column.

**Acceptance Scenarios**:

1. **Given** a project with an active custom domain, **When** the operator views its row, **Then**
   the Production domain column shows that domain.
2. **Given** a project with no active custom domain, **When** the operator views its row, **Then**
   the Production domain column shows an explicit "none" state, never a blank cell.
3. **Given** a project's most recent production build succeeded, **When** the operator views its
   row, **Then** the Last build column shows a success state and how long ago it happened.
4. **Given** a project's most recent production build failed, **When** the operator views its row,
   **Then** the Last build column shows a failure state distinctly from a success.
5. **Given** a project already flagged safe/warning/critical/not-evaluated by this project's
   existing subdomain-exposure evaluation, **When** the operator views its row, **Then** the same
   status appears unchanged — no new severity category is introduced by this feature.

### Edge Cases

- What happens when a project has never had a production deployment? The Last build column MUST
  show an explicit "no production deployment yet" state, distinct from both a success and a failure
  state.
- What happens when a project has multiple active custom domains? The Production domain column
  shows one (the first active one) — this is a display simplification, not a claim that it's the
  project's only domain; the underlying per-domain data is unaffected and unchanged by this feature.
- What happens when a project's production branch can't be determined (API field missing or empty)?
  The Branch column MUST show an explicit "not set" state rather than a blank cell or a fabricated
  value.
- What happens when a project's build timestamp can't be determined? The Last build column's
  recency text MUST show an explicit "not available" state rather than a fabricated or misleading
  time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Pages table MUST show exactly one row per project, not one row per underlying
  check.
- **FR-002**: Each row MUST show the project's production domain (or an explicit "none" state),
  production branch (or an explicit "not set" state), most recent production build's status and how
  long ago it happened (or an explicit "no production deployment yet" state), and its existing
  exposure health status.
- **FR-003**: Health status MUST be exactly this project's existing subdomain-exposure
  safe/warning/critical/not-evaluated classification, unchanged — this feature MUST NOT add a new
  severity tier or a second status taxonomy for this column.
- **FR-004**: The system MUST NOT provide any control on this page that mutates Cloudflare Pages
  state (no re-scan, no preview pruning) — the page remains read-only, matching every other module.
- **FR-005**: The page MUST continue to show a critical-finding alert banner above the table when
  applicable, unchanged from the current page's existing behavior.
- **FR-006**: The page MUST show an account-wide summary (project count, per-status counts) above or
  below the table, computable from data already available to the page.

### Key Entities

- **Pages project row**: project name, production domain (or "none"), production branch (or "not
  set"), last build status + recency (or "no production deployment yet"), exposure health status
  (unchanged from existing evaluation).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can assess any single project's overall state (domain, branch, build
  health, exposure) by reading one row, without cross-referencing multiple rows for the same project.
- **SC-002**: 100% of an account's Pages projects appear in the table exactly once, with no
  duplicates and no omissions, across accounts of at least 20 projects.
- **SC-003**: A project with a failed most-recent build is visually distinguishable from one with a
  successful build within the same glance that reveals its exposure health.

## Assumptions

- "Production domain" is a derived display value — the first custom domain among the project's
  already-evaluated domains whose status is active/safe — not a new independently-fetched or
  independently-evaluated data source; the underlying per-domain evaluation this project already
  performs is unchanged.
- Production branch name and build recency are already present in the same Cloudflare API responses
  this project's Pages module already fetches (the projects list and the deployments list,
  respectively) — a working assumption confirmed during planning research, with no new Cloudflare API
  call expected either way.
- Build duration (a "41s"/"1m 12s"-style note visible in the design mockup) is deliberately out of
  scope — presentational polish that would add real parsing complexity (stage-level timing data) for
  a detail the build status + recency + exposure health already make actionable without it.
- The mockup's second, Access-specific status pill (independent label text like "PUBLIC BY DESIGN"/
  "NO POLICY") is not built as a second taxonomy — the information it communicates is already carried
  by the existing Reason text this project's evaluation already produces, and duplicating it as a
  second bespoke pill would contradict this rollout's established precedent (specs 012-014) of
  reusing existing status vocabulary rather than inventing new ones per page.
