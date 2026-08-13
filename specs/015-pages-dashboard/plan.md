# Implementation Plan: Pages Dashboard

**Branch**: `015-pages-dashboard` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-pages-dashboard/spec.md`

## Summary

Upgrades the existing Pages page in place — same `pages` nav key, no nav split — collapsing today's
3-rows-per-project generic findings table into one bespoke row per project (Production domain,
Branch, Last build, Health), per the design's §11 mockup. Health reuses the existing
subdomain-exposure status unchanged (no new severity tier, no second pill taxonomy). Two small,
already-fetched fields newly captured (`production_branch`, deployment `created_on`); Production
domain is a derived display value. No new Cloudflare API call, no new token scope — the simplest-scoped
spec in this rollout so far.

## Technical Context

**Language/Version**: TypeScript (strict), React 19, Deno 2 runtime — unchanged.

**Primary Dependencies**: None new.

**Storage**: Two new nullable columns across two existing tables (`pages_subdomain_findings.
production_branch`, `pages_deployment_findings.created_at`) — one migration. No new table.

**Testing**: `deno test` for the new field capture (inventory.ts) and the production-domain-derivation
pure function; Playwright for the rewritten page (one row per project, Production domain/Branch/Last
build states including all "none"/"not set"/"no production deployment yet" edge cases, Health pill
unchanged).

**Target Platform**: Browser SPA + existing `worker/modules/pages/*` backend module (extended).

**Project Type**: Existing single-Worker web application — no new page, no new nav item; extends
`worker/modules/pages/{types,inventory,routes}.ts` (evaluate.ts unchanged — research.md §3) and
rewrites `app/pages/PagesInventory.tsx`.

**Performance Goals**: No new SLA — same bar as every other module.

**Constraints**: MUST NOT introduce a second status taxonomy for the Health column (spec.md FR-003).
MUST NOT add any Cloudflare-mutating control (spec.md FR-004).

**Scale/Scope**: One new D1 migration (2 columns across 2 tables), small additions to 2 existing
backend files (`inventory.ts`, `routes.ts` — `evaluate.ts` untouched), one frontend page rewrite.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
| --- | --- | --- |
| I. Access is the only gate | N/A | No identity/auth code touched. |
| II. Defense-in-depth JWT validation | Pass | Existing `/api/pages/*` routes, already behind `accessAuth` — unchanged. |
| III. Single Worker, shared audit logic | Pass | Extends Module 4's existing `runPagesEvaluation`/scheduled-handler entry point in place. |
| IV. Deno-only local toolchain | Pass | No new dependency. |
| V. One configuration file | Pass | No new config file class. |
| VI. Strict TypeScript, test-first, Playwright | Pass (gate for implementation) | Production-domain-derivation is a pure function, tested first; Playwright covers the rewritten page's new states. |
| VII. Never publicly reachable | Pass | Unaffected. |
| VIII. Least-privilege secrets | Pass | Zero new token scope — every new field is already in data this module already fetches (research.md §1). |
| IX. Every mutation is audited | N/A | No Cloudflare-account mutation in this feature (spec.md FR-004). |
| X. English-only, Conventional Commits | Pass | Unaffected. |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/015-pages-dashboard/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
worker/db/migrations/0011_pages_findings_add_branch_and_build_time.sql   # new — 2 nullable columns

worker/modules/pages/types.ts       # + productionBranch on RawPagesProject-derived shape, createdOn on ProductionDeployment
worker/modules/pages/inventory.ts   # + capture production_branch, created_on from existing fetches
worker/modules/pages/routes.ts      # + persist/read 2 new columns; derive production_domain in GET /inventory

app/pages/PagesInventory.tsx        # rewritten: one row per project (Project/Production domain/Branch/Last build/Health), reuses FindingsTable unchanged

tests/unit/pages-inventory.test.ts   # extended
tests/e2e/pages-inventory.spec.ts    # extended
```

**Structure Decision**: Extends Module 4's existing files in place — `evaluate.ts` is explicitly
untouched (research.md §3: Health reuses existing evaluation unchanged), the smallest backend
footprint of the rollout so far.

## Complexity Tracking

No violations — table not needed.
