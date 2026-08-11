# Research: Workers & Access Exposure

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-07

This resolves every `NEEDS CLARIFICATION` in `plan.md`'s Technical Context by grounding each
decision in official Cloudflare documentation (developers.cloudflare.com, fetched live via the
Cloudflare docs search tool) rather than assumption.

## 1. HTTP routing inside the Worker

**Decision**: Use [Hono](https://hono.dev) (pulled via Deno's `npm:` specifier, declared in
`deno.json`'s import map) for the `/api/*` router.

**Rationale**: Hono is small, has first-class Cloudflare Workers support, and avoids hand-rolled
URL/method matching that gets unwieldy once modules 2–7 land on the same Worker (constitution §2).
It adds negligible dependency weight and is pulled the same way any other npm package would be per
Principle IV — no `package.json` required.

**Alternatives considered**: Raw `URL`/`switch` routing in the `fetch` handler — rejected because it
already strains for module 1's ~4 endpoints and would need reworking the moment module 2 adds its
own routes; better to establish the pattern now than migrate later.

## 2. Access JWT validation

**Decision**: Validate `Cf-Access-Jwt-Assertion` using the
[`jose`](https://www.npmjs.com/package/jose) npm package's `createRemoteJWKSet` + `jwtVerify`,
exactly as documented in Cloudflare's own
"[One-click Cloudflare Access for Workers](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/)"
guide:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));
const { payload } = await jwtVerify(token, JWKS, {
  issuer: env.TEAM_DOMAIN,
  audience: env.POLICY_AUD,
});
```

`TEAM_DOMAIN` (`https://<team>.cloudflareaccess.com`) and `POLICY_AUD` (the Access application's AUD
tag protecting FlareTower itself) are Worker environment variables — not secrets, since they
identify configuration, not credentials. Missing header, verification failure, issuer/audience
mismatch all return `403` immediately (constitution Principle II, fail closed) — no degraded path.

**Rationale**: This is Cloudflare's own documented, maintained pattern — not a bespoke
implementation. Consistent with Principle I (no bespoke IdP code): `jose` only verifies signatures
against Access's published JWKS, it does not talk to any IdP.

**Alternatives considered**: Hand-rolled Web Crypto JWT verification (no external dependency) —
rejected; reimplementing JWKS-fetching, key rotation handling, and JWT parsing correctly is exactly
the kind of security-critical code Principle I's "don't build bespoke auth" spirit warns against,
even though this specific case isn't literally an IdP integration.

## 3. Talking to the Cloudflare account being audited

**Decision**: Plain `fetch()` calls to `api.cloudflare.com/client/v4/...` with small typed helper
functions per endpoint, authenticated with the Worker-secret-stored account API token (constitution
Principle VIII).

Endpoints needed for this module, all read-only:

| Purpose                                                      | Endpoint                                                             | Token permission                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------- |
| List Worker scripts                                          | `GET /accounts/{account_id}/workers/scripts`                         | `Workers Scripts Read`           |
| List Worker custom domains                                   | `GET /accounts/{account_id}/workers/domains`                         | `Workers Scripts Read`           |
| List Worker routes (per zone) — **out of scope, not called** | `GET /zones/{zone_id}/workers/routes`                                | `Workers Routes Read`            |
| Per-script `workers.dev` / Preview URL status                | `GET /accounts/{account_id}/workers/scripts/{name}/subdomain`        | `Workers Scripts Read`           |
| List Access applications                                     | `GET /accounts/{account_id}/access/apps`                             | `Access: Apps and Policies Read` |
| Access application policies                                  | included in the app object / `GET .../access/apps/{app_id}/policies` | `Access: Apps and Policies Read` |

**Rationale**: The module's entire read surface is ~5 endpoint shapes. A typed `cloudflare` SDK
dependency (the official TypeScript client) is comprehensive but heavy for this; plain `fetch()`
keeps the dependency footprint minimal, consistent with "start read-only, add only what's needed"
(Principle VIII). Exact request/response field names are pinned during implementation against the
live API — this table is the confirmed shape/permission mapping, not exhaustive schema
documentation.

**Scope note (added during convergence, 2026-08-12)**: legacy zone-bound Worker Routes are
deliberately **not** implemented, despite appearing in this table and in `plan.md`'s Project
Structure section. Routes are per-zone (`GET /zones/{zone_id}/workers/routes`), so covering them
requires first enumerating every zone on the account, then a route-pattern → hostname extraction
step that Custom Domains don't need (a route is a URL pattern like `example.com/api/*`, not a bare
hostname) — meaningfully more than the account-level _list_ endpoints this design implication
(below) already narrows the module to. Surfacing routed Workers as their own exposure surface would
also need a new `hostname_kind` value, which means altering `exposure_findings`'s
`CHECK (hostname_kind IN (...))` constraint — a new D1 migration, not a mechanical fix.
`README.md`'s token-scope table already reflected this narrowing (`Workers Routes Read` marked
"reserved... not used"); this note brings `research.md` and `plan.md` into agreement with that,
rather than implementing Routes support in this pass. Revisit as its own scoped feature if a Worker
reachable only via a legacy Route becomes a real gap in practice.

**Alternatives considered**: Official `cloudflare` npm SDK — revisit once later modules (DNS, Pages,
R2/KV/D1, security posture) multiply the number of endpoints called; the maintenance cost of typed
helpers may stop paying off at that point.

## 4. Rate limits and pagination budget

