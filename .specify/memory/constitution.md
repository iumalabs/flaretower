<!--
Sync Impact Report
==================
Version change: [TEMPLATE] → 1.0.0 (initial ratification)
Modified principles: n/a (first version — all principles newly defined)
Added sections:
  - Core Principles (I–X)
  - Product Scope & Module Roadmap
  - Identity, Authorization & Audit Data Model
  - Design System
  - Deployment & Operations
  - Governance
Removed sections: n/a
Templates requiring alignment:
  - .specify/templates/plan-template.md — ⚠ pending review (verify it references
    Constitution Check gates matching principles I–X)
  - .specify/templates/spec-template.md — ⚠ pending review (verify §2 module
    scope language does not contradict "first module only" build order)
  - .specify/templates/tasks-template.md — ⚠ pending review (verify task
    categories cover Deno/Playwright/D1 migration workflows)
Follow-up TODOs: none — all placeholders resolved from the founding brief.
-->

# FlareTower Constitution

## Core Principles

### I. Access Is the Only Gate; FlareTower Implements No Identity Provider
FlareTower MUST NOT implement, embed, or depend on any direct identity-provider
integration. No OAuth client flows, no `passport`-style adapters, no password
storage, no session cookies minted by the application itself. Cloudflare Access
is the single authentication boundary in front of the entire application,
across both the SPA and the `/api/*` surface. Access abstracts whichever IdP
the operator has configured in Zero Trust (Azure AD/Entra, Google Workspace,
Okta, GitHub, OTP, etc.); FlareTower's code MUST be identical regardless of
which IdP sits behind Access.
**Rationale**: FlareTower holds a credential capable of reading and mutating an
entire Cloudflare account. Any bespoke identity code is both an unnecessary
attack surface and a maintenance burden the project has no need to carry —
Access already solves this problem correctly for every supported IdP.

### II. Defense-in-Depth JWT Validation, Fail Closed
Every request to `/api/*` MUST be independently verified by the Worker, even
though Access should already have blocked unauthenticated traffic:
1. Extract the `Cf-Access-Jwt-Assertion` header.
2. Validate the JWT signature against the team JWKS at
   `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`.
3. Verify `issuer` (team domain) and `audience` (the Access application AUD
   tag) claims.
4. On any missing header, invalid signature, expired token, or
   issuer/audience mismatch, the Worker MUST return `403` and MUST NOT serve
   the request. There is no degraded-but-permitted mode.
The verified JWT `sub` and `email` claims are the only identity FlareTower
trusts for a request. Richer identity (IdP used, group membership, custom
claims) MAY be obtained by calling
`GET https://<team>.cloudflareaccess.com/cdn-cgi/access/get-identity` with the
user's Access cookie forwarded, but this call is an enrichment step, never a
substitute for JWT validation.
**Rationale**: A misconfigured Access policy is a realistic failure mode, not
a hypothetical one. Independent verification inside the Worker is the last
line of defense protecting an account-wide credential, and "fail closed" is
the only acceptable posture for that line.

### III. Single Worker, Shared Audit Logic
FlareTower runs as one Cloudflare Worker with exactly two entry points: a
`fetch` handler (serves the React SPA via the Workers static assets binding
and the `/api/*` JSON API) and a `scheduled` handler (Cron Trigger driving the
drift audit). The audit logic — inventorying resources, evaluating exposure,
detecting drift — MUST live in a single shared module invoked identically by
both the interactive API path and the scheduled path. Duplicating audit logic
between the two entry points is a constitution violation, not a style
preference.
**Rationale**: The interactive and scheduled modes must always agree on what
counts as "exposed" or "drifted." Divergent implementations are how silent
false negatives creep in.

### IV. Deno-Only Local Toolchain
All local development tooling MUST run through Deno: `deno fmt`, `deno lint`,
`deno test`, `deno coverage`, `deno task`. The repository MUST NOT contain a
`package.json`, and `node_modules` MUST NOT be committed. npm is not an
accepted package manager for this project under any circumstance. npm
*packages* are permitted, but only pulled in via Deno's `npm:` specifier,
declared through the import map in `deno.json`. Any tool that would otherwise
force the creation of a `package.json` (Wrangler, Playwright, or a future
dependency) MUST first be proven to run acceptably via `npm:` specifiers under
Deno; if it cannot, the friction MUST be documented and options proposed
before the tool is adopted — a `package.json` MUST NOT be silently introduced
as a workaround.
**Rationale**: A single, consistent toolchain keeps contributor setup trivial
and avoids the dependency-resolution divergence that comes from running two
package managers side by side.

