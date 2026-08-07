# Implementation Plan: Pages

**Branch**: `004-pages` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-pages/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Inventory of every Pages project and its custom domains, flagging domains
not in an active/verified state, flagging a project's `pages.dev`
subdomain when it isn't covered by a meaningfully-restrictive Access
application (the same hostname-coverage/policy-openness decision logic
Modules 1 and 3 already established, reimplemented locally per Module 3's
precedent), and flagging a project whose latest production deployment
failed or never happened — evaluated identically on-demand and on the
existing shared schedule. The fourth module joining Modules 1-3's
established architecture without introducing anything structurally new.

## Technical Context

**Language/Version**: TypeScript, strict — same runtime target as every
prior module.

**Primary Dependencies**: None new — reuses `hono`, plain `fetch()`.

**Storage**: Cloudflare D1. Three new finding/alert table pairs — one per
independently-alertable signal, mirroring Module 3's per-entity-type split
rather than Module 1's single-table-per-hostname shape, since two of these
three signals share the same identity key (project name) and merging them
would blur alert diffing (see `research.md` §3):
`pages_domain_findings`/`pages_domain_alerts` (custom domains, keyed by
project+domain), `pages_subdomain_findings`/`pages_subdomain_alerts`
(`pages.dev` exposure, keyed by project), `pages_deployment_findings`/
`pages_deployment_alerts` (production deployment health, keyed by
project) — see `data-model.md`.

**Testing**: `deno test` for pure evaluation/diff logic; Playwright for the
inventory view — same tools as every prior module.

**Target Platform**: Same single Worker — sibling module directory, not a
new deployable.

**Project Type**: Same single-Worker project.

**Performance Goals**: Same shape as every prior module's SC-001 — visible
within one minute of opening the panel.

**Constraints**: Same shared API rate limit and CPU/subrequest budget
reasoning as Modules 1-3, now with four modules' worth of scheduled
evaluation sharing one Cron Trigger invocation. Per-project deployment and
domain listing means request volume scales with project count (N projects
→ up to 1 + 2N Cloudflare API calls per run: one project list, one domains
list and one production-deployments list per project) — acceptable at the
expected scale (a single account's Pages projects, not a multi-tenant
fleet); revisit only if this becomes a real bottleneck.

**Scale/Scope**: No fixed number of projects/domains/deployments required;
list-based endpoints keep it correct as any of them grows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Access is the only gate; no bespoke IdP | ✅ PASS | Unchanged. |
| II | Defense-in-depth JWT validation, fail closed | ✅ PASS | Reuses the existing `accessAuth` middleware on `/api/pages/*`. |
| III | Single Worker, shared audit logic | ✅ PASS | `evaluatePagesProject()`/`evaluateCustomDomain()` shared by the interactive route and the existing scheduled handler — a fourth independent `waitUntil` call joins Modules 1-3's, still one Cron Trigger. |
| IV | Deno-only local toolchain | ✅ PASS | No new tooling. |
| V | Single `deno.json` | ✅ PASS | No new dependencies. |
| VI | Strict TS, tests-first, Playwright required | ✅ PASS | Same pattern. |
| VII | Never publicly reachable | ✅ PASS (inherited) | Unaffected. |
| VIII | Least-privilege secrets, read-only first | ✅ PASS | One net-new scope (`Cloudflare Pages Read`); `Access: Apps and Policies Read` is already granted for Modules 1 and 3. |
| IX | Every mutation audited before it counts | ✅ N/A | Detection-only (FR-014), same boundary as every prior module. |
| X | English-only, Conventional Commits | ✅ PASS | Process constraint. |

No violations — **Complexity Tracking section is not needed**.

*Post-Phase-1 re-check*: unchanged. One integration point flagged for
`tasks.md`, same as Modules 2 and 3's equivalent task: this module's
scheduled evaluation joins the *existing* scheduled handler (now running
four independent evaluations) rather than adding a fifth Cron Trigger.

## Project Structure

### Documentation (this feature)

```text
specs/004-pages/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── api.md           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Fourth sibling module directory, same pattern as Modules 1-3:

```text
worker/
├── modules/
│   ├── workers-access-exposure/     # Module 1 (existing)
│   ├── dns/                          # Module 2 (existing)
│   ├── zero-trust/                   # Module 3 (existing)
│   └── pages/
│       ├── types.ts
│       ├── inventory.ts              # projects, domains, production deployments, Access apps
│       ├── evaluate.ts               # evaluateCustomDomain(), evaluateSubdomainExposure(), evaluateDeployment()
│       ├── alerts.ts                 # three diff functions (domains, subdomain exposure, deployments)
│       └── routes.ts                 # Hono router for /api/pages/*
└── db/migrations/
    └── 0005_pages_findings.sql

app/pages/
└── PagesInventory.tsx               # reuses ExposureStatusBadge unchanged

tests/
├── unit/
│   ├── pages-evaluate.test.ts
│   ├── pages-inventory.test.ts
│   └── pages-alerts.test.ts
└── e2e/
    └── pages-inventory.spec.ts
```

**Structure Decision**: No new architectural pattern. `App.tsx`'s nav gains
a fourth entry. The `pages.dev` hostname-coverage and policy-openness
checks are a fresh, local implementation of the same decision rules
Modules 1 and 3 already established, rather than an import from either
(research.md §2, following Module 3's precedent: duplication beats
premature cross-module coupling). This module fetches its own copy of the
Access applications list independently, same as Module 3 does, rather than
sharing Module 3's fetch within a scheduled run — keeping every module's
scheduled evaluation independently failable (Principle III).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this section is intentionally empty (see Constitution
Check above).
