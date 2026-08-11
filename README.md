# FlareTower

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

## Prerequisites

- [Deno](https://deno.com) 2.9+. This project's only local toolchain — no `package.json`, no
  npm/pnpm/yarn as a package manager (constitution Principle IV).
- A Cloudflare account, with:
  - A Zero Trust / Access setup, and an Access application protecting FlareTower's own deployment.
  - An API token scoped per [Required API token scopes](#required-api-token-scopes) below.

## Setup

FlareTower ships with two Wrangler environments, each with its own D1 database, so a preview build's
traffic can never touch production findings/alerts:

- **production** — `wrangler.jsonc`'s top-level config; deployed via `deno task deploy`
  (`wrangler deploy --env=""`); runs the hourly scheduled drift audit.
- **preview** — `wrangler.jsonc`'s `env.preview` block; deployed via `deno task deploy:preview`
  (`wrangler versions upload --env preview`, matching Workers Builds' own preview-branch deploy
  command); no scheduled drift audit (`triggers.crons` is empty), so preview builds don't run
  duplicate hourly scans against the same real Cloudflare account.

```sh
# Install dependencies (creates a local, gitignored node_modules/ — see
# deno.json's "nodeModulesDir": "auto"; Deno remains the only tool you run)
deno install

# Create both D1 databases and wire their real IDs into wrangler.jsonc
# (top-level d1_databases block for production, env.preview.d1_databases for preview)
deno run -A npm:wrangler d1 create flaretower-production
deno run -A npm:wrangler d1 create flaretower-preview

# Apply migrations to all four targets
deno task db:migrations:apply:local            # production binding, local sqlite (used by `deno task dev`)
deno task db:migrations:apply:remote           # production, remote
deno task db:migrations:apply:preview:local    # preview binding, local sqlite
deno task db:migrations:apply:preview:remote   # preview, remote

# Configure secrets and vars
cp .dev.vars.example .dev.vars   # local dev only, gitignored
deno run -A npm:wrangler secret put CF_API_TOKEN                  # production
deno run -A npm:wrangler secret put CF_API_TOKEN --env preview    # preview
```

Fill in `wrangler.jsonc`'s `vars` block **in both the top-level and `env.preview`** (`TEAM_DOMAIN`,
`POLICY_AUD`, `CF_ACCOUNT_ID`) and `.dev.vars` (`TEAM_DOMAIN`, `POLICY_AUD` for local dev) with real
values — see [Authentication](#authentication) for what they mean. The same Access application/token
normally protects both environments; use separate ones only if you specifically want preview builds
gated differently from production.

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

| Scope                                     | Why                                                                                                                                                                                                                                                                           | Module                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `Workers Scripts Read`                    | List Workers, per-script `workers.dev`/Preview URL status (Module 5: also lists every deployed Worker's bindings, to determine which KV namespaces/D1 databases are still referenced)                                                                                         | Module 1, Module 5                     |
| `Workers Routes Read`                     | (reserved — custom domains are read via the Scripts scope; kept for future route-level checks)                                                                                                                                                                                | Module 1                               |
| `Access: Apps and Policies Read`          | List Access applications and their policies (Module 1: Worker-hostname-linked apps; Module 3: every account-wide Access application; Module 4: checked against each Pages project's `pages.dev` subdomain; Module 5: checked against each R2 bucket's enabled custom domains) | Module 1, Module 3, Module 4, Module 5 |
| `Zone Read`                               | List zones                                                                                                                                                                                                                                                                    | Module 2, Module 6                     |
| `DNS Read`                                | List DNS records per zone                                                                                                                                                                                                                                                     | Module 2                               |
| `Zone Security Center Insights` (read)    | Dangling A/AAAA/CNAME record findings (Cloudflare's own Security Insights scan — not reimplemented; see [`specs/002-dns/research.md`](specs/002-dns/research.md#2-dangling-record-detection--use-cloudflares-own-security-insights-dont-reimplement-it))                      | Module 2                               |
| `Access: Service Tokens Read`             | List service tokens and their expiration dates                                                                                                                                                                                                                                | Module 3                               |
| `Cloudflare Pages Read`                   | List Pages projects, their custom domains, and their deployments                                                                                                                                                                                                              | Module 4                               |
| `Workers R2 Storage Read`                 | List R2 buckets and their `r2.dev`/custom domain public-access configuration                                                                                                                                                                                                  | Module 5                               |
| `Workers KV Storage Read`                 | List KV namespaces                                                                                                                                                                                                                                                            | Module 5                               |
| `D1 Read`                                 | List D1 databases                                                                                                                                                                                                                                                             | Module 5                               |
| `Zone Settings Read` ⚠️                   | Read a zone's SSL/TLS mode and DNSSEC status — **exact scope name not yet confirmed against a live token-creation screen, see [`specs/006-security-posture/research.md`](specs/006-security-posture/research.md#8-token-scope-summary-for-this-module)**                      | Module 6                               |
| `Zone WAF Read` / `Zone Rulesets Read` ⚠️ | Read a zone's WAF and rate-limiting ruleset entrypoints — **exact scope name(s), and whether WAF/rate-limiting share one scope, not yet confirmed; see research.md link above**                                                                                               | Module 6                               |
| `Turnstile Read`                          | List account Turnstile widgets                                                                                                                                                                                                                                                | Module 6                               |

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

Workers Builds needs its per-branch deploy commands set explicitly, since this project uses named
Wrangler environments (Setup, above) rather than the tool's zero-config default:

- **Production branch** (`main`) deploy command: `deno task deploy` (`wrangler deploy --env=""` —
  the top-level config, `flaretower-production`'s D1 binding).
- **Preview deploy command** (every other branch/PR): `deno task deploy:preview`
  (`wrangler versions upload --env preview` — `env.preview`, `flaretower-preview`'s D1 binding).

Configure both in the Cloudflare dashboard → **Workers & Pages** → the `flaretower` Worker →
**Settings** → **Build** → **Build configuration**, after connecting the GitHub repository.
