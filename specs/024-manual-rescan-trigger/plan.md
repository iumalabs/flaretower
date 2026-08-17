# Implementation Plan: Manual Re-scan Trigger

**Branch**: `024-manual-rescan-trigger` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-manual-rescan-trigger/spec.md`

## Summary

All six `POST /<module>/evaluate` endpoints already exist and need no change (research.md §1) —
this is a pure frontend feature. A new `useRescan(endpoint, onSuccess)` hook
(`app/lib/use-rescan.ts`) owns the trigger/pending/error state machine, and a small presentational
`RescanButton` component (`app/components/RescanButton.tsx`) renders it consistently. Every one of
the six module pages gets one in its header, which — because the header already renders
unconditionally once data loads, even when `run_id` is `null` — covers both "re-scan with existing
results" (US1) and "trigger the first-ever scan" (US2) simultaneously on four of the six pages.
Security Posture and Zero Trust each have a separate early-return render branch for the
never-evaluated case that bypasses the normal header entirely, so those two get a second
`RescanButton` instance in that branch, replacing the raw `<code>POST .../evaluate</code>`
instruction text there.

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2.9+

**Primary Dependencies**: React — no new dependency. No existing shared component is extended;
`EmptyState` is deliberately left untouched (research.md §2's rejected alternative).

**Storage**: N/A — no schema change, no new persisted state. The six evaluation endpoints already
write to their own modules' existing tables exactly as the scheduled cron trigger does.

**Testing**: Playwright only — no new backend logic exists to unit-test. Extends each of the six
affected pages' own existing `tests/e2e/*.spec.ts` file (research.md §5) with a success scenario, a
shared failure scenario, and (Security/Zero Trust only) a never-evaluated-empty-state scenario.

**Target Platform**: Browser (React SPA) — no Worker-side change at all, so no Cloudflare Workers
runtime consideration beyond the six routes already deployed.

**Performance Goals**: N/A beyond spec.md SC-001 (qualitative, "under 30 seconds of interaction").

**Constraints**: Must not introduce a new permission restriction (FR-008) — `useRescan` calls the
existing endpoints with no new auth header or role check. Must not mutate Cloudflare account
configuration (FR-007) — unaffected, since it only calls endpoints that already only mutate this
app's own D1 tables.

**Scale/Scope**: 1 new hook, 1 new component, 6 pages each gaining 1 or 2 integration points
(Security/Zero Trust get 2), 6 existing e2e spec files extended.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Principle I/II (Access-only auth, JWT validation)**: No change — reuses six already-gated
  routes as-is, no new route, no new auth logic. PASS.
- **Principle III (single Worker, shared audit logic)**: No change — `useRescan` calls
  `POST .../evaluate`, which already runs the exact same `runEvaluation(env, "interactive")` path
  the scheduled handler calls with `"scheduled"` (unchanged). This feature adds no new evaluation
  logic anywhere, just a UI path to the existing interactive trigger. PASS.
- **Principle IV/V (Deno-only, one config file)**: No new tooling/dependency/config file. PASS.
- **Principle VI (strict TypeScript, test-first, Playwright)**: `useRescan`/`RescanButton` are
  small enough that their behavior is fully exercised through each page's own Playwright coverage
  (research.md §5) rather than needing an isolated unit test harness for a hook with no logic
  beyond fetch/state — consistent with this codebase's existing convention of not unit-testing
  presentational-only React components. PASS.
- **Principle VII (never publicly reachable)**: Unaffected. PASS.
- **Principle VIII (least-privilege secrets)**: No new secret, no new scope — the six endpoints
  already use `CF_API_TOKEN` at whatever scope each module's own evaluation already required.
- **Principle IX (every mutation audited)**: N/A — this feature triggers zero Cloudflare-config
  mutation (FR-007); the six evaluation runs it triggers are FlareTower's own read-only detection,
  and already aren't `audit_log`-recorded today for the exact same reason every module's existing
  scheduled run isn't (they don't change Cloudflare account state).
- **Principle X (English-only, Conventional Commits)**: PASS by convention.

No violations. Proceeding to Phase 0.

**Post-design re-check** (after research.md/data-model.md/quickstart.md): research.md §3's finding
that four of six pages need only a single header integration (not a separate empty-state one)
simplified the design relative to the original per-page assumption in spec.md's grounding notes.
No new violations. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/024-manual-rescan-trigger/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory (research.md §1 — no API surface changes).

### Source Code (repository root)

```text
app/lib/
└── use-rescan.ts             # new: useRescan(endpoint, onSuccess) hook — pending/error state,
                                #   POST + refetch-on-success (data-model.md)

app/components/
└── RescanButton.tsx           # new: presentational { pending, error, onClick } — button +
                                #   inline error line, reused by all six pages

app/pages/
├── ExposureInventory.tsx      # extended: useRescan("/api/exposure/evaluate", refetch) +
│                                #   <RescanButton> in the header
├── DnsInventory.tsx            # extended: same, "/api/dns/evaluate"
├── PagesInventory.tsx          # extended: same, "/api/pages/evaluate"
├── StorageInventory.tsx        # extended: same, "/api/storage/evaluate"
├── SecurityPostureInventory.tsx # extended: same in the normal header PLUS a second
│                                #   useRescan+<RescanButton> in the run_id===null early-return
│                                #   branch, replacing its <code>POST .../evaluate</code> text
└── ZeroTrustInventory.tsx      # extended: same pattern as Security, "/api/zero-trust/evaluate"

tests/e2e/
├── exposure-inventory.spec.ts  # extended: re-scan success + failure scenarios
├── dns-inventory.spec.ts       # extended: same
├── pages-inventory.spec.ts     # extended: same
├── storage-inventory.spec.ts   # extended: same
├── security-inventory.spec.ts  # extended: success/failure + never-evaluated-empty-state scenario
└── zero-trust-inventory.spec.ts # extended: same as security
```

**Structure Decision**: Existing single-Worker + React SPA structure, unchanged — this feature adds
no backend surface at all. `app/lib/` is a new directory for the hook (mirrors the existing
`app/lib/module-badge-counts.ts` precedent for small shared frontend logic that isn't a component);
`app/components/` gets one new small presentational component alongside `EmptyState.tsx`,
`AlertBanner.tsx`, etc.

## Complexity Tracking

_No Constitution Check violations — this section is not applicable._
