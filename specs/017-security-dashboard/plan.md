# Implementation Plan: Security Dashboard

**Branch**: `017-security-dashboard` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-security-dashboard/spec.md`

## Summary

Restructure the Security page's existing 4 zone checks (SSL/TLS, DNSSEC, WAF, Rate Limiting) from
today's one-row-per-check flattening into one row per zone with a rolled-up overall status. Add 3
new zone-level checks (Bot Fight Mode, Always Use HTTPS, Minimum TLS Version) as additional
persisted/alertable columns on the same table, following this module's own established
independent-finding-table-per-check precedent. Add two live-fetched, unpersisted panels below the
zone table (Certificates, WAF Custom Rules), mirroring spec 014's Access Groups panel precedent.
The Turnstile widgets section is untouched.

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2.9+

**Primary Dependencies**: Hono (Worker routing), React (SPA), Cloudflare Workers/D1 bindings, Deno
test runner, Playwright (`npm:@playwright/test` via Deno)

**Storage**: Cloudflare D1 — extends `worker/db/migrations/0007_security_findings.sql`'s 4
existing finding/alert table pairs with 3 new pairs (Bot Fight Mode, Always Use HTTPS, Minimum TLS
Version), following that migration's own stated precedent. Certificates/WAF Custom Rules are NOT
persisted (live-fetched only, like the Access Groups panel).

**Testing**: `deno test` for unit tests (`worker/modules/security/*.ts`), Playwright for
`app/pages/SecurityPostureInventory.tsx`'s user-facing flow

**Target Platform**: Cloudflare Workers (single Worker, `fetch` + `scheduled` handlers)

**Project Type**: Web application (Worker backend + React SPA, single repo, no separate
frontend/backend projects)

**Performance Goals**: N/A — read-only dashboard, no new performance-sensitive path

**Constraints**: No new Cloudflare API token scope (all new endpoints use the same zone-settings/
zone-read access already granted); Workers' 6-concurrent-connection outbound fetch limit
(mapWithConcurrency caps already established in this module, extended for the new per-zone
fetches)

**Scale/Scope**: 3 independently-shippable stories: (1) zone-row restructuring of 4 existing
checks, zero new API calls; (2) 3 new persisted/alertable zone checks; (3) 2 new live-fetched,
unpersisted panels

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I/II (Access-only auth, JWT validation)**: No change — reuses the existing
  `/api/security/*` routes already behind the same JWT middleware. PASS.
- **Principle III (single Worker, shared audit logic)**: All new fetches and evaluations are added
  to `worker/modules/security/inventory.ts`/`evaluate.ts`, invoked identically by
  `runSecurityEvaluation()` for both the interactive `POST /evaluate` and the scheduled handler —
  no divergent path. PASS.
- **Principle IV/V (Deno-only, one config file)**: No new tooling, no new config file. PASS.
- **Principle VI (strict TypeScript, test-first, Playwright)**: Unit tests for the zone-row
  rollup, the 3 new checks, and the 2 new live-fetched panels land before/alongside the
  implementation; Playwright coverage extends `tests/e2e/security-inventory.spec.ts`. PASS.
- **Principle VII (never publicly reachable)**: Unaffected. PASS.
- **Principle VIII (least-privilege secrets)**: No new Cloudflare API token scope — Bot Fight
  Mode/Always Use HTTPS/Minimum TLS Version use the same generic zone-settings read access this
  module's SSL/TLS check already exercises; Certificates and WAF Custom Rules use zone-read access
  already granted for this module's other zone-scoped calls. README's token-scope table needs no
  change. PASS.
- **Principle IX (every mutation audited)**: This feature adds no mutation — read-only, like every
  other module's dashboard. N/A.
- **Principle X (English-only, Conventional Commits)**: PASS by convention.

No violations. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/017-security-dashboard/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
worker/
├── db/migrations/
│   └── 0013_security_findings_add_bot_https_min_tls.sql   # NEW
└── modules/security/
    ├── types.ts       # extended: 3 new checks, rollup status, cert/WAF-rule panel types
    ├── inventory.ts   # extended: 3 new zone-setting fetches, cert-pack fetch, custom-WAF fetch
    ├── evaluate.ts     # extended: 3 new pure evaluate fns + zone rollup; existing 4 unchanged
    ├── routes.ts       # extended: persist/read 3 new checks; live-fetch cert/WAF-rule panels
    └── alerts.ts       # extended: 3 new diff functions, mirroring the existing 4

app/pages/
└── SecurityPostureInventory.tsx   # rewritten: one row per zone (7 checks + rollup),
                                    # Certificates panel, WAF Custom Rules panel;
                                    # Turnstile section unchanged

tests/unit/
├── security-inventory.test.ts   # extended
├── security-evaluate.test.ts    # extended
├── security-alerts.test.ts      # extended
└── security-routes.test.ts      # NEW (mirrors storage-routes.test.ts precedent)

tests/e2e/
└── security-inventory.spec.ts   # extended
```

**Structure Decision**: Single Cloudflare Worker + React SPA (existing project structure,
unchanged). This feature touches only `worker/modules/security/` and
`app/pages/SecurityPostureInventory.tsx` plus their tests — no new top-level directories.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
