# Research: Zero Trust / Access

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-07

Cross-cutting concerns (Access JWT validation, routing, static assets, D1
migration mechanics, rate limits, CPU/subrequest budgets, testing tools)
are settled in
[Module 1's research.md](../001-workers-access-exposure/research.md) and
not re-derived here.

## 1. Enumerating applications, policies, service tokens

**Decision**: `GET /accounts/{account_id}/access/apps` (account-wide, not
filtered to Worker-covering hostnames like Module 1's use of the same
endpoint) with policies read from the embedded `policies` field on each
app object — same assumption Module 1's `inventory.ts` already made and
that held up through that module's implementation. `GET
/accounts/{account_id}/access/service_tokens` for service tokens, fields
confirmed via Cloudflare's own service-token lifecycle docs: `id`, `name`,
`expires_at` (ISO 8601), `created_at`, `duration`.

**Rationale**: Same plain-`fetch()` approach as every prior module; the
read surface is two endpoints.

**Token scopes**: `Access: Apps and Policies Read` (apps + policies, same
scope Module 1 already uses — no new grant needed for that half),
`Access: Service Tokens Read` (confirmed as a real, distinct permission).

## 2. Policy-openness evaluation — reuse the decision logic, not the code

**Decision**: Re-implement the same decision logic Module 1's `evaluate.ts`
already established (`isPolicyEffectivelyOpen`/`isAppOpenOrUnconfigured`:
an "allow"-type policy targeting Everyone, or a "bypass" policy, or zero
policies at all, is open; a "deny" targeting Everyone is not) as this
module's own local function, rather than importing Module 1's module
internals.

**Rationale**: The two modules score different scopes (Module 1: policies
on apps that cover a Worker hostname; Module 3: every policy on every
app, account-wide) and evaluating account-wide correctness shouldn't
depend on Module 1's module remaining structured a particular way.
Duplicating ~15 lines of well-tested decision logic is cheaper and safer
than introducing a cross-module import for it — consistent with the "three
similar lines beats a premature abstraction" principle already applied
when Module 2 didn't share Module 1's `cfFetch` helper either.

## 3. Service token expiry evaluation

**Decision**: Compare `expires_at` against "now" (available via
`Date.now()`/the request's own clock — no external time source needed) and
a 14-day threshold (spec FR-007):
- `expires_at` in the past → critical.
- `expires_at` within 14 days → warning.
- No `expires_at` present on the record at all → warning (spec's
  "never expires" case). **Open note carried into `tasks.md`**: Cloudflare's
  documented service-token creation flow always requires a `duration`, so a
  token with no `expires_at` at all may not be producible through normal
  use — the check is still implemented defensively (never assume a field
  exists), but this specific branch may end up effectively unreachable in
  practice. Not a reason to skip it: cheap to keep, and correct if the API
  ever returns a token without one (e.g. an edge case Cloudflare's docs
  didn't cover, or a future token type).
- Otherwise → safe.

**Rationale**: Direct field comparison, no additional API calls needed
beyond the service-tokens list itself.

## 4. Shared evaluation module shape

**Decision**: Same shape as every prior module —
`evaluateApplication(app)` and `evaluateServiceToken(token)` pure
functions, both called by `fetch` (`POST /api/zero-trust/evaluate`) and
the existing shared `scheduled` handler (constitution Principle III,
joining Modules 1 and 2's independent `waitUntil` calls with a third).

## 5. Data model

**Decision**: Two new D1 table pairs, following the now-established
per-module pattern: `zt_app_findings`/`zt_app_alerts` for applications,
`zt_token_findings`/`zt_token_alerts` for service tokens — kept as two
separate finding tables (not one shared "zero trust findings" table)
because applications and service tokens have different identity shapes
(an app's identity is its `id`/domain; a token's is its `id`/`name`) and
different lifecycles; forcing them into one polymorphic table would need a
nullable-column discriminator design that doesn't pay for itself given how
cheap a fourth pair of tables is at this schema size.

## 6. Token scope summary for this module

| Purpose | Scope |
|---|---|
| List Access applications + policies | `Access: Apps and Policies Read` (already granted for Module 1) |
| List service tokens | `Access: Service Tokens Read` (new) |

Only one net-new scope beyond what Module 1 already established, both
read-only, consistent with constitution Principle VIII.
