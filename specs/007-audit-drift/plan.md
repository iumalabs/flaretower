# Implementation Plan: Audit & Drift

**Branch**: `007-audit-drift` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-audit-drift/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A read-only aggregation layer over the fourteen finding/alert table
pairs Modules 1-6 already populate: a unified outstanding-alerts inbox
(reading and acknowledging the same underlying rows those modules own),
an account-wide posture summary (per-module status counts from the
latest run), and a "what changed since a point in time" digest (per-run
status comparison across a requested window, defaulting to 24 hours).
No Cloudflare API calls, no new evaluation logic, no per-entity
safe/warning/critical judgment of its own — this module judges nothing;
it only reads and re-presents judgments the other six modules already
made. The seventh and final module in the constitution's roadmap,
joining Modules 1-6's shared scheduled handler without introducing a
new Cron Trigger.

## Technical Context

**Language/Version**: TypeScript, strict — same runtime target as every
prior module.

**Primary Dependencies**: None new — reuses `hono`. No `fetch()` calls to
the Cloudflare API at all (research.md §1) — this module's only data
source is D1.

**Storage**: Cloudflare D1 — read-only against the fourteen existing
finding/alert table pairs. **No new tables.** This is a deliberate
departure from every prior module's pattern of adding its own
migration: Module 7 has no per-entity evaluated outcome of its own to
persist — its "unified alert" is a read-through view of another
module's existing alert row, and its "what changed" digest is computed
live from existing history on each request, not materialized (research.md
§4).

**Testing**: `deno test` for pure aggregation/diff logic against a
mocked `D1Database`; Playwright for the inventory view — same tools as
every prior module.

**Target Platform**: Same single Worker — sibling module directory, not
a new deployable.

**Project Type**: Same single-Worker project.

**Performance Goals**: Same shape as every prior module's SC-001 —
visible within one minute of opening the panel.

**Constraints**: Fourteen source table reads per request instead of
Cloudflare API calls — D1 reads within one Worker are cheap relative to
the external API calls every other module makes, so this module's
per-request cost is lower than Modules 1-6's, not higher, despite the
larger fan-out. The "what changed" digest's cost scales with each
source table's retained history (research.md §4's noted future
retention/archival scope, not addressed here).

**Scale/Scope**: Fourteen fixed source table pairs (research.md §2) — no
per-account variability in *how many* sources exist, only in how many
rows each holds.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Access is the only gate; no bespoke IdP | ✅ PASS | Unchanged. |
| II | Defense-in-depth JWT validation, fail closed | ✅ PASS | Reuses the existing `accessAuth` middleware on `/api/audit/*`. |
| III | Single Worker, shared audit logic | ✅ PASS | `computeChanges()` (the "what changed" digest) shared by the interactive route and the existing scheduled handler — a seventh independent `waitUntil` call joins Modules 1-6's, still one Cron Trigger. No per-entity "evaluate" step exists in this module to keep in sync between the two entry points, since this module makes no safe/warning/critical judgments of its own. |
| IV | Deno-only local toolchain | ✅ PASS | No new tooling. |
| V | Single `deno.json` | ✅ PASS | No new dependencies. |
| VI | Strict TS, tests-first, Playwright required | ✅ PASS | Same pattern. |
| VII | Never publicly reachable | ✅ PASS (inherited) | Unaffected. |
| VIII | Least-privilege secrets, read-only first | ✅ PASS | **No new scopes at all** — this module makes zero Cloudflare API calls (research.md §1). |
| IX | Every mutation audited before it counts | ✅ N/A | This module's only write (acknowledging an alert) is the exact same write the source module's own acknowledge endpoint already performs and already isn't audit-logged, for the same FR-011/not-a-Cloudflare-mutation reason every prior module's acknowledge endpoint isn't. |
| X | English-only, Conventional Commits | ✅ PASS | Process constraint. |

No violations — **Complexity Tracking section is not needed**. The
"no new D1 tables" and "no Cloudflare API calls" departures from every
prior module's shape are both *reductions* in complexity relative to
the established pattern, not additions requiring justification.

*Post-Phase-1 re-check*: unchanged. One integration point flagged for
`tasks.md`, same as every prior module's equivalent task: this module's
scheduled digest computation joins the *existing* scheduled handler
(now running seven independent evaluations) rather than adding an
eighth Cron Trigger.

## Project Structure

### Documentation (this feature)

```text
specs/007-audit-drift/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── api.md           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Seventh and final sibling module directory. Named `audit` (short,
semantic — matches every prior module's route-prefix-shorter-than-spec-dir
convention):

```text
worker/
├── modules/
│   ├── workers-access-exposure/     # Module 1 (existing)
│   ├── dns/                          # Module 2 (existing)
│   ├── zero-trust/                   # Module 3 (existing)
│   ├── pages/                        # Module 4 (existing)
│   ├── storage/                      # Module 5 (existing)
│   ├── security/                     # Module 6 (existing)
│   └── audit/
│       ├── sources.ts                # the 14-entry source-table registry (data-model.md §1)
│       ├── inbox.ts                  # unified alerts inbox query + acknowledge
│       ├── summary.ts                # account-wide posture summary query
│       ├── changes.ts                # "what changed since" digest query
│       └── routes.ts                 # Hono router for /api/audit/*
└── (no new migration — this module adds no tables, research.md §4)

app/pages/
└── AuditInventory.tsx               # reuses ExposureStatusBadge unchanged

tests/
├── unit/
│   ├── audit-inbox.test.ts
│   ├── audit-summary.test.ts
│   └── audit-changes.test.ts
└── e2e/
    └── audit-inventory.spec.ts
```

**Structure Decision**: No `evaluate.ts` or `alerts.ts` in this module —
there is nothing to evaluate (no per-entity safe/warning/critical
judgment originates here) and no new alert stream to diff for
new-vs-repeat (the fourteen existing alert streams already do that).
`sources.ts` is a deliberate departure from every prior module's
"duplication beats premature cross-module coupling" precedent: that
precedent exists to avoid coupling *evaluation logic* that might
diverge in meaning across modules (e.g. Module 3's policy-openness
check vs. Module 1's). Here there is no evaluation logic to diverge —
all fourteen source tables share one structurally identical shape
(`id`, entity-key columns, `status`, `reason`, `evaluated_at`, `run_id`,
`run_trigger` for findings; the alert-table equivalent), confirmed
directly against every prior module's own migrations (research.md §2).
A declarative registry plus generic query functions is the right tool
for genuinely uniform structural aggregation, not premature
abstraction — the alternative (fourteen hand-written, semantically
identical query functions) would be pure duplication with zero
divergence to protect against. `App.tsx`'s nav gains a seventh entry.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this section is intentionally empty (see Constitution
Check above).