**Decision**: The exposure evaluation must stay well under Cloudflare's global API rate limit —
**1,200 requests per 5 minutes per token, cumulative across all uses of that token** (dashboard, API
key, or token) — per
[API rate limits](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/limits/).
Exceeding it returns `429` for the next 5 minutes account-wide, which would break both the
interactive view and the scheduled audit simultaneously.

Design implication: fetch Worker scripts, custom domains, and Access applications each via their
account-level _list_ endpoints (paginated as needed) rather than issuing one request per Worker —
for the founding "10–15 Workers" scale this is a handful of requests per audit run either way, but
the list-first approach keeps the module correct as account size grows well beyond that.

**Rationale**: FR-011 requires surfacing "not fully evaluated" rather than silently treating
unevaluated items as safe — a `429` mid-audit is exactly the case that requirement exists for. The
audit logic must catch API errors (including rate-limit responses) per-resource and mark affected
items accordingly instead of aborting the whole run.

## 5. Worker CPU time / subrequest budget for the scheduled audit

**Decision**: Set `limits.cpu_ms` explicitly (a modest raised value, e.g. `50000`) rather than
relying on the unconfigured default, and do not opt into the full 5-minute ceiling.

Confirmed platform numbers
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)):

- CPU time is active compute only — time spent waiting on `fetch()` calls to the Cloudflare API does
  **not** count against it.
- Default CPU time per Cron Trigger invocation: 30 seconds (paid, <1 hour interval) — ample for an
  I/O-bound audit.
- Subrequests: 10,000 per invocation by default on paid plans (up from a 1,000/50 legacy limit),
  independently raisable via `limits.subrequests` if a very large account ever needs it.

**Rationale**: This module's workload is dominated by waiting on Cloudflare API responses, not
computation — CPU time is very unlikely to be the constraint. Explicit (but modest) `limits.cpu_ms`
is cheap insurance against the evaluation logic itself (JSON parsing, policy-openness checks)
growing more expensive later, without prematurely opting into 5-minute CPU budgets the module
doesn't need.

## 6. Static assets / SPA serving

**Decision**: Cloudflare Workers static assets binding, per
[Static Assets](https://developers.cloudflare.com/workers/static-assets/) and
[React framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/):

```jsonc
{
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  }
}
```

In the `fetch` handler: requests to `/api/*` go to the Hono router; anything else falls through to
`env.ASSETS.fetch(request)`, with `not_found_handling: "single-page-application"` so client-side
routes (e.g. deep-linking into the exposure inventory) resolve to `index.html` instead of 404ing.

**Rationale**: This is Cloudflare's documented, first-class pattern for exactly this shape of app
(Worker API + React SPA in one deployable) — matches constitution §3's "`fetch` handler serves the
React SPA... and the `/api/*` JSON API" requirement directly.

## 7. Build tooling (React SPA) under the Deno-only constraint

**Decision**: Vite + `@cloudflare/vite-plugin`, invoked via Deno's `npm:` specifier / `deno task`,
per Cloudflare's own recommended toolchain for Workers + static assets + React.

**Open risk carried into implementation** (constitution §5's explicitly flagged friction point):
Vite, Wrangler, and Playwright are npm-native tooling with no first-class Deno distribution. This
research phase confirms they are the _correct, documented_ choices — it does not yet confirm they
run cleanly end-to-end via `npm:` specifiers without Deno or one of these tools generating a
`package.json` behind the back. **This must be the first thing validated in `tasks.md`**, before any
feature code is written: if any of the three forces a `package.json` into existence, that has to be
surfaced and a workaround chosen (per constitution §5) rather than silently accepted.

**Alternatives considered**: None seriously — these are the Cloudflare-documented, standard tools
for this exact stack; the open question is Deno compatibility, not which tool to use.

## 8. Testing tools

**Decision**:

- `deno test` for pure-logic unit tests — primarily the exposure evaluation function (hostname →
  safe/warning/critical/not-evaluated), which is designed as a pure function of (Worker, domains,
  routes, Access apps) input so both the `fetch`-triggered interactive path and the `scheduled` path
  can share it (constitution Principle III) and so it's trivially testable without any network or D1
  dependency.
- Playwright (via `npm:` specifier) for the user-facing flows from the spec: viewing the inventory,
  seeing the critical/warning/safe distinction render correctly, and (once auth scaffolding exists)
  the Access-gated access itself.

**Rationale**: Directly required by constitution Principle VI.

## 9. Persisting exposure state for new-vs-repeat alerting

**Decision**: A module-owned D1 table (see `data-model.md`) storing the last known state per
hostname, written by the shared evaluation module regardless of which entry point (`fetch` or
`scheduled`) triggered the run. The scheduled run diffs its findings against this table to decide
FR-008 (alert on new critical/warning) vs. FR-009 (don't repeat-alert on unchanged state).

**Rationale**: SC-005 ("zero duplicate alerts for the same unchanged finding") is impossible without
persisting the previous run's result somewhere; D1 is the constitution-mandated datastore for
exactly this kind of state.

## 10. Alert delivery channel

**Decision**: Out of scope for this module's contracts, per the spec's own Assumptions section. The
scheduled run's job is to detect and durably record an alert-worthy transition (in the same D1 table
from §9, with an `alerted_at` timestamp). The interactive UI surfaces unacknowledged alerts. Actual
push notification (email, Slack, etc.) is a future module concern.

**Rationale**: Spec FR-008 requires detection, not delivery — inventing a notification channel here
would be scope creep beyond what `/speckit-specify` already decided was out of scope.
