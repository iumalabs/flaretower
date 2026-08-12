# FlareTower

[![CI](https://github.com/iumalabs/flaretower/actions/workflows/ci.yml/badge.svg)](https://github.com/iumalabs/flaretower/actions/workflows/ci.yml)
[![E2E](https://github.com/iumalabs/flaretower/actions/workflows/e2e.yml/badge.svg)](https://github.com/iumalabs/flaretower/actions/workflows/e2e.yml)
[![License: AGPL v3](https://img.shields.io/github/license/iumalabs/flaretower)](LICENSE)
[![Open issues](https://img.shields.io/github/issues/iumalabs/flaretower)](https://github.com/iumalabs/flaretower/issues)
[![Last commit](https://img.shields.io/github/last-commit/iumalabs/flaretower)](https://github.com/iumalabs/flaretower/commits/main)

Open-source control panel for Cloudflare — manage Workers, Access, DNS and security settings from
one place.

FlareTower is a self-hosted cockpit that runs as a single Cloudflare Worker. It is never publicly
accessible — see [Authentication](#authentication) before deploying.

Read [`.specify/memory/constitution.md`](.specify/memory/constitution.md) first; it is the
authoritative source for the project's principles, architecture, and security requirements. This
README covers day-to-day setup and operation only.

## Status

Module 1 (**Workers & Access exposure**), Module 2 (**DNS**), Module 3 (**Zero Trust / Access**),
Module 4 (**Pages**), Module 5 (**R2 / KV / D1**), Module 6 (**Security Posture**), and Module 7
(**Audit & Drift**) are implemented — see
[`specs/001-workers-access-exposure/`](specs/001-workers-access-exposure/),
[`specs/002-dns/`](specs/002-dns/), [`specs/003-zero-trust/`](specs/003-zero-trust/),
[`specs/004-pages/`](specs/004-pages/), [`specs/005-r2-kv-d1/`](specs/005-r2-kv-d1/),
[`specs/006-security-posture/`](specs/006-security-posture/), and
[`specs/007-audit-drift/`](specs/007-audit-drift/) for their specs, plans, and tasks. This is every
module in the constitution's product scope (§2) — Module 7 requests no new Cloudflare API token
scopes: it's a pure read-only aggregation over the finding/alert tables Modules 1-6 already
populate, with no new Cloudflare API calls of its own (see
[`specs/007-audit-drift/research.md`](specs/007-audit-drift/research.md#4-no-new-d1-tables) §4).

Cross-cutting, alongside the 7 modules:
[**Identity, Authorization & Audit Data Model**](specs/008-identity-authorization/) — wires the
constitution-mandated `users`/`audit_log` baseline tables into behavior for the first time (operator
recognition, FlareTower-native `member`/`admin` roles gating the in-app acknowledge action, and a
write-capable `audit_log` mechanism ready for the first future Cloudflare-mutating module). See
[Identity & Roles](#identity--roles) below. No new Cloudflare API token scopes.

Also cross-cutting: [**Design System & App Shell Alignment**](specs/009-design-system-alignment/) —
aligns the whole app shell (sidebar, typography, tokens, shared `FindingsTable`/`AlertBanner`
components, a cross-module Overview page) to `docs/design.zip`'s visual language; and
[**Semantic Versioning & Version-Gated Production Releases**](specs/010-semver-releases/) — the
release process this milestone is named after (see [Releases](#releases) below). Both no new
Cloudflare API token scopes.

With Modules 1–7 plus both cross-cutting features above complete, this is FlareTower's v1.0
milestone. Everything past this point is genuinely new scope, not a remaining item from the original
roadmap.

Post-v1.0: [**Workers Dashboard**](specs/012-workers-dashboard/) — a dedicated, bespoke "Workers"
page (separate from the existing Exposure page) with real per-Worker and account-wide operational
metrics and a Workers-scoped recent-changes panel, following the design source's own expanded set of
per-module dashboard mockups. Adds two new token scopes (`Account Analytics Read`, `Audit Logs Read`
— see below); the same design update adds equivalent bespoke dashboards for the other 6 modules,
tracked as their own specs (013-018) in the same pattern.

## Prerequisites

- [Deno](https://deno.com) 2.9+. This project's only local toolchain — no `package.json`, no
  npm/pnpm/yarn as a package manager (constitution Principle IV).
- A Cloudflare account, with:
  - A Zero Trust / Access setup, and an Access application protecting FlareTower's own deployment.
  - An API token scoped per [Required API token scopes](#required-api-token-scopes) below.

## Setup

FlareTower ships with two **explicit, symmetric** Wrangler environments — `env.production` and
`env.preview` in `wrangler.jsonc` — each with its own D1 database, so a preview build's traffic can
never touch production findings/alerts. Both resolve to the **same** Cloudflare Worker resource
(`flaretower`) as different versions, not two separate resources — see [Deployment](#deployment) for
why that's the right shape here. Neither environment is an implicit "top-level config"; every
command below always names one explicitly via `--env`, which is also what Wrangler itself recommends
the moment it detects named environments but an ambiguous command.

- **production** — deployed via `deno task deploy` (`wrangler deploy --env production`); runs the
  hourly scheduled drift audit.
- **preview** — deployed via `deno task deploy:preview` (`wrangler versions upload --env preview`);
  no scheduled drift audit (`triggers.crons` is empty), so it doesn't run duplicate hourly scans
  against the same real Cloudflare account.

```sh
# Install dependencies (creates a local, gitignored node_modules/ — see
# deno.json's "nodeModulesDir": "auto"; Deno remains the only tool you run)
deno install

# Create both D1 databases and wire their real IDs into wrangler.jsonc
# (env.production.d1_databases for production, env.preview.d1_databases for preview)
deno run -A npm:wrangler d1 create flaretower-production
deno run -A npm:wrangler d1 create flaretower-preview

# Apply migrations to all four targets
deno task db:migrations:apply:local            # production binding, local sqlite
deno task db:migrations:apply:remote           # production, remote
deno task db:migrations:apply:preview:local    # preview binding, local sqlite (used by `deno task dev`)
deno task db:migrations:apply:preview:remote   # preview, remote

# Configure secrets and vars
cp .dev.vars.example .dev.vars   # local dev only, gitignored
deno run -A npm:wrangler secret put CF_API_TOKEN
```

**Set the secret with no `--env` flag** — `env.production` and `env.preview` are one shared Worker
resource (`flaretower`), so the secret is shared across both versions too. Do **not** run
`wrangler secret put CF_API_TOKEN --env production`: `wrangler secret`'s subcommands have a
[known bug](https://github.com/cloudflare/workers-sdk/issues/12300) where `--env` always appends an
env suffix to the resolved Worker name (unlike `deploy`/`versions upload`, which correctly respect a
shared `name`) — running it that way silently targets/creates a _different_, wrongly-named Worker
resource instead of setting the secret on `flaretower`.

Fill in `wrangler.jsonc`'s `vars` block **in both `env.production` and `env.preview`**
(`TEAM_DOMAIN`, `POLICY_AUD`, `CF_ACCOUNT_ID`) and `.dev.vars` (`TEAM_DOMAIN`, `POLICY_AUD` for
local dev) with real values — see [Authentication](#authentication) for what they mean.

Local dev (`deno task dev`, and Playwright's e2e webserver) targets the **preview** environment by
default, via the committed `.env.development` file (`CLOUDFLARE_ENV=preview` — not a secret, just
which Wrangler environment name to resolve; see
[Cloudflare's own docs on this mechanism](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/)).
Override per-invocation with `CLOUDFLARE_ENV=production deno task dev` if you specifically need to
run against production bindings locally.

## Local development

```sh
deno task dev    # Worker + SPA, via the Cloudflare Vite plugin
deno task test        # deno test — unit tests
deno task test:e2e    # Playwright e2e (run `deno task test:e2e:install` once first)
deno task fmt          # deno fmt
deno task lint         # deno lint
```

## Authentication

FlareTower implements **no identity provider integration of its own** — no OAuth flows, no password
storage. Cloudflare Access is the only authentication gate, in front of everything. Whichever IdP
the operator has configured in Zero Trust (Azure AD/Entra, Google Workspace, Okta, GitHub, OTP,
etc.), FlareTower's code is identical.

The Worker independently validates the `Cf-Access-Jwt-Assertion` JWT on every `/api/*` request
(defense in depth — Access should already block unauthenticated traffic, but a misconfigured Access
policy is a realistic failure mode). Missing or invalid → `403`, always; there is no
degraded-but-permitted mode.

- `TEAM_DOMAIN` — `https://<your-team>.cloudflareaccess.com`
- `POLICY_AUD` — the AUD tag of the Access application protecting FlareTower itself (Zero Trust
  dashboard → Access → Applications → your app → Application Audience (AUD) Tag)

## Identity & Roles

Cloudflare Access decides who can reach FlareTower at all; FlareTower has its own, independent
`member`/`admin` permission level that decides what a recognized operator can do once they're in
(constitution's Identity, Authorization & Audit Data Model section — see
[`specs/008-identity-authorization/`](specs/008-identity-authorization/)).

- **The first person to ever authenticate against a fresh deployment is automatically made `admin`**
  — no manual setup step. Every operator after that defaults to `member`.
- `member` can view every module's inventory, alerts, and the audit digest, but cannot acknowledge
  an alert.
- There is no admin UI for managing roles yet. An `admin` operator promotes or demotes another known
  operator via:

  ```sh
  curl -X POST https://<your-flaretower-domain>/api/identity/users/<their-sub>/role \
    -H "Content-Type: application/json" \
    -d '{"role": "admin"}'
  ```

  (through the browser, or any client carrying a valid Access session — the same
  `Cf-Access-Jwt-Assertion` gate as every other endpoint). `GET /api/identity/users` lists known
  operators and their `sub`s.

## Required API token scopes

Every module needs a **read-only** token — per constitution Principle VIII, write scopes are added
only when a module's mutation features actually land, never ahead of need.

The dashboard's permission-picker has been reorganized since parts of this table were first written
— if a name below doesn't match what you see, use the **Cloudflare API endpoint** column to search
the dashboard's own filter box instead of the scope name; the endpoint is the unambiguous, stable
identifier. Confirmed 2026-08-11 against Cloudflare's own API reference docs (sources linked per-row
where the name was previously uncertain).

| Scope                            | Cloudflare API endpoint(s) it must cover                                                                                                                            | Why                                                                                                                                                                                                                                                                                                                                                                                                                | Module                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `Workers Scripts Read`           | `GET /accounts/{id}/workers/scripts`, `.../workers/domains`, `.../workers/subdomain`, `.../workers/scripts/{name}/subdomain`, `.../workers/scripts/{name}/bindings` | List Workers, their Custom Domains (`.../workers/domains`), and per-script `workers.dev`/Preview URL status (Module 5: also lists every deployed Worker's bindings, to determine which KV namespaces/D1 databases are still referenced)                                                                                                                                                                            | Module 1, Module 5      |
| `Workers Routes Read`            | —                                                                                                                                                                   | (reserved — custom domains are read via the Scripts scope; kept for future route-level checks)                                                                                                                                                                                                                                                                                                                     | Module 1                |
| `Access: Apps and Policies Read` | `GET /accounts/{id}/access/apps`                                                                                                                                    | List Access applications and their policies (Module 1: Worker-hostname-linked apps; Module 3: every account-wide Access application; Module 4: checked against each Pages project's `pages.dev` subdomain; Module 5: checked against each R2 bucket's enabled custom domains)                                                                                                                                      | Module 1, 3, 4, 5       |
| `Zone Read`                      | `GET /zones?account.id={id}`                                                                                                                                        | List zones                                                                                                                                                                                                                                                                                                                                                                                                         | Module 2, Module 6      |
| `DNS Read`                       | `GET /zones/{id}/dns_records`, `GET /zones/{id}/dnssec`                                                                                                             | List DNS records per zone (Module 6: DNSSEC status shares this same scope — confirmed via [DNSSEC Details endpoint docs](https://developers.cloudflare.com/api/resources/dns/subresources/dnssec/methods/get/), not a separate scope)                                                                                                                                                                              | Module 2, Module 6      |
| `Account Security Insights`      | `GET /accounts/{id}/security-center/insights`                                                                                                                       | Dangling A/AAAA/CNAME record findings (Cloudflare's own Security Insights scan — not reimplemented; see [`specs/002-dns/research.md`](specs/002-dns/research.md#2-dangling-record-detection--use-cloudflares-own-security-insights-dont-reimplement-it)). Confirmed 2026-08-11 against the live dashboard's permission picker — account-level, under "App Security"                                                | Module 2                |
| `Access: Service Tokens Read`    | `GET /accounts/{id}/access/service_tokens`                                                                                                                          | List service tokens and their expiration dates                                                                                                                                                                                                                                                                                                                                                                     | Module 3                |
| `Cloudflare Pages Read`          | `GET /accounts/{id}/pages/projects`, `.../pages/projects/{name}/domains`, `.../pages/projects/{name}/deployments`                                                   | List Pages projects, their custom domains, and their deployments                                                                                                                                                                                                                                                                                                                                                   | Module 4                |
| `Workers R2 Storage Read`        | `GET /accounts/{id}/r2/buckets`, `.../r2/buckets/{name}/domains/managed`, `.../r2/buckets/{name}/domains/custom`                                                    | List R2 buckets and their `r2.dev`/custom domain public-access configuration                                                                                                                                                                                                                                                                                                                                       | Module 5                |
| `Workers KV Storage Read`        | `GET /accounts/{id}/storage/kv/namespaces`                                                                                                                          | List KV namespaces                                                                                                                                                                                                                                                                                                                                                                                                 | Module 5                |
| `D1 Read`                        | `GET /accounts/{id}/d1/database`                                                                                                                                    | List D1 databases                                                                                                                                                                                                                                                                                                                                                                                                  | Module 5                |
| `Zone SSL and Certificates`      | `GET /zones/{id}/settings/ssl`                                                                                                                                      | Read a zone's SSL/TLS encryption mode (Off/Flexible/Full/Strict). **Zone-scoped**, not the similarly-named `Account SSL & Certificates` (that one grants mTLS certificates/Certificate Store access instead — a different resource, ruled out during confirmation). Confirmed 2026-08-11 against the live dashboard's permission picker, description "Grants read access to SSL configuration and cert management" | Module 6                |
| `Zone WAF Read`                  | `GET /zones/{id}/rulesets/phases/http_request_firewall_managed/entrypoint`, `GET /zones/{id}/rulesets/phases/http_ratelimit/entrypoint`                             | Read a zone's WAF managed ruleset **and** rate-limiting ruleset entrypoints — confirmed both share this one scope (both go through the shared [Rulesets API](https://developers.cloudflare.com/ruleset-engine/rulesets-api/view/), whose "view" operations accept `Zone WAF Read`)                                                                                                                                 | Module 6                |
| `Turnstile Read`                 | `GET /accounts/{id}/challenges/widgets`                                                                                                                             | List account Turnstile widgets                                                                                                                                                                                                                                                                                                                                                                                     | Module 6                |
| `Account Analytics Read`         | `POST /client/v4/graphql` (`workersInvocationsAdaptive` dataset)                                                                                                    | Per-Worker and account-wide request/error/CPU-percentile figures for the Workers dashboard's metric cards and table columns (research.md §1 of specs/012-workers-dashboard) — read-only account-wide analytics visibility, no different in kind from every scope above, just broader in what it reads                                                                                                              | Module 012              |
| `Audit Logs Read`                | `GET /accounts/{id}/audit_logs`                                                                                                                                     | Workers-scoped "recent changes" panel, sourced from Cloudflare's real account change history — NOT this project's own Module 7/8 finding-status digest, a genuinely different data source (research.md §3 of specs/012-workers-dashboard). Module 018 (Audit dashboard) reuses this exact same integration rather than requesting a duplicate scope entry                                                          | Module 012 (018 reuses) |

Store the token only via `wrangler secret put CF_API_TOKEN` — never as a `vars` entry in
`wrangler.jsonc`, never accepted through the web UI at request time.

## ⚠️ Required manual post-deploy step: restrict Preview URLs

`wrangler.jsonc` sets `"workers_dev": false` — FlareTower is never reachable on a `*.workers.dev`
production URL. `"preview_urls": true` stays enabled so PR/branch builds can be reviewed, but
**Preview URLs default to public** and must be restricted manually. Wrangler cannot automate this
step.

After the first deploy:

1. Cloudflare dashboard → **Workers & Pages** → the `flaretower` Worker → **Settings** → **Domains &
   Routes** → **Preview URLs** → **Enable Cloudflare Access**.
2. All Workers Preview URLs across the account share a single, reusable "Cloudflare Workers Preview
   URLs" Access policy — so this is configured **once per account**, not once per Worker.

Skipping this step leaves preview builds of FlareTower itself — a tool that holds a credential
capable of reading (and eventually writing) the entire Cloudflare account — publicly reachable.

## Deployment

Native Cloudflare ↔ GitHub integration (Workers Builds). No custom CI pipeline for deploys; GitHub
Actions may run lint/test/typecheck as PR gates, but does not deploy.

**`env.production` and `env.preview` are one Cloudflare Worker resource (`flaretower`), not two** —
both environments share the same `name`, so they resolve to different _versions_ of the same
resource rather than separate resources. Worker versions carry their own bindings independently
(confirmed live 2026-08-11: a `wrangler versions upload --env preview` version genuinely gets
`flaretower-preview`'s D1, the promoted production version keeps `flaretower-production`'s), so
Cloudflare's native per-branch preview-URL mechanism just works with a single Workers Builds
connection — no second GitHub connection or second resource needed. (An earlier, incorrect version
of this setup gave each environment a distinct `name`, which does create two independent Worker
resources with no automatic preview linking between them — confirmed by deploying that way and
having to push a probe commit to prove neither triggered the other. Not what's wanted here.)

Production deploys are gated by release, not by every push — see [Releases](#releases) below for why
and how. Preview keeps deploying on every push/PR, unaffected.

Connect **once**: Cloudflare dashboard → **Workers & Pages** → `flaretower` → **Settings** →
**Build**, connect the GitHub repo, then set:

- **Production branch** (`release`, **not** `main`) deploy command: `deno task deploy`
  (`wrangler deploy --env
  production`).
- **Preview deploy command** (every other branch/PR): `deno task deploy:preview`
  (`wrangler
  versions upload --env preview`) — Workers Builds posts each PR's own preview URL as a
  PR comment automatically.

Build command for both: `deno task build`.

## Releases

FlareTower uses [semantic versioning](https://semver.org/) and
[Conventional Commits](https://www.conventionalcommits.org/)-driven, mostly-automated releases — see
`specs/010-semver-releases/` for the full design.

- [`release-please`](https://github.com/googleapis/release-please) proposes a standing release PR on
  every push to `main`, bumping `VERSION` and `CHANGELOG.md` from commit history (`fix:` → patch,
  `feat:` → minor; a MAJOR bump needs a deliberate maintainer action, never inferred automatically).
- **Ship a release by merging that PR yourself, whenever you're ready** — merging it is what cuts
  the actual git tag + GitHub Release. The same `release-please.yml` run that notices the merge also
  fast-forwards the `release` branch to match (a follow-up step in the same job, checking
  release-please-action's own outputs — not a separate workflow), which is what triggers the
  production deploy above. There's no separate automated/scheduled merge step, and no separate
  release-triggered workflow either: both were tried and both hit the same GitHub Actions
  anti-recursion protection (a `GITHUB_TOKEN`-authenticated push/release doesn't trigger other
  workflows), confirmed live. This project follows the same "propose, maintainer merges when ready"
  model as its sibling projects instead of provisioning a separate credential to work around that.
- The currently-running production version is shown in the app's own sidebar footer (baked in at
  build time from `VERSION`; local/preview builds show `self-hosted` with no version, since no real
  release applies there).
