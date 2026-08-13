# Implementation Plan: DNS Dashboard

**Branch**: `013-dns-dashboard` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-dns-dashboard/spec.md`

## Summary

Upgrades the existing DNS page (Module 2) in place — same `dns` nav key, no nav split (unlike spec
012) — to a zone-tabbed, bespoke records view per the design's §09 mockup: one zone's records at a
time, a Proxy status column distinct from the existing Finding column, a newly-captured TTL column,
and two new Finding-adjacent signals (an ineffective DMARC policy warning, and an informational
"points at a Cloudflare platform domain" label). All three new signals are computed from data this
module already fetches — no new Cloudflare API call, no new token scope (unlike spec 012).

## Technical Context

**Language/Version**: TypeScript (strict), React 19, Deno 2 runtime — unchanged.

**Primary Dependencies**: None new.

**Storage**: One new D1 migration — adds a nullable `ttl INTEGER` column to the existing
`dns_findings` table (research.md §1). No new table.

**Testing**: `deno test` for the new pure functions (DMARC policy parse, platform-domain match — both
trivially unit-testable, Constitution Principle VI); Playwright for the page (zone-tab switching,
Proxy/TTL columns, DMARC warning, platform-domain label, per-zone empty state).

**Target Platform**: Browser SPA + existing `worker/modules/dns/*` backend module (extended, not
replaced).

**Project Type**: Existing single-Worker web application — no new page, no new nav item, no new
backend module directory; extends `worker/modules/dns/{types,inventory,evaluate,routes}.ts` and
rewrites `app/pages/DnsInventory.tsx`.

**Performance Goals**: No new SLA — same "operator opens a page and sees current data without a
noticeable stall" bar as every other module.

**Constraints**: MUST NOT fabricate a DMARC finding for a zone with no `_dmarc` record (spec.md Edge
Cases). MUST NOT add any Cloudflare-mutating or export control (spec.md FR-010).

**Scale/Scope**: One new D1 migration, small additions to 4 existing backend files, one frontend page
rewrite. No new shared component (research.md §4 — zone-tab UI is DNS-specific, not reused by
specs 014-018 per the design's own per-module layouts).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
| --- | --- | --- |
| I. Access is the only gate | N/A | No identity/auth code touched. |
| II. Defense-in-depth JWT validation | Pass | Existing `/api/dns/*` routes, already behind `accessAuth` — unchanged. |
| III. Single Worker, shared audit logic | Pass | Extends Module 2's existing `runDnsEvaluation`/scheduled-handler entry point in place — no second, parallel evaluation path. |
| IV. Deno-only local toolchain | Pass | No new dependency. |
| V. One configuration file | Pass | No new config file class. |
| VI. Strict TypeScript, test-first, Playwright | Pass (gate for implementation) | DMARC-parse and platform-domain-match are pure functions, tested first; Playwright covers the rewritten page's new states. |
| VII. Never publicly reachable | Pass | Unaffected. |
| VIII. Least-privilege secrets | Pass | Zero new token scope (research.md — every new signal is computed from data already fetched). |
| IX. Every mutation is audited | N/A | No Cloudflare-account mutation in this feature (spec.md FR-010). |
| X. English-only, Conventional Commits | Pass | Unaffected. |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/013-dns-dashboard/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
worker/db/migrations/0009_dns_findings_add_ttl.sql   # new — ttl INTEGER, nullable

worker/modules/dns/types.ts       # + ttl, isPlatformTarget fields
worker/modules/dns/inventory.ts   # + parse ttl from the existing dns_records fetch
worker/modules/dns/evaluate.ts    # + evaluateDmarcPolicy(), isPlatformTargetDomain() pure functions
worker/modules/dns/routes.ts      # + persist/read ttl; response includes ttl + isPlatformTarget

app/pages/DnsInventory.tsx        # rewritten: zone tabs + Proxy/TTL columns, reuses FindingsTable unchanged

tests/unit/dns-evaluate.test.ts   # extended: DMARC + platform-domain cases
tests/e2e/dns-inventory.spec.ts   # extended: zone tabs, Proxy/TTL, DMARC warning, platform-domain label
```

**Structure Decision**: Extends Module 2's existing files in place rather than a new module directory
— this spec has no new Cloudflare API surface (unlike spec 012), so there's no new backend module to
create, only existing files to extend.

## Complexity Tracking

No violations — table not needed.
