# Phase 0 Research: Pages Dashboard

## 1. Production branch and build recency — already in existing fetches

**Decision**: Cloudflare's Pages project object (`GET /accounts/{id}/pages/projects`, already
fetched by `listPagesProjects()`) carries `production_branch`; the deployment object (`GET
/accounts/{id}/pages/projects/{name}/deployments?env=production`, already fetched by
`listProjectProductionDeployment()`) carries `created_on`. Neither is captured today — this spec
threads both through unchanged, no new Cloudflare API call.

**Rationale**: Same reasoning as spec 013's TTL addition and spec 014's `session_duration`/`app_name`
additions — the data is already in a response this module already parses, just not read yet.

## 2. "Production domain" — derived, not new data

**Decision**: The table's Production domain column shows the first of a project's already-evaluated
custom domains whose status is `safe` (active), or an explicit "none" state if the project has zero
active custom domains. Computed at the API-response-assembly layer (`GET /api/pages/inventory`) from
data `evaluateCustomDomains()` already produces — no change to `evaluateCustomDomain()` itself.

**Rationale**: A project can have more than one custom domain; the design shows exactly one per row.
Picking the first *active* one (rather than just the first in list order) avoids showing a domain
that's actually pending/deactivated/errored as if it were the live production domain.

## 3. Health status — reused unchanged, no second taxonomy

**Decision**: The row's Health pill is exactly `evaluateSubdomainExposure()`'s existing
safe/warning/critical/not_evaluated result, rendered via the same `ExposureStatusBadge` every other
module's table already uses. The design mockup's second "Access" pill (mockup-only label text like
"PUBLIC BY DESIGN"/"NO POLICY") is not built as a second column or a second status system — its
information is already present in `evaluateSubdomainExposure()`'s own `reason` text (e.g. "covered by
Access application(s): platform-core", "no Access application covers this hostname"), shown in the
row's existing Reason column.

**Rationale**: Matches specs 012-014's own established precedent — reuse this project's existing
status vocabulary, never introduce a bespoke per-page taxonomy just because a mockup shows one.
Deployment-health and custom-domain-status findings (the other two checks this module evaluates)
remain available via their own existing endpoints/tables; they're just no longer surfaced as separate
table rows on this page — the row's Health pill is specifically the exposure check, matching what the
design's own footer count ("1 critical · 1 warning") reflects.

## 4. Build duration — out of scope

**Decision**: The mockup's build-duration note (e.g. "41s", "1m 12s") is not implemented.

**Rationale**: Requires parsing per-stage `started_on`/`ended_on` timing data for a purely
decorative detail — build status + recency + exposure health already make the row fully actionable
without it. Consistent with this rollout's established pattern of trimming decorative mockup detail
when it would add disproportionate complexity for low real value (e.g. spec 013's DMARC-missing-record
warning was similarly scoped out).

## 5. No new D1 columns needed beyond two small additions

**Decision**: Add `production_branch TEXT` to the existing `pages_subdomain_findings` table (the one
project-level, one-row-per-project table in this module) and `created_at TEXT` to
`pages_deployment_findings` (co-located with the deployment status it describes). "Production domain"
needs no new column at all — it's derived at read time from the existing `pages_domain_findings` rows
already returned in the same `GET /inventory` response.

**Rationale**: Minimal schema change — both new fields are project/deployment-level attributes that
map cleanly onto existing one-row-per-project(-deployment) tables, avoiding a new table entirely.
