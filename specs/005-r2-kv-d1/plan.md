# Implementation Plan: R2 / KV / D1

**Branch**: `005-r2-kv-d1` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-r2-kv-d1/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Inventory of every R2 bucket, KV namespace, and D1 database in the
account. R2 buckets are flagged critical/warning/safe using the same
hostname-coverage/policy-openness logic Modules 1 and 4 already
established, applied to `r2.dev` managed-domain and custom-domain public
access. KV namespaces and D1 databases — never directly
internet-reachable — are instead flagged warning when no deployed
Worker's bindings reference them, a cross-reference against every
Worker's live binding configuration. Evaluated identically on-demand and
on the existing shared schedule — the fifth module joining Modules 1-4's
established architecture without introducing anything structurally new.

## Technical Context

**Language/Version**: TypeScript, strict — same runtime target as every
prior module.

**Primary Dependencies**: None new — reuses `hono`, plain `fetch()`.

**Storage**: Cloudflare D1. Three new finding/alert table pairs — one per
resource type, each with a genuinely distinct identity space (bucket
name, KV namespace id, D1 database uuid): `r2_bucket_findings`/
`r2_bucket_alerts`, `kv_namespace_findings`/`kv_namespace_alerts`,
`d1_database_findings`/`d1_database_alerts` — see `data-model.md`.

**Testing**: `deno test` for pure evaluation/diff logic; Playwright for
the inventory view — same tools as every prior module.

**Target Platform**: Same single Worker — sibling module directory, not a
new deployable.

**Project Type**: Same single-Worker project.

**Performance Goals**: Same shape as every prior module's SC-001 —
visible within one minute of opening the panel.

**Constraints**: Same shared API rate limit and CPU/subrequest budget
reasoning as Modules 1-4, now with five modules' worth of scheduled
evaluation sharing one Cron Trigger invocation. The Worker-bindings
cross-reference (User Story 3) means request volume scales with Worker
script count independently of bucket/namespace/database count — N
Workers → 1 script-list call + N binding-list calls per run, same shape
as Module 1's own per-script calls and Module 4's per-project calls;
acceptable at the expected single-account scale.

**Scale/Scope**: No fixed number of buckets/namespaces/databases/Workers
required; list-based endpoints keep it correct as any of them grows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Access is the only gate; no bespoke IdP | ✅ PASS | Unchanged. |
| II | Defense-in-depth JWT validation, fail closed | ✅ PASS | Reuses the existing `accessAuth` middleware on `/api/storage/*`. |
| III | Single Worker, shared audit logic | ✅ PASS | `evaluateBucketExposure()`/`evaluateKvNamespaceUsage()`/`evaluateD1DatabaseUsage()` shared by the interactive route and the existing scheduled handler — a fifth independent `waitUntil` call joins Modules 1-4's, still one Cron Trigger. |
| IV | Deno-only local toolchain | ✅ PASS | No new tooling. |
| V | Single `deno.json` | ✅ PASS | No new dependencies. |
| VI | Strict TS, tests-first, Playwright required | ✅ PASS | Same pattern. |
| VII | Never publicly reachable | ✅ PASS (inherited) | Unaffected. |
| VIII | Least-privilege secrets, read-only first | ✅ PASS | Three net-new scopes (R2, KV, D1 read); `Workers Scripts Read` and `Access: Apps and Policies Read` are already granted for Modules 1/3/4. |
| IX | Every mutation audited before it counts | ✅ N/A | Detection-only (FR-015), same boundary as every prior module. |
| X | English-only, Conventional Commits | ✅ PASS | Process constraint. |

No violations — **Complexity Tracking section is not needed**.

*Post-Phase-1 re-check*: unchanged. One integration point flagged for
`tasks.md`, same as every prior module's equivalent task: this module's
scheduled evaluation joins the *existing* scheduled handler (now running
five independent evaluations) rather than adding a sixth Cron Trigger.

## Project Structure

### Documentation (this feature)

```text
specs/005-r2-kv-d1/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── api.md           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Fifth sibling module directory, same pattern as Modules 1-4. Named
`storage` (short, semantic — matches how `workers-access-exposure`
shortened to `/api/exposure` and every other module's route prefix is
shorter than its spec directory name), covering all three storage
primitives this module audits:

```text
worker/
├── modules/
│   ├── workers-access-exposure/     # Module 1 (existing)
│   ├── dns/                          # Module 2 (existing)
│   ├── zero-trust/                   # Module 3 (existing)
│   ├── pages/                        # Module 4 (existing)
│   └── storage/
│       ├── types.ts
│       ├── inventory.ts              # buckets, namespaces, databases, Access apps, Worker bindings
│       ├── evaluate.ts               # evaluateBucketExposure(), evaluateKvNamespaceUsage(), evaluateD1DatabaseUsage()
│       ├── alerts.ts                 # three diff functions (buckets, namespaces, databases)
│       └── routes.ts                 # Hono router for /api/storage/*
└── db/migrations/
    └── 0006_storage_findings.sql

app/pages/
└── StorageInventory.tsx             # reuses ExposureStatusBadge unchanged

tests/
├── unit/
│   ├── storage-evaluate.test.ts
│   ├── storage-inventory.test.ts
│   └── storage-alerts.test.ts
└── e2e/
    └── storage-inventory.spec.ts
```

**Structure Decision**: No new architectural pattern. `App.tsx`'s nav
gains a fifth entry. R2's hostname-coverage and policy-openness checks
are a fresh, local implementation of the same decision rules Modules 1
and 4 already established, rather than an import from either
(research.md §2, following Module 3 and Module 4's precedent:
duplication beats premature cross-module coupling). This module fetches
its own copies of the Worker script list and Access applications list
independently, same as every prior module that needed either, rather
than sharing another module's fetch — keeping every module's scheduled
evaluation independently failable (Principle III).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this section is intentionally empty (see Constitution
Check above).