### V. One Configuration File
Everything Deno is capable of holding — import map, task definitions,
formatter settings, linter rules, TypeScript compiler options — MUST live in
a single `deno.json`. Separate `tsconfig.json`, `.eslintrc`, `.prettierrc`, or
equivalent files MUST NOT be created. Configuration sprawl is treated as
tooling debt from the moment it appears, not something to clean up later.
**Rationale**: Minimizing configuration surface makes the project easier to
reason about for both humans and coding agents working across sessions.

### VI. Strict TypeScript, Test-First, Playwright for User-Facing Flows
All code is TypeScript in strict mode; `any` and implicit-any escapes require
explicit justification in review. Every feature MUST ship with tests before
it is considered done — no feature lands untested. Every user-facing flow
(login redirect through Access, exposure dashboard, any mutating action) MUST
have Playwright end-to-end coverage; Playwright is required, not optional
tooling. Tests exercising the audit logic (Principle III) MUST run it exactly
as both the `fetch` and `scheduled` handlers do, so drift between the two
paths would be caught, not assumed away.
**Rationale**: A tool that mutates Cloudflare account configuration cannot
tolerate an untested code path — the blast radius of a bug is the operator's
entire infrastructure.

### VII. Never Publicly Reachable
`wrangler.jsonc` MUST set `"workers_dev": false` from the first commit and for
the life of the project; this is non-negotiable and MUST NOT be relaxed for
convenience, debugging, or demos. `"preview_urls": true` MAY remain enabled,
but the README MUST prominently document, as a required manual post-deploy
step, that Preview URLs default to public and MUST be restricted via
**Workers & Pages → the Worker → Settings → Domains & Routes → Preview URLs →
Enable Cloudflare Access** (a single, account-wide, reusable "Cloudflare
Workers Preview URLs" Access policy covers this for every Worker). This step
cannot be automated through Wrangler configuration; documentation MUST make
it unmissable rather than pretending it is handled.
**Rationale**: FlareTower auditing other Workers for exactly this class of
mistake (custom domain protected, `workers.dev` wide open) while being
vulnerable to it itself would be an unacceptable failure of its own product
premise.

### VIII. Least-Privilege Secrets, Never in Config or UI
The Cloudflare API token MUST be stored only as a Worker secret via
`wrangler secret put`, never as a plain `vars` entry in `wrangler.jsonc`, and
never committed in any form. FlareTower MUST NOT accept a Cloudflare API
token through the web UI at request time under any circumstance — the token
lives in Worker secrets exclusively. The token starts read-only; write scopes
are added incrementally, one module at a time, only when that module's
mutation features actually land — not provisioned ahead of need. The exact
scopes required MUST be documented in the README and kept current as modules
are added. Secrets and credentials MUST NOT appear in logs.
**Rationale**: FlareTower is the highest-value target in any account it
manages; minimizing what the token can do at any given time bounds the damage
of a compromise.

### IX. Every Mutation Is Audited Before It Counts
Every mutating action (anything that changes Cloudflare account state) MUST
be written to the `audit_log` table — recording who, what, when, and
before/after values — as part of that action's own transaction, before the
action is considered complete. An action that mutates Cloudflare state but
fails to record its audit entry is a bug, not an acceptable edge case.
**Rationale**: Cloudflare Access answers "may this person in?"; FlareTower's
own audit trail is the only record of "what did they do here?" — it cannot be
an afterthought bolted onto an already-complete action.

### X. English-Only, Conventional Commits
All code, comments, in-app copy, documentation, and commit messages MUST be
in English. Commit messages MUST follow Conventional Commits
(`feat:`, `fix:`, `docs:`, `chore:`, etc.).
**Rationale**: FlareTower is an open-source project intended for a
non-Russian-speaking maintainer community from day one; consistent language
and commit conventions keep the project approachable to outside contributors.

## Product Scope & Module Roadmap

FlareTower is a self-hosted admin panel ("cockpit") for a Cloudflare account,
running as a Cloudflare Worker, providing a unified control plane across
Cloudflare services. It surfaces state AND mutates configuration — it is not
a read-only scanner.

**Founding problem**: with 10–15 Workers in an account it becomes impossible
to track by hand which endpoints are publicly reachable. A Worker can be
correctly protected behind Cloudflare Access on its custom domain while its
`workers.dev` production URL sits wide open. Making that class of
configuration drift immediately visible is the product's first job.

Full intended module surface, in build order (implementation is incremental;
each module beyond the first gets its own spec on its own branch when its
turn comes — this list is the durable target, not a commitment to build all
of it now):

1. **Workers & Access exposure** — inventory every Worker: custom domains,
   `workers.dev` status, Preview URL status, whether each publicly reachable
   hostname is covered by an Access application, and whether existing Access
   policies are effectively open (e.g. "Everyone"). This is the first module
   to be specified and built.
2. **DNS** — records across zones, proxied vs. DNS-only status, dangling
   records.
3. **Zero Trust / Access** — applications, policies, groups, service tokens.
4. **Pages** — projects, deployments, custom domains.
5. **R2 / KV / D1** — buckets, namespaces, databases; public exposure of R2.
6. **Security posture** — WAF, rate limiting, DNSSEC, SSL/TLS mode,
   Turnstile.
7. **Audit & drift** — snapshot history, "what changed since yesterday,"
   scheduled scans with alerting.

Two operating modes are both required for every audit-capable module:
**interactive** (the web UI, on demand) and **scheduled** (the Cron Trigger
drift audit). Per Principle III, the audit logic behind both is one shared
module, never duplicated.

## Identity, Authorization & Audit Data Model

D1 is the datastore from the start. A `users` table is required from the
first commit, designed around:
- `sub` from the Access JWT as the primary stable key — the email column MUST
  NOT be used as a key, since emails change.
- `email`, `idp` (which provider authenticated the user), `created_at`,
  `last_seen_at`.
- Application-level roles that are independent of Cloudflare Access groups,
  though they MAY be synced from Access group membership. FlareTower roles
  are the authority for in-app permissions — Access groups inform them but do
  not substitute for them.

An `audit_log` table is required from the first commit, recording every
mutating action per Principle IX: actor (`sub`), action, timestamp, and
before/after values.

## Design System

The visual layer is sourced from `docs/design.zip` (logo, favicon, color
tokens, typography scale, component patterns, reference screens) — it MUST be
unpacked and read before any UI decision is made, and treated as the source
of truth for the visual layer:
- Color and spacing tokens are extracted into CSS custom properties in a
  single place; hex values MUST NOT be hardcoded across components.
- Component patterns from the package are followed rather than invented
  fresh.
- The status semantics the package establishes (safe / warning / critical)
  are product language, not decoration — an exposed-without-Access Worker
  MUST read as critical everywhere it appears in the UI.
- A screen not covered by the package MAY be designed in the same visual
  language, with that fact noted explicitly in the PR description.

## Deployment & Operations

Deployment uses the native Cloudflare → GitHub integration (Workers Builds).
There is no custom CI pipeline for deploys; GitHub Actions MAY still run
lint, test, and typecheck as PR gates. Deployment and Preview URL restriction
requirements are governed by Principle VII.

## Governance

This constitution supersedes all other project practices and prior
undocumented conventions. Every PR MUST be evaluated against the Core
Principles above before merge; a PR that violates a principle MUST either be
changed to comply or MUST document, in its description, an explicit and
reasoned exception approved by a maintainer — silent violation is not
acceptable.

**Amendment procedure**: amendments are proposed as a PR modifying this file,
including a completed Sync Impact Report (as an HTML comment at the top of
the file) describing what changed and why. Amendments require maintainer
approval before merge, same as any other governance-affecting change.

**Versioning policy**: this constitution is versioned independently of the
codebase, using semantic versioning:
- **MAJOR** — backward-incompatible governance changes: a principle is
  removed or redefined in a way that contradicts its prior meaning.
- **MINOR** — a new principle or section is added, or existing guidance is
  materially expanded.
- **PATCH** — clarifications, wording fixes, and non-semantic refinements.

**Compliance review**: any spec, plan, or task produced by the Spec Kit
workflow MUST be checked against this constitution before implementation
begins. Deviations discovered during implementation MUST be raised for
resolution (either fixing the implementation or amending the constitution)
before merge, not silently absorbed.

**Version**: 1.0.0 | **Ratified**: 2026-08-07 | **Last Amended**: 2026-08-07
