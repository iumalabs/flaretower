# Implementation Plan: Security Posture

**Branch**: `006-security-posture` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-security-posture/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Inventory of every zone's SSL/TLS encryption mode, DNSSEC status, WAF
managed-ruleset presence, and rate-limiting-ruleset presence, plus the
account's Turnstile widgets (inventory-only, no judgment). SSL/TLS mode
is flagged critical/warning/safe using a direct enum-to-status mapping
(no Access-coverage logic needed here, unlike Modules 1/4/5's exposure
checks); DNSSEC/WAF/rate-limiting are each an independent
present-with-at-least-one-enabled-rule-vs-absent check. Evaluated
identically on-demand and on the existing shared schedule — the sixth
module joining Modules 1-5's established architecture without
introducing anything structurally new.

## Technical Context

**Language/Version**: TypeScript, strict — same runtime target as every
prior module.

**Primary Dependencies**: None new — reuses `hono`, plain `fetch()`.

**Storage**: Cloudflare D1. Four new finding/alert table pairs — one per
independently-evaluated zone setting: `ssl_tls_findings`/
`ssl_tls_alerts`, `dnssec_findings`/`dnssec_alerts`, `waf_findings`/
`waf_alerts`, `rate_limiting_findings`/`rate_limiting_alerts` — all
zone-keyed but kept separate per Module 4/5's established precedent (one
finding type per independently-alertable signal, even when several share
the same parent entity). Turnstile widgets are read live on each
request, never persisted — there is no evaluated status to track or diff
(research.md §5).

**Testing**: `deno test` for pure evaluation/diff logic; Playwright for
the inventory view — same tools as every prior module.

**Target Platform**: Same single Worker — sibling module directory, not a
new deployable.

**Project Type**: Same single-Worker project.

**Performance Goals**: Same shape as every prior module's SC-001 —
visible within one minute of opening the panel.

**Constraints**: Same shared API rate limit and CPU/subrequest budget
reasoning as Modules 1-5, now with six modules' worth of scheduled
evaluation sharing one Cron Trigger invocation. Per-zone SSL/TLS +
DNSSEC + WAF-ruleset + rate-limit-ruleset calls mean request volume
scales with zone count — N zones → 1 zone-list call + up to 4N
per-zone calls per run, the same shape as Module 2's per-zone record
calls; acceptable at the expected single-account scale.

**Scale/Scope**: No fixed number of zones/Turnstile widgets required;
list-based endpoints keep it correct as either grows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Access is the only gate; no bespoke IdP | ✅ PASS | Unchanged. |
| II | Defense-in-depth JWT validation, fail closed | ✅ PASS | Reuses the existing `accessAuth` middleware on `/api/security/*`. |
| III | Single Worker, shared audit logic | ✅ PASS | `evaluateSslTlsMode()`/`evaluateDnssec()`/`evaluateWaf()`/`evaluateRateLimiting()` shared by the interactive route and the existing scheduled handler — a sixth independent `waitUntil` call joins Modules 1-5's, still one Cron Trigger. |
| IV | Deno-only local toolchain | ✅ PASS | No new tooling. |
| V | Single `deno.json` | ✅ PASS | No new dependencies. |
| VI | Strict TS, tests-first, Playwright required | ✅ PASS | Same pattern. |
| VII | Never publicly reachable | ✅ PASS (inherited) | Unaffected. |
| VIII | Least-privilege secrets, read-only first | ✅ PASS | Net-new read scopes for zone settings/DNSSEC/rulesets/Turnstile — exact dashboard scope names flagged as a research risk to confirm in Polish (spec Assumptions), same as every prior module's live-account caveat. |
| IX | Every mutation audited before it counts | ✅ N/A | Detection-only (FR-013), same boundary as every prior module. |
| X | English-only, Conventional Commits | ✅ PASS | Process constraint. |

No violations — **Complexity Tracking section is not needed**.

*Post-Phase-1 re-check*: unchanged. One integration point flagged for
`tasks.md`, same as every prior module's equivalent task: this module's
scheduled evaluation joins the *existing* scheduled handler (now running
six independent evaluations) rather than adding a seventh Cron Trigger.

## Project Structure

### Documentation (this feature)

```text
specs/006-security-posture/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── api.md           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Sixth sibling module directory, same pattern as Modules 1-5. Named
`security` (short, semantic — matches how every prior module's route
prefix is shorter than its spec directory name):

```text
worker/
├── modules/
│   ├── workers-access-exposure/     # Module 1 (existing)
│   ├── dns/                          # Module 2 (existing)
│   ├── zero-trust/                   # Module 3 (existing)
│   ├── pages/                        # Module 4 (existing)
│   ├── storage/                      # Module 5 (existing)
│   └── security/
│       ├── types.ts
│       ├── inventory.ts              # zones, SSL/TLS setting, DNSSEC, WAF/rate-limit rulesets, Turnstile widgets
│       ├── evaluate.ts               # evaluateSslTlsMode(), evaluateDnssec(), evaluateWaf(), evaluateRateLimiting()
│       ├── alerts.ts                 # four diff functions
│       └── routes.ts                 # Hono router for /api/security/*
└── db/migrations/
    └── 0007_security_findings.sql

app/pages/
└── SecurityPostureInventory.tsx     # reuses ExposureStatusBadge unchanged

tests/
├── unit/
│   ├── security-evaluate.test.ts
│   ├── security-inventory.test.ts
│   └── security-alerts.test.ts
└── e2e/
    └── security-inventory.spec.ts
```

**Structure Decision**: No new architectural pattern. `App.tsx`'s nav
gains a sixth entry. Zones are fetched independently of Module 2's own
zone list, per the "duplication beats premature cross-module coupling"
precedent already applied by Modules 3-5. The WAF and rate-limiting
checks share one small helper (`hasEnabledManagedRule()`, applied to two
different ruleset phases) rather than duplicating the same logic twice —
this is intra-module reuse of genuinely identical logic, not the
cross-module coupling the "duplication beats coupling" precedent warns
against.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this section is intentionally empty (see Constitution
Check above).
