# Feature Specification: Pages

**Feature Branch**: `004-pages`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "Module 4 — Pages: projects, deployments, custom domains. Per constitution §2 item 4. Inventory Cloudflare Pages projects, their deployments, and custom domains, following the exact same audit pattern established by Modules 1-3: read-only Cloudflare API inventory, evaluate each entity into safe/warning/critical/not_evaluated status, persist findings to D1 per run, diff against the previous run for new-vs-repeat alerting, expose both an interactive evaluate endpoint and a scheduled Cron Trigger entry point sharing one evaluation module."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every Pages project and its custom domains, with domain status (Priority: P1)

An operator opens FlareTower and sees every Cloudflare Pages project in the
account, along with every custom domain attached to each project and
whether that domain is actually active (correctly verified and serving
traffic) or stuck in some other state.

**Why this priority**: A custom domain that looks attached in the
dashboard but never finished verification is invisible drift — the
operator believes `docs.example.com` is live on Pages when it silently
isn't. This is the foundation every other capability in this module builds
on, the same role User Story 1 played in Modules 1-3.

**Independent Test**: Can be fully tested by connecting FlareTower to an
account with several Pages projects, some with custom domains in a mix of
states (active, still verifying, failed), and confirming every project and
every domain appears with its correct state, none omitted.

**Acceptance Scenarios**:

1. **Given** an account with multiple Pages projects, **When** the operator
   opens the inventory, **Then** every project appears exactly once, with
   all of its custom domains listed.
2. **Given** a project with zero custom domains attached, **When** the
   operator views it, **Then** it still appears in the inventory (not
   omitted), with its custom domain list empty.
3. **Given** a custom domain that is fully active, **When** the operator
   views it, **Then** it is marked safe.
4. **Given** a custom domain stuck in a non-active state (still verifying,
   verification failed, or otherwise not serving), **When** the operator
   views it, **Then** it is flagged, distinctly from an active domain.

---

### User Story 2 - Get flagged when a project's `pages.dev` subdomain is exposed (Priority: P1)

Every Pages project's `<project>.pages.dev` subdomain — which always
exists, serves every preview deployment, and serves production traffic
whenever no custom domain is configured — is checked the same way Module 1
checks a Worker's public hostnames: is it covered by an Access
application, and if so, does that application's policy meaningfully
restrict who can reach it?

**Why this priority**: Preview deployments frequently carry
work-in-progress content, and the `pages.dev` subdomain is guessable and
always reachable unless explicitly gated behind Access. This is the same
class of risk Module 1 flags for Workers' `workers.dev` exposure and
Module 3 flags for open Access policies — an unprotected `pages.dev`
subdomain is exactly as exposed as an unprotected Worker.

**Independent Test**: Can be fully tested by creating one Pages project
with no Access application covering its `pages.dev` subdomain, one with an
Access application whose policy allows Everyone, and one properly gated
behind a scoped Access policy, and confirming each renders with the
correct distinct status.

**Acceptance Scenarios**:

1. **Given** a project whose `pages.dev` subdomain is not covered by any
   Access application, **When** the operator views it, **Then** it is
   flagged critical.
2. **Given** a project whose `pages.dev` subdomain is covered by an Access
   application, but that application's policy allows Everyone or bypasses
   identity (or the application has zero policies), **When** the operator
   views it, **Then** it is flagged warning — reachable behind a gate that
   doesn't meaningfully restrict anyone, distinct from being wholly
   uncovered.
3. **Given** a project whose `pages.dev` subdomain is covered by an Access
   application with a meaningfully scoped policy, **When** the operator
   views it, **Then** it is marked safe.

---

### User Story 3 - Get flagged when the latest production deployment failed (Priority: P2)

Each project's most recent deployment to its production environment is
checked; if that deployment failed, the project is flagged, since the live
site may now be stale (silently still serving an older successful build)
or, if there was never a prior successful build, not serving at all.

