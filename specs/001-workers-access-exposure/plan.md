# Implementation Plan: Workers & Access Exposure

**Branch**: `001-workers-access-exposure` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-workers-access-exposure/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the
execution workflow.

## Summary

Inventory every Worker's public hostnames (custom domain, `workers.dev`, Preview URL) and evaluate
each against Cloudflare Access coverage, flagging unprotected hostnames as critical and
effectively-open Access policies as warning. The same evaluation logic runs both on-demand (`fetch`
→ `/api/exposure/*`) and on a schedule (`scheduled` → Cron Trigger), persisting results to D1 so the
scheduled path can alert on new-vs-repeat drift without re-alerting on unchanged findings. Detection
only — no Cloudflare account mutation in this module (spec FR-012).

## Technical Context

**Language/Version**: TypeScript, strict mode (constitution Principle VI). Runtime target is the
Cloudflare Workers runtime (V8 isolates) — Deno is the _local tooling_ only
(`deno fmt`/`lint`/`test`/`task`), never the deployed runtime (constitution Principle IV).

**Primary Dependencies** (all via Deno's `npm:` specifier in `deno.json`'s import map, per
constitution Principle IV — see `research.md` §1–2, §7):

- `hono` — `/api/*` routing
- `jose` — Access JWT verification (`createRemoteJWKSet` + `jwtVerify`)
- `wrangler` — deploy tooling
- Vite + `@cloudflare/vite-plugin` — React SPA build
- `react` / `react-dom` — SPA
- `playwright` — e2e tests (dev dependency)

No Cloudflare API SDK dependency — plain `fetch()` against `api.cloudflare.com` with small typed
helpers (research.md §3), to keep the dependency surface proportional to this module's ~5 endpoint
shapes.

**Storage**: Cloudflare D1. Two module-owned tables (`exposure_findings`, `exposure_alerts`) in
addition to the constitution-mandated baseline (`users`, `audit_log`) — see `data-model.md`.

**Testing**: `deno test` for the pure exposure-evaluation function; Playwright (via `npm:`) for
user-facing flows (inventory view, critical/warning/safe rendering, Access-gated access) —
constitution Principle VI.

**Target Platform**: Cloudflare Workers (edge runtime), single Worker serving both the React SPA
(static assets binding) and `/api/*`, plus a `scheduled` handler (Cron Trigger) — constitution §3.

**Project Type**: Single deployable Worker containing both a JSON API and a served SPA — not a
separate frontend/backend deployment (see Structure Decision below).

**Performance Goals**: SC-001 — an operator can identify every Access-unprotected hostname within 1
minute of opening the panel. Since the workload is I/O-bound (waiting on the Cloudflare API, not
computation), this is a latency/UX target more than a throughput one at the founding "10-15 Workers"
scale.

**Constraints**:

- Cloudflare global API rate limit: 1,200 requests/5 min per token, cumulative (research.md §4) —
  evaluation must use account-level list endpoints, not per-Worker request fan-out, and must degrade
  to `not_evaluated` (never silently `safe`) on `429`/errors (FR-011).
- Workers CPU time: this module's workload is I/O-bound, so the default budget is ample;
  `limits.cpu_ms` is still set explicitly as headroom (research.md §5), not left implicit.
- `workers_dev: false` and the Preview-URL-behind-Access requirement (constitution Principle VII)
  apply to FlareTower's own deployment — this module doesn't change or relax that, and its own
  `/api/exposure/*` endpoints are reachable only through the same Access gate as everything else
  (constitution Principle II applies uniformly).

