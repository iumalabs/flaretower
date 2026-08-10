# Research: Audit & Drift

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-10

Cross-cutting concerns (Access JWT validation, routing, static assets,
rate limits, CPU/subrequest budgets, testing tools) are settled in
[Module 1's research.md](../001-workers-access-exposure/research.md)
and not re-derived here. D1 migration mechanics don't apply to this
module (§4).

## 1. No Cloudflare API calls

**Decision**: This module makes zero `fetch()` calls to
`api.cloudflare.com`. Every other module's `inventory.ts` fetches live
account state from Cloudflare; this module's only data source is the
Worker's own D1 database, which Modules 1-6 already populate on their
own schedules.

**Rationale**: The spec's entire scope is "aggregate what the other six
modules already know," not "learn anything new about the account." This
is confirmed directly by the constitution's one-line description for
this module (snapshot history, "what changed," scheduled scans with
alerting — all of which describe *presentation* of existing data, not
new detection).

## 2. The fourteen source table pairs — confirmed schema

**Decision**: Read directly from `worker/db/migrations/0002` through
`0007`. Every finding table has the identical trailing shape `status
TEXT NOT NULL, reason TEXT NOT NULL, evaluated_at TEXT NOT NULL, run_id
TEXT NOT NULL, run_trigger TEXT NOT NULL`, preceded by 1-4
module-specific entity-key columns. Every alert table has the identical
trailing shape `previous_status TEXT, new_status TEXT NOT NULL, run_id
TEXT NOT NULL, detected_at TEXT NOT NULL, acknowledged_at TEXT`, preceded
by the same entity-key columns as its finding-table counterpart.

Confirmed source registry (module, check kind, finding table, alert
table, entity-key columns, human label template):

| Module | Kind | Finding table | Alert table | Entity-key columns |
|---|---|---|---|---|
| exposure | hostname | `exposure_findings` | `exposure_alerts` | `worker_name`, `hostname`, `hostname_kind` |
| dns | record | `dns_findings` | `dns_alerts` | `zone_name`, `record_name`, `record_type` |
| zero-trust | application | `zt_app_findings` | `zt_app_alerts` | `app_id`, `app_domain` |
| zero-trust | service_token | `zt_token_findings` | `zt_token_alerts` | `token_id`, `token_name` |
| pages | domain | `pages_domain_findings` | `pages_domain_alerts` | `project_name`, `domain_name` |
| pages | subdomain | `pages_subdomain_findings` | `pages_subdomain_alerts` | `project_name`, `subdomain` |
| pages | deployment | `pages_deployment_findings` | `pages_deployment_alerts` | `project_name`, `deployment_id` |
| storage | r2_bucket | `r2_bucket_findings` | `r2_bucket_alerts` | `bucket_name` |
| storage | kv_namespace | `kv_namespace_findings` | `kv_namespace_alerts` | `namespace_id`, `title` |
| storage | d1_database | `d1_database_findings` | `d1_database_alerts` | `database_uuid`, `name` |
| security | ssl_tls | `ssl_tls_findings` | `ssl_tls_alerts` | `zone_id`, `zone_name` |
| security | dnssec | `dnssec_findings` | `dnssec_alerts` | `zone_id`, `zone_name` |
| security | waf | `waf_findings` | `waf_alerts` | `zone_id`, `zone_name` |
| security | rate_limiting | `rate_limiting_findings` | `rate_limiting_alerts` | `zone_id`, `zone_name` |

**Rationale**: This is the exact structural uniformity that justifies
`sources.ts`'s registry-plus-generic-query design (plan.md's Project
Structure).

## 3. SQL safety for a registry-driven, table-name-parameterized query

**Decision**: Table names (`exposure_findings`, `waf_alerts`, etc.) are
interpolated into SQL strings, but only ever from the fixed,
hard-coded registry in `sources.ts` — never from request input. This is
the exact same pattern already established and accepted in every prior
module's `POST /alerts/:kind/:id/acknowledge` endpoint (an
`ALERT_TABLE_BY_KIND` allowlist maps a request-supplied `:kind` string
to one of a fixed set of table names, and only a successful lookup
proceeds). `sources.ts`'s registry generalizes that same allowlist
pattern to fourteen entries instead of three or four.

## 4. No new D1 tables

**Decision**: The unified inbox and posture summary are computed live
on each request by querying the fourteen existing tables directly — no
new table stores a "unified alert" or "summary" of its own. The "what
changed" digest is likewise computed live: for each source, compare
each entity's latest finding against its most recent finding at or
before the requested cutoff (using each table's existing
`(entity-key, evaluated_at DESC)` index), rather than requiring a
separately materialized snapshot.

**Rationale**: Every prior module's migration exists because that
module owns a genuinely new evaluated outcome to persist. This module
evaluates nothing — it only re-presents outcomes the other six modules
already computed and stored. Introducing a new table to cache an
aggregation that's cheap to compute live (fourteen indexed D1 queries
per request, not fourteen external API calls) would be the kind of
premature optimization the constitution's "don't add complexity ahead
of need" spirit argues against. If digest computation cost ever becomes
a real problem at scale, materializing a daily snapshot is a clean,
backward-compatible future enhancement (spec Assumptions) — but it is
not required to ship a correct, useful first increment.

## 5. "What changed since" comparison semantics

**Decision**: For a requested window `[since, now]` (default `since` =
`now - 24h`), and for each of the fourteen sources independently:
1. Fetch every entity's latest finding (already the shape `GET
   /inventory` endpoints use).
2. For each such entity, fetch its most recent finding with
   `evaluated_at <= since` (one indexed query per entity, or a single
   query with a window function grouped by entity-key — implementation
   detail for `tasks.md`).
3. If no such prior finding exists, treat `previousStatus` as `null`
   (spec User Story 2, Acceptance Scenario 3 — a newly-observed entity
   still counts, no grace period, same principle as every module's own
   first-run alerting).
4. If a prior finding exists and its `status` differs from the latest
   finding's `status`, emit a Change Entry. If it matches, emit
   nothing.

**Rationale**: This mirrors the new-vs-repeat diffing semantics already
established by every prior module's `alerts.ts`, generalized from
"compare against the immediately previous run" to "compare against the
most recent run at or before an arbitrary point in time."

## 6. Token scope summary for this module

None. This module requests no new Cloudflare API token scopes — it
makes no Cloudflare API calls at all (research.md §1).
