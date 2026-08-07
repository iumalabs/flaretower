---

description: "Task list for Zero Trust / Access module implementation"
---

# Tasks: Zero Trust / Access

**Input**: Design documents from `/specs/003-zero-trust/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: By user story (US1 P1, US2 P1, US3 P2, US4 P2). No Setup
phase — reuses Modules 1/2's tooling entirely.

---

## Phase 1: Foundational (Blocking Prerequisites)

- [ ] T001 [P] Create D1 migration `worker/db/migrations/0004_zero_trust_findings.sql`
      for `zt_app_findings`, `zt_app_alerts`, `zt_token_findings`,
      `zt_token_alerts` per data-model.md.
- [ ] T002 Mount `/api/zero-trust/*` in `worker/index.ts`'s Hono app,
      gated by the existing `accessAuth` middleware. Stub router until
      US1.

**Checkpoint**: D1 schema and routing mount point exist.

---

## Phase 2: User Story 1 - Full account-wide inventory (Priority: P1) 🎯 MVP

**Goal**: Every Access application and every service token listed,
independent of Module 1's Worker-hostname scoping.

**Independent Test**: quickstart.md Scenario 1.

### Tests for User Story 1

- [ ] T003 [P] [US1] Unit test in `tests/unit/zero-trust-inventory.test.ts`
      (mocked `fetch`): applications and service tokens are correctly
      enumerated, including zero-policy applications and tokens with no
      `expires_at`.
- [ ] T004 [P] [US1] Playwright e2e test in
      `tests/e2e/zero-trust-inventory.spec.ts` (mocked
      `GET /api/zero-trust/inventory`): every application and token
      renders, none omitted.

### Implementation for User Story 1

- [ ] T005 [P] [US1] Implement `worker/modules/zero-trust/types.ts` and
      `inventory.ts`: list Access applications (account-wide, with
      embedded policies), list service tokens.
- [ ] T006 [US1] Implement basic `evaluateApplication()` and
      `evaluateServiceToken()` in `worker/modules/zero-trust/evaluate.ts`:
      returns `not_evaluated` on an evaluationError, `safe` otherwise for
      now (US2/US3 extend the real branches). Depends on T005's types.
- [ ] T007 [US1] Implement `GET /api/zero-trust/inventory` in
      `worker/modules/zero-trust/routes.ts`. Depends on T005, T006.
- [ ] T008 [US1] Implement `POST /api/zero-trust/evaluate`: runs
      inventory + evaluate, persists to `zt_app_findings` and
      `zt_token_findings`. Depends on T001, T006.
- [ ] T009 [P] [US1] Build `app/pages/ZeroTrustInventory.tsx`, reusing
      `ExposureStatusBadge` unchanged. Add a third nav entry to
      `app/App.tsx`.
- [ ] T010 [US1] Wire `routes.ts` into the `/api/zero-trust` mount from
      T002.

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 3: User Story 2 - Open policy flag, account-wide (Priority: P1)

**Goal**: Any application with an effectively-open policy (or zero
policies) is flagged `warning`.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [ ] T011 [P] [US2] Unit test: Allow-Everyone policy → warning; Bypass
      policy → warning; zero policies → warning; Deny-Everyone → safe
      (decision matters, not just the selector — same distinction Module
      1 already established); scoped policy → safe.
- [ ] T012 [P] [US2] Playwright e2e test: the warning badge renders for a
      mocked open-policy application.

### Implementation for User Story 2

- [ ] T013 [US2] Implement the policy-openness decision logic in
      `evaluate.ts` (research.md §2 — local re-implementation, not
      imported from Module 1) and wire it into `evaluateApplication()`.

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 4: User Story 3 - Service token expiry (Priority: P2)

**Goal**: Expired tokens → critical; expiring-within-14-days or
never-expiring tokens → warning; healthy tokens → safe.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [ ] T014 [P] [US3] Unit test: past `expires_at` → critical; `expires_at`
      within 14 days → warning; no `expires_at` at all → warning
      (research.md §3's defensive branch); far-future `expires_at` →
      safe.
- [ ] T015 [P] [US3] Playwright e2e test: critical/warning/safe token
      badges render distinctly.

### Implementation for User Story 3

- [ ] T016 [US3] Implement the expiry evaluation branch in
      `evaluateServiceToken()` per research.md §3.

**Checkpoint**: All three status-detection stories independently
functional.

---

## Phase 5: User Story 4 - Scheduled drift alerting (Priority: P2)

**Goal**: Scheduled evaluation joins the existing shared handler; alerts
on new open-policy or token-expiry findings, no repeats.

**Independent Test**: quickstart.md Scenario 4.

### Tests for User Story 4

- [ ] T017 [P] [US4] Unit test in `tests/unit/zero-trust-alerts.test.ts`:
      first-run alerting, no-repeat on unchanged state, transitions, for
      both the application-alert diff and the token-alert diff functions
      (two separate diff functions per data-model.md's two-table design).

### Implementation for User Story 4

- [ ] T018 [US4] Implement `worker/modules/zero-trust/alerts.ts` — two
      diff functions (`diffForAppAlerts`, `diffForTokenAlerts`), same
      new-vs-repeat semantics as every prior module.
- [ ] T019 [US4] **Integration point** (plan.md's Constitution Check):
      add this module's evaluation + alert-diffing to the *existing*
      `scheduled` handler in `worker/index.ts`, as a third independent
      `waitUntil` call alongside Modules 1 and 2's. Depends on T008, T018.
- [ ] T020 [US4] Implement `GET /api/zero-trust/alerts` (merges both
      alert tables with a `kind` discriminator per contracts/api.md).
      Depends on T018.
- [ ] T021 [US4] Implement
      `POST /api/zero-trust/alerts/:kind/:id/acknowledge` (routes to the
      matching table based on `:kind`). Depends on T018.

**Checkpoint**: All 4 user stories independently functional — Module 3 is
feature-complete per spec.md.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Run all 6 quickstart.md scenarios end-to-end against a real
      scratch Cloudflare test account (real-account dependency, same as
      every prior module's equivalent task).
- [ ] T023 [P] Add this module's required token scopes
      (`Access: Apps and Policies Read` — already documented for Module 1
      — and `Access: Service Tokens Read`, new) to the README.
- [ ] T024 [P] `deno fmt` + `deno lint` pass across the new
      `worker/modules/zero-trust/` and `ZeroTrustInventory.tsx` files.

---

## Dependencies & Execution Order

Same shape as Modules 1 and 2: Foundational blocks everything; US1 creates
the shared `evaluate.ts`/`inventory.ts` that US2/US3 extend; US4 depends on
US1's persistence and US3's complete evaluation, built last.

### Parallel Opportunities

T001/T002 in parallel; `[P]`-marked tests within each story in parallel;
T009 (frontend) parallel with T007/T008 (backend) within US1.

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

Both P1 — an inventory without the open-policy flag doesn't yet deliver
this module's core value, same reasoning as every prior module.

### Incremental Delivery

1. Foundational → foundation ready.
2. US1 + US2 → MVP: full inventory with open-policy detection.
3. US3 → adds service token expiry.
4. US4 → adds scheduled drift alerting, joining the shared handler as a
   third independent evaluation.

---

## Notes

- T019 is the one task touching the shared `worker/index.ts` scheduled
  handler — review it with that in mind, same caveat as Module 2's T020.
- Run `quickstart.md` in full (T022) before considering Module 3 done —
  same real-account caveat as every prior module.
