# Implementation Plan: Access Dashboard

**Branch**: `014-access-dashboard` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-access-dashboard/spec.md`

## Summary

Upgrades the Applications half of the existing Zero Trust page in place — same `zero-trust` nav key,
Service Tokens section unchanged — per the design's §10 mockup: a bespoke table (Covers/Policies/
Identity/Session columns alongside the existing, unchanged health status), a Policy detail panel for
a selected application (plain-language ALLOW/REQUIRE/DENY rule breakdown), and a Groups panel. Most
new data (session duration, multi-hostname coverage, raw policy rules) is already in the existing
Cloudflare API call this module makes; two genuinely new calls are added (Identity Providers, Access
Groups), both assumed to sit under the existing token scope (research.md §6).

## Technical Context

**Language/Version**: TypeScript (strict), React 19, Deno 2 runtime — unchanged.

**Primary Dependencies**: None new.

**Storage**: One new D1 migration — five nullable columns on the existing `zt_app_findings` table
(research.md §5). Access Groups are read live, not persisted (research.md §3).

**Testing**: `deno test` for the rule-humanizer and group-reference-count pure functions
(exhaustively testable, Constitution Principle VI); Playwright for the page (table columns, policy
detail selection + rule rendering + unrecognized-rule fallback, Groups panel + its own failure state).

**Target Platform**: Browser SPA + existing `worker/modules/zero-trust/*` backend module (extended).

**Project Type**: Existing single-Worker web application — no new page, no new nav item; extends
`worker/modules/zero-trust/{types,inventory,evaluate,routes}.ts` and rewrites the Applications half
of `app/pages/ZeroTrustInventory.tsx` (Service Tokens half unchanged).

**Performance Goals**: No new SLA — same bar as every other module.

**Constraints**: MUST NOT introduce a new severity tier for applications (spec.md FR-002). MUST NOT
fabricate a Group member count (research.md §3). MUST NOT let a Groups-fetch failure block the
applications table or policy detail (spec.md FR-008). MUST NOT include the hostname-coverage
narrative in the policy detail panel (spec.md FR-007).

**Scale/Scope**: One new D1 migration, extensions to 4 existing backend files, one new pure
rule-humanizer module, one frontend page rewrite (Applications half only).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
| --- | --- | --- |
| I. Access is the only gate | N/A | No identity/auth code touched. |
| II. Defense-in-depth JWT validation | Pass | Existing `/api/zero-trust/*` routes, already behind `accessAuth` — unchanged. |
| III. Single Worker, shared audit logic | Pass | Extends Module 3's existing `runZeroTrustEvaluation`/scheduled-handler entry point in place. |
| IV. Deno-only local toolchain | Pass | No new dependency. |
| V. One configuration file | Pass | No new config file class. |
| VI. Strict TypeScript, test-first, Playwright | Pass (gate for implementation) | Rule-humanizer and group-reference-count are pure functions, tested first; Playwright covers the rewritten page's new states. |
| VII. Never publicly reachable | Pass | Unaffected. |
| VIII. Least-privilege secrets | Pass, pending live confirmation | Two new Cloudflare API calls (Identity Providers, Groups), assumed to need no new token scope beyond the existing `Access: Apps and Policies Read` (research.md §6) — confirmed or corrected at quickstart.md, no new scope requested speculatively. |
| IX. Every mutation is audited | N/A | No Cloudflare-account mutation in this feature (spec.md FR-006). |
| X. English-only, Conventional Commits | Pass | Unaffected. |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/014-access-dashboard/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
worker/db/migrations/0010_zt_app_findings_add_policy_detail.sql   # new — 5 nullable columns

worker/modules/zero-trust/types.ts       # + new AccessApplication/AppEvaluation fields, AccessGroup, PolicyRuleLine
worker/modules/zero-trust/inventory.ts   # + listIdentityProviders(), listAccessGroups(), richer app parsing
worker/modules/zero-trust/rule-humanizer.ts   # new — pure functions (research.md §4)
worker/modules/zero-trust/evaluate.ts    # + attach policy_count/covered_hostname_count/identity_summary/session_duration/policy rules to AppEvaluation (status/reason logic unchanged)
worker/modules/zero-trust/routes.ts      # + persist/read new columns; live Groups read in GET /inventory

app/pages/ZeroTrustInventory.tsx   # Applications half rewritten (bespoke table + policy detail + groups panel); Service Tokens half unchanged

tests/unit/zero-trust-rule-humanizer.test.ts   # new
tests/unit/zero-trust-evaluate.test.ts         # extended
tests/e2e/zero-trust-inventory.spec.ts         # extended
```

**Structure Decision**: Extends Module 3's existing files in place, plus one new pure-function module
(`rule-humanizer.ts`) kept separate since it's substantial enough (multiple rule types) to warrant
its own file and its own focused unit tests, mirroring how `classify.ts` was split out in spec 012.

## Complexity Tracking

No violations — table not needed.
