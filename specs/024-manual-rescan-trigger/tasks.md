---

description: "Task list for Manual Re-scan Trigger"

---

# Tasks: Manual Re-scan Trigger

**Input**: Design documents from `/specs/024-manual-rescan-trigger/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Playwright e2e coverage is explicitly called for by plan.md (Testing section, research.md §5)
and the project's Definition of Done — included below, extending each page's existing spec file.

**Organization**: Tasks are grouped by user story. No backend work exists (research.md §1 — zero
API change); this is a pure frontend feature.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

## Path Conventions

Existing single-Worker + React SPA structure (see plan.md Project Structure) — `app/lib/`,
`app/components/`, `app/pages/`, `tests/e2e/` at repository root.

---

## Phase 1: Setup

No project initialization needed — existing Deno/React project, no new dependency or config
(plan.md Technical Context). Nothing to do in this phase.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared hook and component every user story's page integrations depend on, plus the
mechanical refetch-extraction refactor research.md §4 identified as needed before `onSuccess` wiring
is possible on any page.

**⚠️ CRITICAL**: No per-page integration (Phase 3+) can begin until this phase is complete.

- [X] T001 [P] Implement `useRescan(endpoint, onSuccess)` hook in `app/lib/use-rescan.ts` per
  data-model.md's state machine: `trigger()` sets `pending: true, error: null`; POST to `endpoint`
  resolving 2xx calls `onSuccess()` then `pending: false`; POST rejecting or resolving non-2xx sets
  `error: "Re-scan failed: <message>"` and `pending: false` without calling `onSuccess()` (FR-005).
- [X] T002 [P] Implement `RescanButton` presentational component in `app/components/RescanButton.tsx`
  per data-model.md: props `{ pending, error, onClick }`; renders a button labeled "Re-scan" that
  swaps to "Scanning…" and becomes `disabled` while `pending` (FR-004); renders an inline error line
  below the button using `var(--status-critical-fg)` when `error` is set.
- [X] T003 [P] In `app/pages/ExposureInventory.tsx`, extract the existing `useEffect`'s
  `fetchInventory().then(setData).catch(...)` call into a named, re-invokable function (e.g.
  `refetch`) called both from the `useEffect` (mount) and available for reuse — mechanical
  refactor, no behavior change (research.md §4).
- [X] T004 [P] In `app/pages/DnsInventory.tsx`, same extraction as T003 for its inventory fetch
  function (mind its `[selectedZone, page, sortKey, sortDir]` effect deps — the extracted function
  must close over the same values the effect already depends on).
- [X] T005 [P] In `app/pages/PagesInventory.tsx`, same extraction as T003.
- [X] T006 [P] In `app/pages/StorageInventory.tsx`, same extraction as T003.
- [X] T007 [P] In `app/pages/SecurityPostureInventory.tsx`, same extraction as T003.
- [X] T008 [P] In `app/pages/ZeroTrustInventory.tsx`, same extraction as T003.

**Checkpoint**: Hook, component, and every page's refetch function are ready — user story
integration (Phase 3+) can now proceed, one page at a time or in parallel.

---

## Phase 3: User Story 1 - Confirm a fix cleared a finding, on demand (Priority: P1) 🎯 MVP

**Goal**: Every one of the six module dashboards offers a working re-scan control in its header that
re-runs evaluation and refreshes the page's findings in place.

**Independent Test**: From any of the six module dashboards showing existing results, trigger a
re-scan and confirm the page's data refreshes to reflect the just-completed scan, without navigating
away or manually reloading (per quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T009 [P] [US1] In `app/pages/ExposureInventory.tsx`, call
  `useRescan("/api/exposure/evaluate", refetch)` (T003's function) and render `<RescanButton>` in the
  page header next to the `<h1>`.
- [X] T010 [P] [US1] In `app/pages/DnsInventory.tsx`, call `useRescan("/api/dns/evaluate", refetch)`
  and render `<RescanButton>` in the page header.
- [X] T011 [P] [US1] In `app/pages/PagesInventory.tsx`, call
  `useRescan("/api/pages/evaluate", refetch)` and render `<RescanButton>` in the page header.
- [X] T012 [P] [US1] In `app/pages/StorageInventory.tsx`, call
  `useRescan("/api/storage/evaluate", refetch)` and render `<RescanButton>` in the page header.
- [X] T013 [P] [US1] In `app/pages/SecurityPostureInventory.tsx`, call
  `useRescan("/api/security/evaluate", refetch)` and render `<RescanButton>` in the normal (loaded)
  page header — the `run_id === null` early-return branch is handled separately in US2 (T017).
- [X] T014 [P] [US1] In `app/pages/ZeroTrustInventory.tsx`, call
  `useRescan("/api/zero-trust/evaluate", refetch)` and render `<RescanButton>` in the normal (loaded)
  page header — the `run_id === null` early-return branch is handled separately in US2 (T018).

### Tests for User Story 1

- [X] T015 [P] [US1] In `tests/e2e/exposure-inventory.spec.ts`,
  `tests/e2e/dns-inventory.spec.ts`, `tests/e2e/pages-inventory.spec.ts`,
  `tests/e2e/storage-inventory.spec.ts`, `tests/e2e/security-inventory.spec.ts`, and
  `tests/e2e/zero-trust-inventory.spec.ts`: add a re-scan success scenario per file (mock
  `POST .../evaluate` → 202, mock the inventory refetch to return updated data, assert the button
  shows "Scanning…" then reverts to "Re-scan" and the new data renders) and a shared re-scan failure
  scenario per file (mock `POST .../evaluate` → 500, assert an inline error appears and the
  page's pre-existing findings are unchanged — FR-005). One task per file, six files total, all
  independent of each other.

**Checkpoint**: User Story 1 is fully functional and independently testable on all six pages.

---

## Phase 4: User Story 2 - Trigger the first-ever scan for a never-evaluated module (Priority: P2)

**Goal**: Security Posture and Zero Trust's never-evaluated empty state offers the same re-scan
control in place of the raw `curl` instruction; Exposure, DNS, Pages, and Storage already satisfy
this via their Phase 3 header integration (research.md §3 — their header renders unconditionally
even when `run_id` is `null`, so no additional task is needed for those four pages).

**Independent Test**: Open a module dashboard with no evaluation history. Confirm the empty state
offers a way to trigger a scan directly, and that doing so transitions the page from the empty state
to showing real results once the scan completes (per quickstart.md Scenario 3).

### Implementation for User Story 2

- [X] T016 [US2] In `app/pages/SecurityPostureInventory.tsx`, in the `if (data && data.run_id ===
  null)` early-return block (around line 409), replace the
  `No evaluation runs yet. Trigger one via <code>POST /api/security/evaluate</code>.` text with a
  second `useRescan("/api/security/evaluate", refetch)` call and `<RescanButton>` instance
  (data-model.md — a second call site is required since this branch renders instead of, not
  alongside, the normal header).
- [X] T017 [US2] In `app/pages/ZeroTrustInventory.tsx`, in the `if (data && data.run_id === null)`
  early-return block (around line 417), replace the
  `No evaluation runs yet. Trigger one via <code>POST /api/zero-trust/evaluate</code>.` text with a
  second `useRescan("/api/zero-trust/evaluate", refetch)` call and `<RescanButton>` instance, same
  pattern as T016.

### Tests for User Story 2

- [X] T018 [P] [US2] In `tests/e2e/security-inventory.spec.ts`, add a never-evaluated-empty-state
  scenario: mock a `GET /api/security/inventory` response with `run_id: null`, assert the empty
  state renders a "Re-scan" control with no raw-`curl` instruction text, click it, mock
  `POST /api/security/evaluate` → 202 and a refetch returning real findings, assert the page
  transitions from the empty state to showing those findings.
- [X] T019 [P] [US2] In `tests/e2e/zero-trust-inventory.spec.ts`, same scenario as T018 for the
  Zero Trust module.

**Checkpoint**: User Stories 1 AND 2 both work independently across all six pages.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T020 Run `deno fmt` and `deno lint` across all changed files.
- [X] T021 Run the full Playwright suite (`deno task test:e2e` or equivalent) — required before push
  per this project's standing convention, not just the six extended spec files.
- [X] T022 Walk through quickstart.md Scenarios 1-3 manually against `deno task dev` to confirm the
  feature works end-to-end, not just under mocked Playwright conditions. Done via `deno task dev` +
  Chrome, with `window.fetch` patched in-page to stand in for a live Cloudflare account (none
  available in this environment) — confirmed the header Re-scan button (Exposure) and the
  never-evaluated empty-state Re-scan button (Security Posture) both render and the
  pending/"Scanning…" transition works.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — no tasks.
- **Foundational (Phase 2)**: No dependencies — T001/T002 (hook/component) and T003-T008 (per-page
  refetch extraction) are all mutually independent `[P]` tasks. BLOCKS Phase 3 and Phase 4.
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion (needs the hook, component, and that
  page's extracted refetch function). The six pages' integration tasks (T009-T014) are independent
  of each other.
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion. T016/T017 do NOT depend on Phase 3's
  T013/T014 (different render branch, same file) but touching the same file means T013+T016 (both
  in SecurityPostureInventory.tsx) and T014+T017 (both in ZeroTrustInventory.tsx) should not run as
  literal concurrent edits — sequence those two pairs, everything else can parallelize.
- **Polish (Phase 5)**: Depends on Phases 3 and 4 both being complete.

### Within Each User Story

- Implementation tasks before their own test tasks' assertions can pass, but per this project's
  Definition of Done, tests should be written alongside implementation, not deferred.
- Story complete before moving to the next priority, though nothing technically blocks working US2
  before US1 finishes since they touch non-overlapping render branches (aside from the same-file
  note above).

### Parallel Opportunities

- T001-T008 (all of Phase 2) can run in parallel — eight independent files.
- T009-T014 (Phase 3 implementation) can run in parallel — six independent pages.
- T015's six per-file test additions can run in parallel with each other, though each depends on
  its own page's T009-T014 task being done first.
- T016/T017 (Phase 4 implementation) can run in parallel with each other (different files), but each
  should sequence after its own page's Phase 3 task (T013 before T016, T014 before T017) since both
  touch the same file.
- T018/T019 (Phase 4 tests) can run in parallel with each other.

---

## Parallel Example: Phase 2 (Foundational)

```bash
Task: "Implement useRescan hook in app/lib/use-rescan.ts"
Task: "Implement RescanButton component in app/components/RescanButton.tsx"
Task: "Extract refetch function in app/pages/ExposureInventory.tsx"
Task: "Extract refetch function in app/pages/DnsInventory.tsx"
Task: "Extract refetch function in app/pages/PagesInventory.tsx"
Task: "Extract refetch function in app/pages/StorageInventory.tsx"
Task: "Extract refetch function in app/pages/SecurityPostureInventory.tsx"
Task: "Extract refetch function in app/pages/ZeroTrustInventory.tsx"
```

## Parallel Example: Phase 3 (User Story 1 implementation)

```bash
Task: "Wire useRescan + RescanButton into ExposureInventory.tsx header"
Task: "Wire useRescan + RescanButton into DnsInventory.tsx header"
Task: "Wire useRescan + RescanButton into PagesInventory.tsx header"
Task: "Wire useRescan + RescanButton into StorageInventory.tsx header"
Task: "Wire useRescan + RescanButton into SecurityPostureInventory.tsx header"
Task: "Wire useRescan + RescanButton into ZeroTrustInventory.tsx header"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (hook, component, six refetch extractions).
2. Complete Phase 3: User Story 1 (all six pages get a working header re-scan control).
3. **STOP and VALIDATE**: Run quickstart.md Scenarios 1-2 manually; run T015's Playwright coverage.
4. This alone closes issue #414's primary story and SC-001/SC-002/SC-003.

### Incremental Delivery

1. Foundational → six pages get header re-scan (US1, MVP) → validate → this is deployable alone.
2. Add US2 (Security/Zero Trust empty-state re-scan) → validate → closes SC-004, issue #414 in full.
3. Polish (fmt/lint/full e2e/quickstart walkthrough) → ready to open a PR.

---

## Notes

- No contract tests, no new models/entities, no backend tasks — confirmed zero API surface change
  (research.md §1, plan.md Constitution Check Principle III).
- `EmptyState.tsx` is intentionally untouched by every task above (research.md §2's rejected
  alternative) — do not add `ctaPending`/error props to it as part of any task here.
- [P] tasks touch different files; sequence same-file task pairs as called out above.
- Commit after each task or logical group; stop at either checkpoint to validate independently.
