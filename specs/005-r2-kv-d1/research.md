# Research: R2 / KV / D1

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-08

Cross-cutting concerns (Access JWT validation, routing, static assets, D1
migration mechanics, rate limits, CPU/subrequest budgets, testing tools)
are settled in
[Module 1's research.md](../001-workers-access-exposure/research.md) and
not re-derived here.

## 1. Enumerating R2 buckets and their public-access configuration

**Decision**: Confirmed against Cloudflare's own API reference:

- `GET /accounts/{account_id}/r2/buckets` — lists every bucket. Fields
  used: `name` only (the list response has no public-access fields at
  all).
- `GET /accounts/{account_id}/r2/buckets/{bucket_name}/domains/managed`
  — per-bucket, one call per bucket. Fields used: `enabled` (boolean) —
  whether the bucket's `r2.dev` domain is publicly reachable.
- `GET /accounts/{account_id}/r2/buckets/{bucket_name}/domains/custom` —
  per-bucket, one call per bucket. Fields used: `domains[].domain`,
  `domains[].enabled`. `domains[].status.ownership`/`.ssl` (activation
  detail) are read but not used for the exposure decision — an `enabled`
  custom domain is treated as intending public exposure regardless of
  activation state (spec Edge Cases: "domain activation health is not
  this module's concern").

**Rationale**: Same plain-`fetch()` approach as every prior module. Two
extra per-bucket requests, mirroring Module 4's per-project domain call.

## 2. Enumerating KV namespaces and D1 databases

**Decision**: `GET /accounts/{account_id}/storage/kv/namespaces` for KV
(fields used: `id`, `title`); `GET /accounts/{account_id}/d1/database`
for D1 (fields used: `uuid`, `name`). Both confirmed against Cloudflare's
API reference — neither list response includes any usage, size, or
binding information, which is why User Story 3's usage check requires a
separate cross-reference (research.md §3).

**Rationale**: Plain list calls, no per-item follow-up needed for the
inventory itself (unlike R2's per-bucket domain calls).

## 3. "Referenced by a deployed Worker" — Worker bindings cross-reference

**Decision**: `GET /accounts/{account_id}/workers/scripts` (the same
endpoint Module 1's `inventory.ts` already calls, fetched independently
here per the "duplication beats coupling" precedent) to get every
deployed script name, then
`GET /accounts/{account_id}/workers/scripts/{script_name}/bindings` per
script. Each binding has a `type` field; `type === "kv_namespace"`
carries a `namespace_id`, `type === "d1"` carries a database `id`. Build
two `Set<string>` — referenced KV namespace ids and referenced D1
database ids — from every script's bindings, then a namespace/database is
"used" iff its id/uuid is in the corresponding set.

**Rationale**: This is the only way to determine "unused" for a resource
type with no direct exposure signal (spec Assumptions) — Cloudflare does
not expose a reverse index ("which Workers bind namespace X"), so the
forward scan (every Worker → every binding) is the only option.

**Partial-failure handling**: if one script's bindings call fails, that
script simply can't positively confirm any resource — per spec Edge
Cases, this must not cause every namespace/database to be silently
treated as unused (a false-positive flood) nor as confirmed safe. The
chosen design: track which scripts' binding calls failed; a
namespace/database only becomes `not_evaluated` (instead of a confident
warning/safe) if it is not found referenced by any successfully-checked
script **and** at least one script's binding check failed — i.e. failure
only downgrades a would-be "unused" verdict to "unconfirmed," it never
downgrades an already-confirmed "used" verdict (a resource found in one
successfully-checked script's bindings is safe regardless of whether some
other unrelated script's bindings call also failed).

## 4. R2 bucket exposure evaluation — reuse the decision logic, not the code

**Decision**: Re-implement the same hostname-coverage
(`hostnameCoveredByAppDomain`) and policy-openness
(`isPolicyEffectivelyOpen`/`isAppOpenOrUnconfigured`) decision logic
Module 1 established and Module 4 already re-implemented once, as this
module's own local functions, applied to each bucket's enabled custom
domain(s). `r2.dev` exposure has no Access-coverage nuance — Access apps
protect zones/hostnames on the account, and the `r2.dev` domain is not
one of them, so `r2.dev` enabled is unconditionally critical (spec User
Story 2, Acceptance Scenario 1).

**Rationale**: Same "duplication beats premature cross-module coupling"
reasoning already applied twice (Module 3 for account-wide Access apps,
Module 4 for `pages.dev`). This module fetches its own independent copy
of the Access applications list (`GET /accounts/{account_id}/access/apps`),
same as Module 3 and Module 4 do, for the same
independently-failable-scheduled-evaluation reason (Principle III).

## 5. Data model — three finding/alert table pairs, one per resource type

**Decision**: `r2_bucket_findings`/`r2_bucket_alerts` (keyed by bucket
name), `kv_namespace_findings`/`kv_namespace_alerts` (keyed by namespace
id), `d1_database_findings`/`d1_database_alerts` (keyed by database
uuid).

**Rationale**: All three have genuinely distinct identity spaces (unlike
Module 4's `pages.dev`-exposure-vs-deployment-health split, which shared
one identity space and was kept separate only to avoid blurring alert
diffing) — this is the simpler, more directly-justified case of Module
3's original "different identity shapes, different lifecycles" rationale
for separate table pairs.

## 6. Shared evaluation module shape

**Decision**: Same shape as every prior module —
`evaluateBucketExposure(bucket, apps)`, `evaluateKvNamespaceUsage(namespace, referencedIds, allBindingsConfirmed)`,
and `evaluateD1DatabaseUsage(database, referencedIds, allBindingsConfirmed)`
pure functions, all called by `fetch` (`POST /api/storage/evaluate`) and
the existing shared `scheduled` handler (constitution Principle III,
joining Modules 1-4's independent `waitUntil` calls with a fifth).

## 7. Token scope summary for this module

| Purpose | Scope |
|---|---|
| List R2 buckets, their managed/custom domains | `Workers R2 Storage Read` (new) |
| List KV namespaces | `Workers KV Storage Read` (new) |
| List D1 databases | `D1 Read` (new) |
| List Worker scripts + their bindings (usage cross-reference) | `Workers Scripts Read` (already granted for Module 1) |
| List Access applications + policies (for R2 exposure) | `Access: Apps and Policies Read` (already granted for Modules 1, 3, 4) |

Three net-new scopes, all read-only, consistent with constitution
Principle VIII.
