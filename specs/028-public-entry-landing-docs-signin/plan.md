# Implementation Plan: Public Landing, Documentation & Sign-In Entry

**Branch**: `028-public-entry-landing-docs-signin` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-public-entry-landing-docs-signin/spec.md`

## Summary

Add two new, deliberately public (non-Access-gated) pages — a marketing landing page and a
documentation page — plus a "Sign in" entry point that hands the visitor's browser off to
Cloudflare Access rather than performing any identity-provider protocol itself. The primary
technical question this plan resolves is **how an unauthenticated visitor and an
authenticated operator can both land on `/` and see different content**, given that today
Cloudflare Access is configured to front the entire hostname and the Worker's own code has
no visibility into auth state for anything outside `/api/*`. The resolution: reuse the
existing `accessAuth` JWT-validation middleware (constitution Principle II) as a tiny,
read-only "am I authenticated" probe the client calls on boot, and narrow the *operator's*
Cloudflare Access Application configuration (a deploy-time setup step, not code) to exclude
the small set of paths this feature needs public. `/api/*` keeps its existing, unchanged
Access coverage and its own independent JWT check either way.

## Technical Context

**Language/Version**: TypeScript (strict mode), Deno runtime/toolchain

**Primary Dependencies**: Hono (Worker routing, already used by every existing module),
React (existing SPA), `jose` (existing JWT verification, already used by `accessAuth`) — no
new dependency introduced by this feature

**Storage**: N/A — this feature introduces no new persistent entities (see spec.md Key
Entities); the landing and documentation pages render fixed content, and the new session
probe endpoint (below) reads only the identity `accessAuth` already resolves, writing
nothing new to D1

**Testing**: `deno test` (unit), Playwright (this is a user-facing flow — constitution
Principle VI makes Playwright coverage mandatory for it)

**Target Platform**: Cloudflare Workers (existing single-Worker deployment)

**Project Type**: Web application — existing `app/` (React SPA) + `worker/` (Hono API +
static-asset serving) structure, extended in place; no new top-level project

**Performance Goals**: N/A beyond existing app norms — these are static/near-static pages,
no meaningful performance risk

**Constraints**: Must not add any code path that performs an OAuth/OIDC handshake, mints a
session, or stores a credential (constitution Principle I). Must not weaken `/api/*`'s
existing independent JWT validation (Principle II) in any way — this feature only adds
paths *outside* `/api/*`.

**Scale/Scope**: Two new client-side pages (landing, docs), one new tiny read-only API
endpoint (session probe), no new database tables, no new Worker entry points beyond the
existing `fetch` handler's routing.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Access Is the Only Gate; FlareTower Implements No Identity Provider** — **PASS,
  with an explicit design decision recorded here.** The design source this feature is built
  from depicts FlareTower's own OIDC issuer/scopes/callback/handshake UI (see spec.md's
  corrected User Story 2 and FR-006). None of that is implemented. The only "auth-adjacent"
  code this feature adds is a read-only endpoint that reports whether `accessAuth` (already
  existing, already constitution-compliant) resolved an identity for the current request —
  it performs no IdP interaction of its own. "Sign in" is plain navigation; Cloudflare
  Access performs the entire IdP handshake outside this Worker's code, exactly as it does
  for every existing route today. **This does require an operator-facing change to how the
  Cloudflare Access Application is scoped** (excluding the new public paths from Access
  coverage) — that is a deploy-time dashboard configuration decision for the operator to
  make (documented in this feature's updated deploy docs), not something this codebase
  enforces or could enforce; consistent with Principle VIII's precedent that some
  Cloudflare-side configuration is operator responsibility, not application code.
- **II. Defense-in-Depth JWT Validation, Fail Closed** — **PASS, unchanged.** `/api/*`'s
  existing `accessAuth` middleware (header presence, JWKS signature, issuer/audience,
  fail-closed 403) is not modified. The new session-probe endpoint lives under `/api/*` and
  goes through the exact same middleware as every other `/api/*` route — it adds no new
  validation logic, it only surfaces the *result* of the existing check to the client.
- **III. Single Worker, Shared Audit Logic** — **PASS.** No new Worker, no new scheduled
  entry point. This feature adds response branches to the existing `fetch` handler only.
- **IV. Deno-Only Local Toolchain** — **PASS.** No new dependency, no `package.json`. The
  documentation page's rewritten "Deploy it" section (spec.md User Story 3 / FR-004)
  specifically exists to stop a fictional npm-based CLI from ever being documented as real.
- **V. One Configuration File** — **PASS.** No new config file introduced.
- **VI. Strict TypeScript, Test-First, Playwright for User-Facing Flows** — **PASS,
  gates task planning.** Both new pages and the sign-in hand-off are user-facing flows;
  Playwright coverage is mandatory for them (captured in tasks.md, not optional).
- **VII. Never Publicly Reachable** — **PASS, unaffected.** This principle concerns the
  `workers.dev` subdomain and Preview URLs, not the deployed custom hostname's own path
  scoping. This feature's public paths are served on the same custom hostname as today;
  `workers_dev` stays `false`; Preview URL Access-gating is untouched.
- **VIII. Least-Privilege Secrets, Never in Config or UI** — **PASS, unaffected.** No
  token handling changes.
- **IX. Every Mutation Is Audited Before It Counts** — **PASS, not applicable.** This
  feature performs no mutations (see Key Entities in spec.md) — nothing to audit.
- **X. English-Only, Conventional Commits** — **PASS.** All new copy (landing page,
  documentation) is written in English, matching the existing app.

**No violations requiring Complexity Tracking.**

## Project Structure

### Documentation (this feature)

```text
specs/028-public-entry-landing-docs-signin/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (the one new session-probe endpoint)
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
app/                        # existing React SPA
├── pages/
│   ├── LandingPage.tsx      # NEW — public marketing/landing page
│   └── DocumentationPage.tsx# NEW — public documentation page
├── lib/
│   ├── page-routes.ts       # existing path<->PageKey mapping — extended for the
│   │                        # two new public routes and the auth-probe boot logic
│   └── session.ts           # NEW — thin client for the new session-probe endpoint
├── App.tsx                  # existing root — gains the "which experience renders
│                             # at / " decision (landing vs. authenticated dashboard)
└── components/               # existing Sidebar/etc. — unchanged by this feature

worker/
├── index.ts                  # existing fetch handler — gains routing for the new
│                             # public HTML entry points (served via existing
│                             # env.ASSETS.fetch, no new gating logic needed there)
└── modules/identity/
    └── routes.ts              # gains one new read-only route under the existing
                                # accessAuth-gated /api/identity router: a session
                                # probe with no role requirement (unlike /users)

tests/
├── unit/                      # page-routes.ts extension, session probe logic
└── e2e/                       # Playwright: landing page render, sign-in navigation,
                                # documentation TOC navigation, authenticated visitor
                                # sees dashboard not landing page at /
```

**Structure Decision**: Extends the existing single-Worker, `app/` + `worker/` structure in
place — no new top-level project, no new Worker, no new persistent storage. The two new
pages are ordinary additions to the existing React app; the one new API route is an
ordinary addition to the existing, already Access-gated `/api/identity` router.

## Complexity Tracking

*No Constitution Check violations — this section intentionally left empty.*
