# Phase 0 Research: Workers Dashboard

## 1. Source for per-Worker and account-wide operational metrics (requests, errors, CPU)

**Decision**: Use Cloudflare's GraphQL Analytics API (`POST /client/v4/graphql`, same base host and
Bearer-token auth as every other Cloudflare REST call this project already makes), querying the
account-scoped `workersInvocationsAdaptive` dataset filtered by `scriptName` and a `datetime_geq` /
`datetime_leq` window, requesting `sum { requests, errors }` and `quantiles { cpuTimeP50, cpuTimeP99 }`
per script for the trailing-24h window, plus a second query for the prior 24h window (for the
day-over-day request comparison FR-006 needs). This requires a new token scope, **Account Analytics
Read**, not currently in this project's README token-scope table — every other scope this project
holds is a narrow resource-read scope (Workers Scripts Read, DNS Read, etc.); this one is
account-wide analytics visibility, still read-only and still least-privilege-appropriate per
Principle VIII, but new and MUST be added to the README's token-scope table alongside every other
module's own additions.

**Rationale**: This is the same dataset Cloudflare's own Workers dashboard analytics tab reads from,
and it's the only Cloudflare API surface that exposes per-script request/error counts and CPU-time
percentiles — the per-script REST endpoints this project already uses (`/workers/scripts`,
`/workers/domains`, etc.) are inventory/configuration endpoints with no traffic data. Final field-name
verification against a live account happens at quickstart.md's end-to-end run, matching this
project's own established pattern (see workers-access-exposure/inventory.ts's own comment: "final
verification against a live account happens in T033").

**Alternatives considered**:

- **Skip real metrics, ship the inventory/exposure columns only**: rejected — this is spec.md's User
  Story 2, the module's headline new value over the existing generic findings table; shipping without
  it would just be a re-skin of data already visible on the Exposure page.
- **Cloudflare's legacy per-zone Analytics API (`/zones/{id}/analytics/dashboard`)**: rejected — that
  API is zone-scoped and HTTP-traffic-shaped (status codes, bandwidth), not script-scoped, and has no
  CPU-time dimension; Workers CPU time is only available via the GraphQL Analytics API's
  `workersInvocationsAdaptive`/`workersInvocationsAdaptiveGroups` datasets.

**Fallback if research at implementation time finds a gap**: if the day-over-day request comparison
or a specific quantile turns out not to be queryable as expected, show that one figure as "not
available" (FR-007's existing degradation rule already covers this) rather than blocking the rest of
the page — this is a graceful reduction in scope, not a blocker for the whole feature.

## 2. Environment classification (production vs. preview)

**Decision**: Derive "environment" per Worker from the hostname-kind data the Exposure module
(`workers-access-exposure/inventory.ts`) already fetches — a Worker is **production** if any of its
hostnames is an enabled custom domain or a "production" `workers.dev` hostname; it is **preview** if
its only active hostname(s) are Preview URLs. A Worker with hostnames of both kinds is shown as
production (a Worker actually serving a custom domain is operationally "production" regardless of
also having a preview alias active) — matching the design mockup's own example row
(`search-index · preview`, a script with no production-serving hostname active).

**Rationale**: Cloudflare's Workers Scripts API has no first-class "environment" field — "production"
vs. "preview" is a deployment-target concept (Wrangler environments, preview URLs), not a script
attribute. Reusing the hostname-kind classification the Exposure module already computes avoids a
second Cloudflare API round-trip and a second, potentially-divergent definition of "production."

**Alternatives considered**:

- **A new API call to detect Wrangler-style named environments**: rejected — Cloudflare's public API
  has no endpoint that reports a script's configured Wrangler environment name; the only observable,
  API-visible signal of "is this actually serving production traffic" is exactly the hostname data
  Module 1 already has.

## 3. "Recent changes" panel data source

**Decision**: Use Cloudflare's real Audit Logs API (`GET /accounts/{account_id}/audit_logs`), filtered
client-side (or via the API's own filter params, to be confirmed at implementation time) to entries
whose resource touches Workers (script deploys, route/domain bindings, Access-application bindings on
Worker routes). Requires a new token scope, **Audit Logs Read** — also new to this project's README
token-scope table.

**Rationale**: An early draft of this spec assumed this panel could reuse this project's own existing
Module 7/8 "Audit & Drift" mechanism (the `audit` module's `computeChanges()`/`AUDIT_SOURCES`
machinery). That assumption was wrong: that mechanism is a derived digest of FlareTower's own
finding-status transitions (e.g. "bucket X went from safe to critical between two evaluation runs"),
built entirely from this project's own D1 finding tables — it has no actor, no action verb, and no
knowledge of Cloudflare account mutations that don't change a tracked finding's status (e.g. "who
deployed this Worker" is invisible to it). The design mockup's own §14 "Audit log" section shows
exactly actor/action/target/result rows (`wrangler · deploy — Enabled workers.dev subdomain`,
`@ilse · dashboard — Bound route to Access application`) sourced from Cloudflare's real dashboard,
API, Wrangler, and Terraform actors — that is Cloudflare's own Audit Logs feature, a different API
this project does not yet integrate with at all.

**Consequence for sequencing**: Module 018 (Audit dashboard, §14 of the design) needs this exact same
Audit Logs integration as its own headline feature. Per constitution Principle III (single Worker,
shared audit logic), 018 MUST reuse the fetch/parse code this spec introduces rather than
re-implementing it — tracked as a note on that spec's own task entry.

**Alternatives considered**:

- **Reuse Module 7/8's existing digest, scoped to Workers-related finding tables**: rejected — this
  would show status-transition entries ("this Worker's exposure went from warning to critical"), not
  the actor/action entries the design shows, and would silently omit any Workers-relevant change that
  doesn't happen to move a tracked finding's status (most deploys, most route changes).
- **Skip this panel for spec 012, ship it only when 018 exists**: considered but rejected — the panel
  is explicit in the design for this exact page (§08), and User Story 3 is already P2 (independently
  droppable without blocking US1/US2's MVP) rather than blocking the whole spec; building the
  Audit-Logs integration here first and letting 018 reuse it is the more natural build order than the
  reverse, since this page is next in the queue.

## 4. Required new token scopes summary

Two new scopes beyond this project's existing README table, both read-only:

| Scope | Cloudflare API endpoint(s) | Why | Module |
| --- | --- | --- | --- |
| `Account Analytics Read` | `POST /client/v4/graphql` (`workersInvocationsAdaptive` dataset) | Per-Worker and account-wide request/error/CPU figures | Module 012 |
| `Audit Logs Read` | `GET /accounts/{id}/audit_logs` | Workers-scoped recent-changes panel | Module 012 (018 reuses) |

Both MUST be added to README's "Required API token scopes" table as part of this spec's Polish phase,
matching every prior module's own precedent for scope additions.