**Scale/Scope**: Founding scale is 10–15 Workers per account (spec's stated problem); the
account-level-list-endpoint design (research.md §3–4) keeps this correct well beyond that without
redesign, though no specific larger number is a hard requirement for this module.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| #    | Principle                                       | Status                                    | Notes                                                                                                                                                                                                               |
| ---- | ----------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I    | Access is the only gate; no bespoke IdP         | ✅ PASS                                   | No IdP code anywhere in this plan; `jose` only verifies Access's own JWKS (research.md §2).                                                                                                                         |
| II   | Defense-in-depth JWT validation, fail closed    | ✅ PASS                                   | Every `/api/exposure/*` endpoint requires a valid Access JWT; missing/invalid → `403`, never degraded access (contracts/api.md).                                                                                    |
| III  | Single Worker, shared audit logic               | ✅ PASS                                   | `fetch` (`POST /api/exposure/evaluate`) and `scheduled` both call one shared evaluation module (research.md §9, contracts/api.md's "Scheduled entry point" note).                                                   |
| IV   | Deno-only local toolchain                       | ✅ PASS, with a carried-forward open risk | Vite/Wrangler/Playwright via `npm:` — research.md §7 flags that actually running these without a `package.json` appearing is not yet proven and must be the first thing validated in `tasks.md`.                    |
| V    | Single `deno.json`                              | ✅ PASS                                   | Plan introduces no additional config files.                                                                                                                                                                         |
| VI   | Strict TS, tests-first, Playwright required     | ✅ PASS                                   | Planned in Technical Context above.                                                                                                                                                                                 |
| VII  | Never publicly reachable (`workers_dev: false`) | ✅ PASS (inherited)                       | Repo-level requirement from the bootstrap `wrangler.jsonc`; this module doesn't touch it.                                                                                                                           |
| VIII | Least-privilege secrets, read-only first        | ✅ PASS                                   | Token scopes pinned to 3 Read-only permissions (research.md §3); no write scope requested by this module.                                                                                                           |
| IX   | Every mutation audited before it counts         | ✅ N/A for this module                    | FR-012: detection-only, no Cloudflare account mutations. This module's own D1 writes (findings/alerts) are FlareTower's internal state, not audited actions against the managed account — see data-model.md's note. |
| X    | English-only, Conventional Commits              | ✅ PASS                                   | Process constraint, not module-specific.                                                                                                                                                                            |

No violations — **Complexity Tracking section is not needed** for this plan.

_Post-Phase-1 re-check_: unchanged — Phase 1 design (data-model.md, contracts/api.md) introduced two
new D1 tables and 4 endpoints, none of which alter the table above.

## Project Structure

### Documentation (this feature)

```text
specs/001-workers-access-exposure/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── api.md           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Single Cloudflare Worker deployable containing both the API and the SPA (constitution §3) — this is
neither the template's "single project" option (no CLI/library shape here) nor its "frontend +
backend" option (those are two separately deployed halves; FlareTower is one deployment unit). The
layout below is a variant of "single project," split into `worker/` (the Worker's own code — API,
auth, scheduled handler, per-module logic) and `app/` (the React SPA it serves), both built from and
deployed as the one Worker:

```text
worker/
├── index.ts                        # fetch + scheduled entry points
├── auth/
│   └── access-jwt.ts                # jose-based Cf-Access-Jwt-Assertion validation (cross-cutting, all modules)
├── db/
│   └── migrations/                  # D1 SQL migrations (wrangler d1 migrations dir)
│       └── 0001_exposure_findings.sql
└── modules/
    └── workers-access-exposure/
        ├── inventory.ts             # Cloudflare API calls: list scripts, custom domains, access apps/policies (legacy zone-bound Routes are out of scope — research.md §3 scope note)
        ├── evaluate.ts              # pure hostname → safe/warning/critical/not_evaluated logic (shared by fetch + scheduled)
        ├── alerts.ts                 # new-vs-repeat diff against exposure_findings/exposure_alerts
        └── routes.ts                 # Hono router for /api/exposure/*

app/
├── main.tsx
├── pages/
│   └── ExposureInventory.tsx
└── components/
    └── ExposureStatusBadge.tsx      # safe/warning/critical — shared visual language, constitution's Design System section

tests/
├── unit/
│   └── evaluate.test.ts             # deno test — pure logic, no network/D1
└── e2e/
    └── exposure-inventory.spec.ts   # Playwright — inventory view, status rendering, Access gate
```

**Structure Decision**: Single-Worker layout split into `worker/` (API + per-module logic, organized
by module under `worker/modules/` so later modules from constitution §2 add sibling directories
rather than growing this module's files) and `app/` (SPA). `worker/auth/` is deliberately outside
any module directory since JWT validation is cross-cutting (constitution Principle II applies to
every module's endpoints, not just this one's). `evaluate.ts` is kept dependency-free (no D1, no
`fetch`) so `fetch` and `scheduled` calling it identically is enforced by the type signature, not
just convention (constitution Principle III).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this section is intentionally empty (see Constitution Check above).