**Why this priority**: A failed production deployment is easy to miss —
Pages keeps serving the last successful build (or nothing, for a
project's first-ever deployment), so nothing visibly breaks and the
failure notification email is easy to lose. This is lower priority than
User Stories 1-2 because it concerns deployment health rather than public
exposure, but it is independently testable and delivers value on its own.

**Independent Test**: Can be fully tested by triggering a production
deployment that fails on a test project and confirming it renders flagged,
while a project whose latest production deployment succeeded renders
safe.

**Acceptance Scenarios**:

1. **Given** a project whose most recent production deployment failed,
   **When** the operator views it, **Then** it is flagged warning, naming
   the failed deployment.
2. **Given** a project whose most recent production deployment succeeded,
   **When** the operator views it, **Then** it is marked safe.
3. **Given** a project with no production deployment at all yet, **When**
   the operator views it, **Then** it is flagged warning — a project with
   nothing live is worth surfacing, not silently treated as safe.

---

### User Story 4 - Get notified when Pages posture drifts, without opening the panel (Priority: P2)

The same evaluation that powers the interactive inventory also runs on the
existing shared scheduled audit (constitution Principle III, joining
Modules 1-3's scheduled evaluation rather than adding a new Cron Trigger).
When a custom domain newly leaves the active state, a `pages.dev`
subdomain newly becomes exposed or open, or a production deployment newly
fails, the operator is alerted without having opened FlareTower.

**Why this priority**: Same "drift between visits" rationale as every
other module's User Story 4. An Access application accidentally removed
from a `pages.dev` subdomain, or a custom domain that silently drops out
of the active state, both accumulate silently otherwise.

**Independent Test**: Can be fully tested by running the scheduled scan
against a test account, then removing Access coverage from a test
project's `pages.dev` subdomain between two scheduled runs, and confirming
an alert fires after the run that observes it.

**Acceptance Scenarios**:

1. **Given** the scheduled scan previously found no flagged domains,
   exposed subdomains, or failed deployments, **When** any of those newly
   occurs before the next scheduled run, **Then** an alert is raised after
   that run completes.
2. **Given** a finding was already flagged on the previous run and remains
   in the same state, **When** the run completes, **Then** the operator is
   not re-alerted for the same still-flagged item on every run.
3. **Given** the scheduled scan cannot evaluate part of the account (e.g.
   an API error), **When** the run completes, **Then** that failure is
   itself surfaced, not silently treated as "nothing new."

---

### Edge Cases

- What happens when a project has multiple custom domains in different
  states? Each domain is evaluated and reported independently, mirroring
  Module 1's rule that hostnames on the same Worker never share or
  influence each other's status.
- What happens when the `pages.dev` subdomain is covered by more than one
  Access application (e.g. one scoped, one open)? Matching Module 1's
  established rule, any covering application that is effectively open is
  enough to flag the subdomain as warning, regardless of other, more
  restrictive covering applications.
- What happens when a project has never had any deployment at all (newly
  created, empty)? It is still inventoried; its production status is
  treated the same as "no production deployment" (User Story 3, Acceptance
  Scenario 3).
- What happens when the account has zero Pages projects? The inventory
  shows an empty (not omitted, not errored) result.
- What happens the very first time the scheduled scan runs? Every
  critical/warning finding from that first run must still trigger an
  alert — no grace period, same as every other module's equivalent edge
  case.
- What happens when the configured API token lacks sufficient scope to
  list Pages projects, their domains, or their deployments? Those items
  are shown as "not fully evaluated," never silently omitted or presented
  as safe.
- What happens to a preview deployment's own individual status (as opposed
  to the project-wide `pages.dev` subdomain check)? Per-preview-deployment
  auditing (e.g. each preview URL's individual age or build status) is not
  required scope for this spec — the `pages.dev` subdomain check in User
  Story 2 covers the shared exposure surface all preview deployments sit
  behind; auditing individual preview deployments is reasonable future
  scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enumerate every Pages project in the account,
  and MUST list each project's custom domains.
- **FR-002**: System MUST present the full inventory of projects and their
  custom domains in a single view, with every project represented exactly
  once.
- **FR-003**: System MUST mark a custom domain as flagged when it is not
  in a fully active, verified, serving state, and MUST mark it safe when
  it is.
- **FR-004**: System MUST determine, for every project's `<project>.pages.dev`
  subdomain, whether it is covered by an Access application, using the
  same hostname-coverage logic already established in Module 1.
- **FR-005**: System MUST mark a project's `pages.dev` subdomain critical
  when no Access application covers it.
- **FR-006**: System MUST mark a project's `pages.dev` subdomain warning
  when it is covered by an Access application but that application's
  policy grants access to Everyone, bypasses identity verification, or the
  application has zero policies attached — using the same
  policy-openness logic already established in Modules 1 and 3.
- **FR-007**: System MUST mark a project's `pages.dev` subdomain safe when
  it is covered by an Access application whose policy meaningfully
  restricts access.
- **FR-008**: System MUST determine, for every project, whether its most
  recent production-environment deployment succeeded or failed, and MUST
  flag the project warning when it failed or when no production
  deployment exists yet.
- **FR-009**: System MUST evaluate custom domains, `pages.dev` exposure,
  and production deployment health using the same logic in both the
  on-demand interactive view and the existing shared recurring scheduled
  run (constitution Principle III), with no divergence between the two.
- **FR-010**: System MUST alert when the scheduled run finds a custom
  domain, `pages.dev` subdomain, or production deployment newly in a
  flagged state that was not flagged on the previous run.
- **FR-011**: System MUST NOT re-alert on every scheduled run for a
  finding whose flagged state is unchanged from the previous run.
- **FR-012**: System MUST require the operator to be authenticated before
  viewing any Pages data.
- **FR-013**: System MUST clearly indicate, per project, custom domain, or
  `pages.dev` subdomain check, when it could not be fully evaluated (e.g.
  insufficient token scope, an API error), and MUST NOT present an
  unevaluated item as safe.
- **FR-014**: System MUST NOT modify any Pages project, deployment, custom
  domain, or other Cloudflare account configuration as part of this
  feature — this module is detection-only; configuration mutation and
  triggering new deployments are out of scope for this spec.

### Key Entities

- **Pages Project**: A Cloudflare Pages project — name, its `pages.dev`
  subdomain, its custom domains, its most recent production deployment
  status.
- **Custom Domain**: A domain attached to a Pages project — hostname,
  activation/verification status.
- **Production Deployment**: The most recent deployment to a project's
  production environment — outcome (success/failure), or absence if none
  exists yet.
- **Pages Finding**: The evaluated state of one custom domain or one
  `pages.dev` subdomain-and-deployment-health check at a point in time —
  safe, warning, critical, or not evaluated — per the product's
  established status semantics (shared across all modules).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can see every Pages project and every one of its
  custom domains within one minute of opening the panel.
- **SC-002**: 100% of Pages projects and custom domains appear in the
  inventory — zero silent omissions.
- **SC-003**: A `pages.dev` subdomain that becomes exposed (uncovered or
  covered by an open policy) is detected and alerted on within one
  scheduled scan cycle, with no operator action required.
- **SC-004**: An operator can distinguish, for every project, custom
  domain, and `pages.dev` exposure check, "confirmed safe," "confirmed
  flagged," and "not fully evaluated" — zero items left ambiguous.
- **SC-005**: Across repeated scheduled runs with no underlying change,
  the operator receives zero duplicate alerts for the same unchanged
  finding.

## Assumptions

- The Cloudflare API token configured for FlareTower has, at minimum,
  read-only access to Pages projects, their domains, and their
  deployments, in addition to the Access application read scope Modules 1
  and 3 already require. Per the project constitution, this module
  requires read-only scope only.
- The `pages.dev` subdomain exposure check (User Story 2) reuses the exact
  hostname-coverage and policy-openness decision logic already built for
  Module 1 and Module 3 — this module does not redefine what "covered" or
  "effectively open" means, only applies the existing definition to a new
  hostname source.
- Auditing individual preview deployments (their age, build status, or
  per-deployment access) beyond the shared `pages.dev` exposure check is
  reasonable future scope, not required for this module's first shippable
  increment — mirrors how Module 1 shipped Worker-hostname detection
  before any mutation capability, and how Module 3 shipped policy/token
  detection before a groups-management view.
- How an alert reaches the operator is out of scope for this spec,
  consistent with every other module's Assumptions.
- Historical drift tracking belongs to the future Audit & Drift module
  (constitution §2 item 7) and is out of scope here.
- No Cloudflare API scopes beyond Pages/deployment read access and the
  already-established Access read access are requested for this module;
  mutation capability (e.g. one-click Access gating, redeploying a failed
  build) is explicitly future scope.
