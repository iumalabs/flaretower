# Implementation Plan: DNS

**Branch**: `002-dns` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-dns/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Inventory every DNS record across every zone, flag dangling records
(subdomain-takeover risk) as critical by consuming Cloudflare's own
Security Insights findings rather than reimplementing detection, flag
DNS-only exposure on origin-facing records as a distinct warning, and run
the same evaluation both on-demand and on a schedule with new-vs-repeat
alerting — mirroring Module 1's architecture exactly (same shared-module
pattern, same D1 approach, same auth gate).

## Technical Context

**Language/Version**: TypeScript, strict mode — same runtime target as
Module 1 (Cloudflare Workers; Deno is local tooling only).

**Primary Dependencies**: None new. Reuses Module 1's `hono` (routing),
same plain-`fetch()`-against-`api.cloudflare.com` approach — no new npm
package needed for this module.

**Storage**: Cloudflare D1. Two new module-owned tables (`dns_findings`,
`dns_alerts`), structurally parallel to Module 1's — see `data-model.md`.

**Testing**: `deno test` for the pure `evaluateRecord()`/diff logic;
Playwright for the DNS inventory view and status rendering — same tools
and pattern as Module 1.

**Target Platform**: Same single Worker as Module 1 — this module adds
routes and a scheduled-audit contribution, not a new deployable.

**Project Type**: Same single-Worker project as Module 1 — this module is
an additional `worker/modules/dns/` directory, not a new structure.

**Performance Goals**: Same shape as Module 1's SC-001 — an operator can
see every DNS record across every zone within one minute of opening the
panel.

**Constraints**:
- Same Cloudflare global API rate limit (1,200 req/5 min) applies,
  compounded with Module 1's own usage since both run in the same account
  — list-based endpoints (zones once, records per zone, insights once) are
  used rather than any per-record API call, to keep this proportionate.
- Same CPU/subrequest budget reasoning as Module 1 (I/O-bound workload).
- Reuses Module 1's `limits.cpu_ms` and Cron Trigger — this module's
  scheduled evaluation is invoked from the same `scheduled` handler
  alongside Module 1's (constitution Principle III: one shared audit
  entry point, not a second competing Cron Trigger schedule per module).

**Scale/Scope**: No fixed number of zones/records required by this module;
the list-based, non-per-record-call design (research.md §1) keeps it
correct as either grows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Access is the only gate; no bespoke IdP | ✅ PASS | Unchanged from Module 1 — this module adds no auth code of its own. |
| II | Defense-in-depth JWT validation, fail closed | ✅ PASS | Reuses Module 1's `accessAuth` middleware, mounted on `/api/dns/*` the same way. |
| III | Single Worker, shared audit logic | ✅ PASS | `evaluateRecord()` shared by `POST /api/dns/evaluate` and the (single, shared) `scheduled` handler — this module's scheduled work is added to the existing scheduled handler, not a second Cron Trigger. |
| IV | Deno-only local toolchain | ✅ PASS | No new tooling introduced; T001's validation from Module 1 still holds. |
| V | Single `deno.json` | ✅ PASS | No new config files; no new dependencies to add to the import map. |
| VI | Strict TS, tests-first, Playwright required | ✅ PASS | Same tools, same pattern as Module 1. |
| VII | Never publicly reachable | ✅ PASS (inherited) | Unaffected by this module. |
| VIII | Least-privilege secrets, read-only first | ✅ PASS | New scopes requested (`Zone Read`, `DNS Read`, `Zone Security Center Insights` read) are additive and read-only, documented in research.md §6 and to be added to the README's token-scope table. |
| IX | Every mutation audited before it counts | ✅ N/A for this module | FR-012: detection-only, same boundary as Module 1. |
| X | English-only, Conventional Commits | ✅ PASS | Process constraint. |

No violations — **Complexity Tracking section is not needed**.

*Post-Phase-1 re-check*: unchanged — Phase 1 design (two new D1 tables, 4
new endpoints) introduces nothing that alters the table above. One
follow-up worth flagging for `tasks.md`: wiring this module's evaluation
into the *existing* scheduled handler (rather than adding a second one)
is a real integration point with Module 1's `worker/index.ts` that the
task breakdown must call out explicitly, not leave implicit.

## Project Structure

### Documentation (this feature)

```text
specs/002-dns/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── api.md           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Extends Module 1's existing single-Worker layout — a sibling module
directory under `worker/modules/`, plus a sibling SPA page, following the
exact pattern `worker/modules/workers-access-exposure/` and
`app/pages/ExposureInventory.tsx` already established:

```text
worker/
├── modules/
│   ├── workers-access-exposure/     # Module 1 (existing)
│   └── dns/
│       ├── types.ts                 # DnsRecord, DnsFinding, etc.
│       ├── inventory.ts             # Cloudflare API: zones, records, Security Insights
│       ├── evaluate.ts              # pure record -> safe/warning/critical/not_evaluated
│       ├── alerts.ts                # new-vs-repeat diff (same shape as Module 1's)
│       └── routes.ts                # Hono router for /api/dns/*
└── db/migrations/
    └── 0003_dns_findings.sql

app/
├── pages/
│   ├── ExposureInventory.tsx        # Module 1 (existing)
│   └── DnsInventory.tsx
└── components/
    └── ExposureStatusBadge.tsx      # REUSED as-is — same safe/warning/critical/
                                      # not_evaluated status semantics, no new component needed

tests/
├── unit/
│   ├── dns-evaluate.test.ts
│   ├── dns-inventory.test.ts
│   └── dns-alerts.test.ts
└── e2e/
    └── dns-inventory.spec.ts
```

**Structure Decision**: Same single-Worker, module-per-directory layout as
Module 1 — no new architectural pattern introduced. `ExposureStatusBadge`
is reused unchanged rather than duplicated, since the status semantics
(safe/warning/critical/not_evaluated, shape+color) are shared product
language across modules (constitution's Design System section), not
Module-1-specific. The one new integration point is `worker/index.ts`'s
`scheduled` handler, which must call *both* Module 1's and this module's
evaluation (still one Cron Trigger, one handler — constitution Principle
III) — this is called out explicitly as its own task in `tasks.md` rather
than left implicit, per the Constitution Check's post-Phase-1 note above.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this section is intentionally empty (see Constitution
Check above).
