# Implementation Plan: Zero Trust / Access

**Branch**: `003-zero-trust` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-zero-trust/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Account-wide inventory of every Access application and service token,
flagging effectively-open policies and expiring/expired/never-expiring
service tokens, evaluated identically on-demand and on the existing shared
schedule — the third module joining Modules 1 and 2's established
architecture without introducing anything structurally new.

## Technical Context

**Language/Version**: TypeScript, strict — same runtime target as every
prior module.

**Primary Dependencies**: None new — reuses `hono`, plain `fetch()`.

**Storage**: Cloudflare D1. Two new finding/alert table pairs
(`zt_app_findings`/`zt_app_alerts`, `zt_token_findings`/`zt_token_alerts`)
— see `data-model.md`.

**Testing**: `deno test` for pure evaluation/diff logic; Playwright for the
inventory view — same tools as every prior module.

**Target Platform**: Same single Worker — sibling module directory, not a
new deployable.

**Project Type**: Same single-Worker project.

**Performance Goals**: Same shape as every prior module's SC-001 — visible
within one minute of opening the panel.

**Constraints**: Same shared API rate limit and CPU/subrequest budget
reasoning as Modules 1 and 2, now with three modules' worth of scheduled
evaluation sharing one Cron Trigger invocation.

**Scale/Scope**: No fixed number of applications/tokens required; list-based
endpoints keep it correct as either grows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Access is the only gate; no bespoke IdP | ✅ PASS | Unchanged. |
| II | Defense-in-depth JWT validation, fail closed | ✅ PASS | Reuses the existing `accessAuth` middleware on `/api/zero-trust/*`. |
| III | Single Worker, shared audit logic | ✅ PASS | `evaluateApplication()`/`evaluateServiceToken()` shared by the interactive route and the existing scheduled handler — a third independent `waitUntil` call joins Modules 1 and 2's, still one Cron Trigger. |
| IV | Deno-only local toolchain | ✅ PASS | No new tooling. |
| V | Single `deno.json` | ✅ PASS | No new dependencies. |
| VI | Strict TS, tests-first, Playwright required | ✅ PASS | Same pattern. |
| VII | Never publicly reachable | ✅ PASS (inherited) | Unaffected. |
| VIII | Least-privilege secrets, read-only first | ✅ PASS | One net-new scope (`Access: Service Tokens Read`); `Access: Apps and Policies Read` is already granted for Module 1. |
| IX | Every mutation audited before it counts | ✅ N/A | Detection-only (FR-014), same boundary as every prior module. |
| X | English-only, Conventional Commits | ✅ PASS | Process constraint. |

No violations — **Complexity Tracking section is not needed**.

*Post-Phase-1 re-check*: unchanged. One integration point flagged for
`tasks.md`, same as Module 2's T020: this module's scheduled evaluation
joins the *existing* scheduled handler (now running three independent
evaluations) rather than adding a fourth Cron Trigger.

## Project Structure

### Documentation (this feature)

```text
specs/003-zero-trust/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── api.md           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Third sibling module directory, same pattern as Modules 1 and 2:

```text
worker/
├── modules/
│   ├── workers-access-exposure/     # Module 1 (existing)
│   ├── dns/                          # Module 2 (existing)
│   └── zero-trust/
│       ├── types.ts
│       ├── inventory.ts              # apps, policies, service tokens
│       ├── evaluate.ts               # evaluateApplication(), evaluateServiceToken()
│       ├── alerts.ts                 # two diff functions (apps, tokens)
│       └── routes.ts                 # Hono router for /api/zero-trust/*
└── db/migrations/
    └── 0004_zero_trust_findings.sql

app/pages/
└── ZeroTrustInventory.tsx           # reuses ExposureStatusBadge unchanged

tests/
├── unit/
│   ├── zero-trust-evaluate.test.ts
│   ├── zero-trust-inventory.test.ts
│   └── zero-trust-alerts.test.ts
└── e2e/
    └── zero-trust-inventory.spec.ts
```

**Structure Decision**: No new architectural pattern. `App.tsx`'s nav gains
a third entry. The evaluation logic is intentionally a fresh, local
implementation of the policy-openness decision rules rather than an import
from Module 1 (research.md §2).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this section is intentionally empty (see Constitution
Check above).
