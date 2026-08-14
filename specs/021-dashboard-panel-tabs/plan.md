# Implementation Plan: Dashboard Panel Tabs

**Branch**: `021-dashboard-panel-tabs` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-dashboard-panel-tabs/spec.md`

## Summary

Four pages (Audit & Drift, Security Posture, Storage, Zero Trust) each stack 3-4 independent section
blocks vertically today, forcing a long scroll to reach a lower block. This feature adds one new
shared component, `TabStrip`, and wraps each candidate page's existing blocks in it — purely a
rendering/layout change. No data-fetching, pagination, sorting, or backend change: every block keeps
its existing fetch, state, `FindingsTable` `pagination` prop, and empty/loading handling exactly as
today, just rendered inside a tab instead of stacked. Active-tab state is a plain `useState` per
page (research.md §1 — matches this app's existing no-router precedent, corrected from the original
spec draft's incorrect assumption of URL-based state).

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2.9+

**Primary Dependencies**: React (SPA) — no new dependency; no routing library added (research.md §1)

**Storage**: N/A — no backend/data change of any kind.

**Testing**: Playwright extends each of the four candidate pages' existing e2e specs
(`tests/e2e/{audit-inventory,security-inventory,storage-inventory,zero-trust-inventory}.spec.ts`)
with tab-switching scenarios. No new unit tests needed for `TabStrip` beyond what Playwright already
exercises through the pages (it has no non-trivial logic worth isolating — active-key `useState` and
conditional rendering), consistent with this project's practice of not unit-testing trivial
presentational components (e.g. `EmptyState`, `MetricCard` have no dedicated unit tests either).

**Target Platform**: Browser (React SPA served by the Worker's `ASSETS` binding) — no Worker/
backend change at all.

**Project Type**: Web application (existing structure) — this feature touches `app/` only.

**Performance Goals**: N/A beyond the qualitative goal already captured in spec.md SC-001 (near-zero
scroll to reach any block) — no measurable perf target, since no data-fetching pattern changes.

**Constraints**: Must not change any block's existing data-fetching, pagination, sorting, or
empty/loading behavior (spec.md FR-005) — this is a pure layout wrapper around what already exists.
No URL/router changes (spec.md FR-008, research.md §1).

**Scale/Scope**: 4 pages, 1 new shared component (`TabStrip`), ~13 blocks total across the 4 pages
(Audit 4, Security 4, Storage 3, Zero Trust 3 — counting Security's currently-unlabeled first block
and Zero Trust's Groups panel, both promoted to full tabs by this feature).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Principle I/II (Access-only auth, JWT validation)**: No change — no new routes, no auth surface
  touched. PASS.
- **Principle III (single Worker, shared audit logic)**: N/A — this feature has no Worker-side code
  at all, interactive or scheduled.
- **Principle IV/V (Deno-only, one config file)**: No new tooling, no new dependency, no new config
  file. PASS.
- **Principle VI (strict TypeScript, test-first, Playwright)**: `TabStrip` is typed strictly;
  Playwright coverage added per candidate page before/alongside the page changes that use it. PASS.
- **Principle VII (never publicly reachable)**: Unaffected. PASS.
- **Principle VIII (least-privilege secrets)**: N/A — no secrets, no API calls added.
- **Principle IX (every mutation audited)**: N/A — this feature adds no mutation; it doesn't touch
  any `POST`/acknowledge flow, only how existing `GET`-driven blocks are arranged on screen.
- **Principle X (English-only, Conventional Commits)**: PASS by convention.
- **Design System section**: `docs/design.zip` has no tab-pattern precedent (confirmed via
  research.md §2) — designed in the existing visual language instead (spec.md FR-010), explicitly
  noted in the implementation PR per the constitution's own escape hatch for screens the design
  package doesn't cover.

No violations. Proceeding to Phase 0.

**Post-design re-check** (after research.md/data-model.md/quickstart.md): no new violations surfaced
during design. The one substantive correction from Phase 0 (dropping URL-based tab state,
research.md §1) _removed_ scope rather than adding complexity, so it doesn't introduce a new gate
concern. Still PASS across all principles.

## Project Structure

### Documentation (this feature)

```text
specs/021-dashboard-panel-tabs/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory — this feature has no interface exposed to users or other systems beyond
the app's own internal component API (`TabStrip`'s props), which data-model.md documents directly; a
`contracts/` directory would duplicate that with nothing new to say (research.md §3 on why prior
UI-only specs in this repo, e.g. 009-design-system-alignment, also skip it).

### Source Code (repository root)

```text
app/components/
└── TabStrip.tsx                           # NEW: shared tab-strip component. Props: an ordered
                                            #   list of { key, label, content } entries, uncontrolled
                                            #   (owns its own active-key state, defaulting to the
                                            #   first entry) per research.md §1's component-state
                                            #   decision. Renders a row of tab buttons (existing
                                            #   chip-button visual language, research.md §2) plus
                                            #   only the active entry's `content`.

app/pages/AuditInventory.tsx               # extended: Audit log / Unified alerts inbox / What
                                            #   changed / Account-wide posture summary become 4
                                            #   TabStrip entries; the account-wide criticalAlert
                                            #   banner (currently positioned between the 1st and
                                            #   2nd block, data-model.md §1) moves above the
                                            #   TabStrip so it stays visible on every tab (FR-006)

app/pages/SecurityPostureInventory.tsx     # extended: Zones (today unlabeled — gains a "Zones" tab
                                            #   label) / Certificates / WAF custom rules / Turnstile
                                            #   widgets become 4 TabStrip entries

app/pages/StorageInventory.tsx             # extended: R2 buckets / KV namespaces / D1 databases
                                            #   become 3 TabStrip entries — simplest case, no
                                            #   inter-block coupling to preserve

app/pages/ZeroTrustInventory.tsx           # extended: Access applications (app-picker chips +
                                            #   PolicyDetailPanel stay coupled to this tab, per the
                                            #   user's explicit 3-tab decision) / Access Groups
                                            #   (GroupsPanel, decoupled from the applications
                                            #   selection — data-model.md §2 confirms no dependency)
                                            #   / Service tokens become 3 TabStrip entries

tests/e2e/
├── audit-inventory.spec.ts                # extended: tab-switching scenario (US1/US2)
├── security-inventory.spec.ts             # extended: tab-switching scenario, including the
                                            #   unlabeled-today Zones block's new tab label
├── storage-inventory.spec.ts              # extended: tab-switching scenario
└── zero-trust-inventory.spec.ts           # extended: tab-switching scenario, including US2's
                                            #   state-preservation check (page/sort/selected-app
                                            #   surviving a tab switch away and back)
```

**Structure Decision**: Existing React SPA structure, unchanged (`app/components/` for the one new
shared component, `app/pages/` for the four extended pages) — no new top-level directory, no backend
change, following the same "one shared component, extended per page" pattern `FindingsTable` already
established for pagination (specs/020-list-pagination).

## Complexity Tracking

_No Constitution Check violations — this section is not applicable._
