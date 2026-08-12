---

description: "Task list for Pages module implementation"
---

# Tasks: Pages

**Input**: Design documents from `/specs/004-pages/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: By user story (US1 P1, US2 P1, US3 P2, US4 P2). No Setup
phase — reuses Modules 1-3's tooling entirely.

---

## Phase 1: Foundational (Blocking Prerequisites)

- [x] T001 [P] Create D1 migration `worker/db/migrations/0005_pages_findings.sql`
      for `pages_domain_findings`, `pages_domain_alerts`,
      `pages_subdomain_findings`, `pages_subdomain_alerts`,
      `pages_deployment_findings`, `pages_deployment_alerts` per
      data-model.md.
- [x] T002 Mount `/api/pages/*` in `worker/index.ts`'s Hono app, gated by
      the existing `accessAuth` middleware. Stub router until US1.

**Checkpoint**: D1 schema and routing mount point exist.

---

## Phase 2: User Story 1 - Full inventory, custom domain status (Priority: P1) 🎯 MVP

**Goal**: Every Pages project and every one of its custom domains listed,
with each domain's active/non-active state correctly distinguished.

**Independent Test**: quickstart.md Scenario 1.

### Tests for User Story 1

- [x] T003 [P] [US1] Unit test in `tests/unit/pages-inventory.test.ts`
      (mocked `fetch`): projects and their custom domains are correctly
      enumerated, including a project with zero custom domains.
- [x] T004 [P] [US1] Playwright e2e test in
      `tests/e2e/pages-inventory.spec.ts` (mocked
      `GET /api/pages/inventory`): every project and every custom domain
      renders, none omitted.

### Implementation for User Story 1

- [x] T005 [P] [US1] Implement `worker/modules/pages/types.ts` and
      `inventory.ts`: list Pages projects
      (`GET /accounts/{account_id}/pages/projects`), list each project's
      custom domains
      (`GET /accounts/{account_id}/pages/projects/{name}/domains`) per
      research.md §1.
- [x] T006 [US1] Implement `evaluateCustomDomain()` in
      `worker/modules/pages/evaluate.ts` (active → safe, any other status
      → warning, evaluationError → not_evaluated), plus stub
      `evaluateSubdomainExposure()`/`evaluateDeployment()` returning
      `not_evaluated` for now (US2/US3 implement the real branches).
      Depends on T005's types.
- [x] T007 [US1] Implement `GET /api/pages/inventory` in
      `worker/modules/pages/routes.ts` per contracts/api.md's nested
      shape. Depends on T005, T006.
- [x] T008 [US1] Implement `POST /api/pages/evaluate`: runs inventory +
      evaluate, persists to `pages_domain_findings` (real) and
      `pages_subdomain_findings`/`pages_deployment_findings` (stubbed
      `not_evaluated` for now). Depends on T001, T006.
- [x] T009 [P] [US1] Build `app/pages/PagesInventory.tsx`, reusing
      `ExposureStatusBadge` unchanged. Add a fourth nav entry to
      `app/App.tsx`.
- [x] T010 [US1] Wire `routes.ts` into the `/api/pages` mount from T002.

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 3: User Story 2 - `pages.dev` exposure flag (Priority: P1)

**Goal**: Every project's `<name>.pages.dev` subdomain is flagged critical
when uncovered by any Access application, warning when covered but
effectively open, safe when covered by a meaningfully-scoped policy.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [x] T011 [P] [US2] Unit test: uncovered `pages.dev` subdomain →
      critical; covered by an Allow-Everyone or zero-policy application →
      warning; covered by a Bypass-policy application → warning; covered
      by a scoped-policy application → safe (same distinctions Module 1
      and Module 3 already established).
- [x] T012 [P] [US2] Playwright e2e test: the critical, warning, and safe
      subdomain-exposure badges render distinctly for mocked projects.

### Implementation for User Story 2

- [x] T013 [US2] Extend `worker/modules/pages/inventory.ts` to also fetch
      Access applications (`GET /accounts/{account_id}/access/apps`) per
      research.md §2, independently of Modules 1/3's own fetches.
- [x] T014 [US2] Implement the hostname-coverage and policy-openness
      decision logic in `evaluate.ts` (research.md §2 — local
      re-implementation, not imported from Module 1 or Module 3) and wire
      it into `evaluateSubdomainExposure()`, replacing US1's stub. Persist
      real values in `POST /api/pages/evaluate` (T008) and surface them in
      `GET /api/pages/inventory` (T007).

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 4: User Story 3 - Production deployment health (Priority: P2)

**Goal**: A project whose latest production deployment failed, or that
has no production deployment yet, is flagged warning; a successful latest
production deployment is safe.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [x] T015 [P] [US3] Unit test: latest production deployment
      `latest_stage.status === "failure"` (or any non-`"success"` terminal
      state) → warning; no production deployment in the list → warning;
      `"success"` → safe.
- [x] T016 [P] [US3] Playwright e2e test: the warning and safe deployment
      health badges render distinctly for mocked projects.

### Implementation for User Story 3

- [x] T017 [US3] Extend `worker/modules/pages/inventory.ts` to fetch each
      project's most recent production deployment
      (`GET /accounts/{account_id}/pages/projects/{name}/deployments?env=production`,
      index `0` of the response) per research.md §1.
- [x] T018 [US3] Implement the deployment-health branch in
      `evaluateDeployment()`, replacing US1's stub. Persist real values in
      `POST /api/pages/evaluate` (T008) and surface them in
      `GET /api/pages/inventory` (T007).

**Checkpoint**: All three status-detection stories independently
functional.

---

## Phase 5: User Story 4 - Scheduled drift alerting (Priority: P2)

**Goal**: Scheduled evaluation joins the existing shared handler; alerts
on new domain, subdomain-exposure, or deployment-health findings, no
repeats.

**Independent Test**: quickstart.md Scenario 4.

### Tests for User Story 4

- [x] T019 [P] [US4] Unit test in `tests/unit/pages-alerts.test.ts`:
      first-run alerting, no-repeat on unchanged state, transitions, for
      all three diff functions (domain, subdomain exposure, deployment
      health — three separate diff functions per data-model.md's
      three-table design).

### Implementation for User Story 4

- [x] T020 [US4] Implement `worker/modules/pages/alerts.ts` — three diff
      functions (`diffForDomainAlerts`, `diffForSubdomainAlerts`,
      `diffForDeploymentAlerts`), same new-vs-repeat semantics as every
      prior module.
- [x] T021 [US4] **Integration point** (plan.md's Constitution Check):
      add this module's evaluation + alert-diffing to the *existing*
      `scheduled` handler in `worker/index.ts`, as a fourth independent
      `waitUntil` call alongside Modules 1-3's. Depends on T008, T014,
      T018, T020.
- [x] T022 [US4] Implement `GET /api/pages/alerts` (merges all three
      alert tables with a `kind` discriminator per contracts/api.md).
      Depends on T020.
- [x] T023 [US4] Implement
      `POST /api/pages/alerts/:kind/:id/acknowledge` (routes to the
      matching table based on `:kind`). Depends on T020.

**Checkpoint**: All 4 user stories independently functional — Module 4 is
feature-complete per spec.md.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T024 [P] Run all 6 quickstart.md scenarios end-to-end against a real
      scratch Cloudflare test account (real-account dependency, same as
      every prior module's equivalent task).
- [x] T025 [P] Add this module's required token scopes (`Cloudflare Pages
      Read`, new, and `Access: Apps and Policies Read` — already
      documented for Modules 1 and 3) to the README.
- [x] T026 [P] `deno fmt` + `deno lint` pass across the new
      `worker/modules/pages/` and `PagesInventory.tsx` files.

---

## Dependencies & Execution Order

Same shape as Modules 1-3: Foundational blocks everything; US1 creates the
shared `evaluate.ts`/`inventory.ts` that US2/US3 extend; US4 depends on
US1's persistence and US2/US3's complete evaluation, built last.

### Parallel Opportunities

T001/T002 in parallel; `[P]`-marked tests within each story in parallel;
T009 (frontend) parallel with T007/T008 (backend) within US1.

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

Both P1 — an inventory without the `pages.dev` exposure flag doesn't yet
deliver this module's core value, same reasoning as every prior module.

### Incremental Delivery

1. Foundational → foundation ready.
2. US1 + US2 → MVP: full inventory with `pages.dev` exposure detection.
3. US3 → adds production deployment health.
4. US4 → adds scheduled drift alerting, joining the shared handler as a
   fourth independent evaluation.

---

## Notes

- T021 is the one task touching the shared `worker/index.ts` scheduled
  handler — review it with that in mind, same caveat as Modules 2 and 3's
  equivalent task.
- Run `quickstart.md` in full (T024) before considering Module 4 done —
  same real-account caveat as every prior module.
