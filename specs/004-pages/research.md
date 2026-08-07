# Research: Pages

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-08

Cross-cutting concerns (Access JWT validation, routing, static assets, D1
migration mechanics, rate limits, CPU/subrequest budgets, testing tools)
are settled in
[Module 1's research.md](../001-workers-access-exposure/research.md) and
not re-derived here.

## 1. Enumerating projects, custom domains, and deployments

**Decision**: Three Cloudflare API calls, confirmed against Cloudflare's
own API reference:

- `GET /accounts/{account_id}/pages/projects` — lists every project.
  Fields used: `name`, `subdomain` (the `<name>.pages.dev` host).
  **Note**: the project object's own `domains` field is a plain array of
  domain-name strings with no status — it is not sufficient for User
  Story 1's "is this domain active" check, so it is not used for that
  purpose.
- `GET /accounts/{account_id}/pages/projects/{project_name}/domains` —
  per-project custom domain list, one call per project. Fields used:
  `name`, `status` (`"initializing" | "pending" | "active" |
  "deactivated" | "blocked" | "error"`).
- `GET /accounts/{account_id}/pages/projects/{project_name}/deployments?env=production`
  — per-project, filtered server-side to the production environment.
  Fields used: `id`, `latest_stage.status`
  (`"success" | "idle" | "active" | "failure" | "canceled"`). The list is
  ordered newest-first; index `0` (if present) is "the most recent
  production deployment" per spec User Story 3. An empty result means "no
  production deployment exists yet" (spec Acceptance Scenario 3).

**Rationale**: Same plain-`fetch()` approach as every prior module. The
per-project domains/deployments calls mean two extra requests per project
(documented in `plan.md`'s Constraints as N projects → up to 1 + 2N
calls) — acceptable at the expected single-account scale; Cloudflare does
not expose an account-wide "all domains" or "all deployments" endpoint,
so per-project calls are the only option.

## 2. `pages.dev` exposure evaluation — reuse the decision logic, not the code

**Decision**: Fetch `GET /accounts/{account_id}/access/apps` (the same
endpoint Modules 1 and 3 already call) independently within this module's
own `inventory.ts`, and re-implement the hostname-coverage
(`hostnameCoveredByAppDomain`) and policy-openness
(`isPolicyEffectivelyOpen`/`isAppOpenOrUnconfigured`) decision logic
Module 1 established as this module's own local functions, applied to
each project's `<name>.pages.dev` hostname — exactly Module 3's precedent
(research.md §2 there), not a new pattern.

**Rationale**: Consistent with the existing "duplication beats premature
cross-module coupling" decision already made once for Module 3 — the
alternative (importing Module 1's internals, or having this module read
Module 3's already-fetched Access application list) would couple this
module's correctness and scheduled-run success to another module's
internal structure or fetch timing, which Principle III's
independently-failable `waitUntil` design specifically avoids. Duplicating
~15 lines of well-tested decision logic, and one more `access/apps` fetch
per scheduled run, is the accepted cost.

## 3. Data model — three finding/alert table pairs, not one or two

**Decision**: Three new D1 table pairs:

- `pages_domain_findings`/`pages_domain_alerts` — one row per (project,
  custom domain) pair.
- `pages_subdomain_findings`/`pages_subdomain_alerts` — one row per
  project, the `pages.dev` exposure check.
- `pages_deployment_findings`/`pages_deployment_alerts` — one row per
  project, the production-deployment-health check.

**Rationale**: Custom domains clearly need their own identity space
(keyed by project + domain name, mirroring Module 3's per-entity-type
split). The remaining question was whether `pages.dev` exposure and
deployment health — which share the same identity key (project name) —
should be merged into one combined per-project row. **Rejected**: a
merged row would need a single combined status (the worse of the two
checks) and would blur alert diffing — e.g. if exposure is already
critical and stays critical while deployment health independently flips
from safe to warning on the same run, a combined-status diff would see no
change at the row level and silently swallow the deployment alert (spec
User Story 4, Acceptance Scenario 1 requires each newly-flagged signal to
alert independently). Two separate project-keyed tables avoid this failure
mode at the cost of one more table pair than the minimum — the same
trade-off Module 3 already accepted for apps vs. tokens.

## 4. Shared evaluation module shape

**Decision**: Same shape as every prior module —
`evaluateCustomDomain(domain)`, `evaluateSubdomainExposure(project, apps)`,
and `evaluateDeployment(deployment)` pure functions, all called by `fetch`
(`POST /api/pages/evaluate`) and the existing shared `scheduled` handler
(constitution Principle III, joining Modules 1-3's independent
`waitUntil` calls with a fourth).

## 5. Token scope summary for this module

| Purpose | Scope |
|---|---|
| List Pages projects, domains, deployments | `Cloudflare Pages Read` (new) |
| List Access applications + policies (for `pages.dev` exposure) | `Access: Apps and Policies Read` (already granted for Modules 1 and 3) |

Only one net-new scope beyond what Modules 1 and 3 already established,
read-only, consistent with constitution Principle VIII.
