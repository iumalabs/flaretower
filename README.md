# FlareTower

Open-source control panel for Cloudflare — manage Workers, Access, DNS and
security settings from one place.

FlareTower is a self-hosted cockpit that runs as a single Cloudflare Worker.
It is never publicly accessible — see [Authentication](#authentication)
before deploying.

Read [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
first; it is the authoritative source for the project's principles,
architecture, and security requirements. This README covers day-to-day
setup and operation only.

## Status

Module 1 (**Workers & Access exposure**) and Module 2 (**DNS**) are
implemented — see
[`specs/001-workers-access-exposure/`](specs/001-workers-access-exposure/)
and [`specs/002-dns/`](specs/002-dns/) for their specs, plans, and tasks.
Everything else in the constitution's product scope (§2) is documented as
future work, not yet built.

## Prerequisites

- [Deno](https://deno.com) 2.9+. This project's only local toolchain — no
  `package.json`, no npm/pnpm/yarn as a package manager (constitution
  Principle IV).
- A Cloudflare account, with:
  - A Zero Trust / Access setup, and an Access application protecting
    FlareTower's own deployment.
  - An API token scoped per [Required API token scopes](#required-api-token-scopes)
    below.

## Setup

```sh
# Install dependencies (creates a local, gitignored node_modules/ — see
# deno.json's "nodeModulesDir": "auto"; Deno remains the only tool you run)
deno install

# Create the D1 database and wire its real ID into wrangler.jsonc
deno run -A npm:wrangler d1 create flaretower
# -> replace "REPLACE_WITH_REAL_D1_DATABASE_ID" in wrangler.jsonc with the
#    returned database_id

# Apply migrations
deno task db:migrations:apply:local   # for local dev
deno task db:migrations:apply:remote  # once deployed

# Configure secrets and vars
cp .dev.vars.example .dev.vars   # local dev only, gitignored
deno run -A npm:wrangler secret put CF_API_TOKEN
```

Fill in `wrangler.jsonc`'s `vars` block (`TEAM_DOMAIN`, `POLICY_AUD`,
`CF_ACCOUNT_ID`) and `.dev.vars` (`TEAM_DOMAIN`, `POLICY_AUD` for local dev)
with real values — see [Authentication](#authentication) for what they mean.

## Local development

```sh
deno task dev    # Worker + SPA, via the Cloudflare Vite plugin
deno task test        # deno test — unit tests
deno task test:e2e    # Playwright e2e (run `deno task test:e2e:install` once first)
deno task fmt          # deno fmt
deno task lint         # deno lint
```

## Authentication

FlareTower implements **no identity provider integration of its own** — no
OAuth flows, no password storage. Cloudflare Access is the only
authentication gate, in front of everything. Whichever IdP the operator has
configured in Zero Trust (Azure AD/Entra, Google Workspace, Okta, GitHub,
OTP, etc.), FlareTower's code is identical.

The Worker independently validates the `Cf-Access-Jwt-Assertion` JWT on
every `/api/*` request (defense in depth — Access should already block
unauthenticated traffic, but a misconfigured Access policy is a realistic
failure mode). Missing or invalid → `403`, always; there is no
degraded-but-permitted mode.

- `TEAM_DOMAIN` — `https://<your-team>.cloudflareaccess.com`
- `POLICY_AUD` — the AUD tag of the Access application protecting
  FlareTower itself (Zero Trust dashboard → Access → Applications → your
  app → Application Audience (AUD) Tag)

## Required API token scopes

Every module needs a **read-only** token — per constitution Principle
VIII, write scopes are added only when a module's mutation features
actually land, never ahead of need.

| Scope | Why | Module |
|---|---|---|
| `Workers Scripts Read` | List Workers, per-script `workers.dev`/Preview URL status | Module 1 |
| `Workers Routes Read` | (reserved — custom domains are read via the Scripts scope; kept for future route-level checks) | Module 1 |
| `Access: Apps and Policies Read` | List Access applications and their policies | Module 1 |
| `Zone Read` | List zones | Module 2 |
| `DNS Read` | List DNS records per zone | Module 2 |
| `Zone Security Center Insights` (read) | Dangling A/AAAA/CNAME record findings (Cloudflare's own Security Insights scan — not reimplemented; see [`specs/002-dns/research.md`](specs/002-dns/research.md#2-dangling-record-detection--use-cloudflares-own-security-insights-dont-reimplement-it)) | Module 2 |

Store the token only via `wrangler secret put CF_API_TOKEN` — never as a
`vars` entry in `wrangler.jsonc`, never accepted through the web UI at
request time.

## ⚠️ Required manual post-deploy step: restrict Preview URLs

`wrangler.jsonc` sets `"workers_dev": false` — FlareTower is never reachable
on a `*.workers.dev` production URL. `"preview_urls": true` stays enabled so
PR/branch builds can be reviewed, but **Preview URLs default to public** and
must be restricted manually. Wrangler cannot automate this step.

After the first deploy:

1. Cloudflare dashboard → **Workers & Pages** → the `flaretower` Worker →
   **Settings** → **Domains & Routes** → **Preview URLs** → **Enable
   Cloudflare Access**.
2. All Workers Preview URLs across the account share a single, reusable
   "Cloudflare Workers Preview URLs" Access policy — so this is configured
   **once per account**, not once per Worker.

Skipping this step leaves preview builds of FlareTower itself — a tool that
holds a credential capable of reading (and eventually writing) the entire
Cloudflare account — publicly reachable.

## Deployment

Native Cloudflare ↔ GitHub integration (Workers Builds). No custom CI
pipeline for deploys; GitHub Actions may run lint/test/typecheck as PR
gates, but does not deploy.
