---

## description: "Task list for Workers & Access Exposure implementation"

# Tasks: Workers & Access Exposure

**Input**: Design documents from `/specs/001-workers-access-exposure/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md),
[quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED — constitution Principle VI mandates tests for every feature and
Playwright coverage for every user-facing flow. This is not optional for this project.

**Organization**: Tasks are grouped by user story (spec.md's 4 stories, in priority order: US1 P1,
US2 P1, US3 P2, US4 P2) to enable independent implementation and testing of each.

## Path Conventions

Per plan.md's Project Structure: `worker/` (Worker code, modules under `worker/modules/`), `app/`
(React SPA), `tests/unit/` (deno test), `tests/e2e/` (Playwright).

---

## Phase 1: Setup

**Purpose**: Project initialization. **T001 is the single highest-risk task in this whole plan** —
constitution §5 explicitly flags that Wrangler, Playwright, and Vite are npm-native with no
first-class Deno distribution, and research.md §7 carries this forward as unvalidated. Nothing else
should be built on top of unvalidated tooling.

- [x] T001 Validate that Wrangler, the Cloudflare Vite plugin, and Playwright all run via Deno's
      `npm:` specifier / `deno task` without any of them generating a `package.json`. Scaffold the
      minimal proof in a scratch directory first if needed. If any tool forces a `package.json`,
      STOP and surface the problem with options per constitution §5 — do not silently let one
      appear.
- [x] T002 Create root `deno.json` with the `npm:` import map (hono, jose, wrangler, react,
      react-dom, and dev-only vite/@cloudflare/vite-plugin/ playwright entries), `deno task` entries
      (`dev`, `build`, `deploy`, `test`, `test:e2e`, `fmt`, `lint`), formatter, and linter config —
      the single config file per constitution Principle V.
- [x] T003 [P] Scaffold `worker/` and `app/` directories per plan.md's Project Structure (empty
      `worker/index.ts`, `worker/auth/`, `worker/db/migrations/`,
      `worker/modules/workers-access-exposure/`, `app/main.tsx`, `app/pages/`, `app/components/`).
- [x] T004 [P] Create `wrangler.jsonc` at repo root: `workers_dev: false`, `preview_urls: true`
      (constitution Principle VII, already required repo-wide), `assets` binding (`directory`,
      `binding: "ASSETS"`, `not_found_handling: "single-page-application"`), `d1_databases` binding
      placeholder, `triggers.crons` placeholder, explicit `limits.cpu_ms` (research.md §5).

**Checkpoint**: Tooling proven to work under the Deno-only constraint; directory skeleton and
Wrangler config exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Implement Access JWT validation in `worker/auth/access-jwt.ts` using `jose`'s
      `createRemoteJWKSet` + `jwtVerify` against `${TEAM_DOMAIN}/cdn-cgi/access/certs`, verifying
      `issuer` and `audience` (`POLICY_AUD`), per research.md §2. Missing/invalid token → `403`, no
      degraded path (constitution Principle II). This gates every `/api/*` route added in every
      later phase.
- [x] T006 [P] Create D1 migration `worker/db/migrations/0001_baseline.sql` for the
      constitution-mandated `users` and `audit_log` tables (keyed by JWT `sub`, per constitution's
      Identity, Authorization & Audit Data Model section).
- [x] T007 [P] Create D1 migration `worker/db/migrations/0002_exposure_findings.sql` for this
      module's `exposure_findings` and `exposure_alerts` tables per data-model.md.
- [x] T008 Implement the Hono router skeleton in `worker/index.ts`'s `fetch` handler: requests to
      `/api/*` go to Hono (gated by T005's middleware), everything else falls through to
      `env.ASSETS.fetch(request)` (research.md §6).
- [x] T009 Add an empty `scheduled` handler stub in `worker/index.ts` that logs invocation via
      `controller.cron` (research.md §5) — real logic wired in Phase 6 (US4).
- [x] T010 [P] Configure `deno test` for `tests/unit/` and Playwright (via `npm:`) for `tests/e2e/`,
      including the local Cron Trigger test endpoint (`/cdn-cgi/handler/scheduled`) needed by
      quickstart.md Scenario 4.

**Checkpoint**: Auth gate, D1 schema, and routing skeleton exist — user story implementation can now
begin.

---

## Phase 3: User Story 1 - Full exposure inventory (Priority: P1) 🎯 MVP

**Goal**: Every Worker's hostnames (custom domain, `workers.dev`, Preview URL) listed with
independently-evaluated exposure status.

**Independent Test**: quickstart.md Scenario 1 — every test Worker appears exactly once; each
hostname shows its own status, not merged per-Worker.

### Tests for User Story 1

- [x] T011 [P] [US1] Unit test in `tests/unit/evaluate.test.ts`: a Worker with multiple hostnames
      (custom domain + `workers.dev`) evaluates each independently — one Access-covered, one not,
      and the result reflects both correctly in the same call.
- [x] T012 [P] [US1] Playwright e2e test in `tests/e2e/exposure-inventory.spec.ts`:
      `GET /api/exposure/inventory` (behind a valid Access session) returns every test-account
      Worker exactly once, with no silent omissions (spec SC-002).

### Implementation for User Story 1

- [x] T013 [P] [US1] Implement Cloudflare API client helpers in
      `worker/modules/workers-access-exposure/inventory.ts`: list Worker scripts, custom domains,
      zone routes, and per-script `workers.dev`/Preview-URL subdomain status (research.md §3's
      endpoint table) using plain `fetch()` against `api.cloudflare.com`.
- [x] T014 [US1] Implement the pure `evaluate()` function in
      `worker/modules/workers-access-exposure/evaluate.ts`: takes (Worker, hostnames, Access
      applications) and returns a safe/warning/critical/not_evaluated status + reason per hostname —
      no network or D1 access inside this function (constitution Principle III — this is what
      `fetch` and `scheduled` will both call identically). This task implements the basic
      covered-vs-uncovered branch only; policy-openness (warning) logic is added in Phase 5 (US3).
      Depends on T013's types.
- [x] T015 [US1] Implement `GET /api/exposure/inventory` in
      `worker/modules/workers-access-exposure/routes.ts`, returning the latest persisted
      `exposure_findings` run per contracts/api.md. Depends on T013, T014.
- [x] T016 [US1] Implement `POST /api/exposure/evaluate` in the same routes.ts: runs
      `inventory.ts` + `evaluate()`, persists results to `exposure_findings` (one row per hostname
      per run). Depends on T007, T014.
- [x] T017 [P] [US1] Build `app/pages/ExposureInventory.tsx` and
      `app/components/ExposureStatusBadge.tsx`, extracting the design system's color/status tokens
      from `docs/design.zip` per constitution's Design System section rather than hardcoding hex
      values.
- [x] T018 [US1] Wire `routes.ts` into the Hono router in `worker/index.ts`. Depends on T008, T015,
      T016.

**Checkpoint**: User Story 1 is fully functional and independently testable/demoable.

---

## Phase 4: User Story 2 - Critical flag for unprotected exposure (Priority: P1)

**Goal**: A publicly reachable, Access-uncovered hostname reads as critical immediately and
unambiguously everywhere it appears.

**Independent Test**: quickstart.md Scenario 2 — an unprotected `workers.dev` hostname shows
`critical`; the same Worker's separately Access-protected custom domain shows a different,
non-critical status in the same response.

### Tests for User Story 2

- [x] T019 [P] [US2] Unit test in `tests/unit/evaluate.test.ts`: a hostname with zero covering
      Access applications evaluates to `critical` with a reason naming the absence of coverage — and
      a sibling hostname on the same Worker that IS covered does not inherit that status.
- [x] T020 [P] [US2] Playwright e2e test in `tests/e2e/exposure-inventory.spec.ts`: the critical
      badge renders with the design system's critical visual treatment, visually distinct from
      safe/warning, per constitution's "MUST read as critical everywhere it appears" requirement.

### Implementation for User Story 2

- [x] T021 [US2] Harden the critical-determination branch in
      `worker/modules/workers-access-exposure/evaluate.ts` (T014) against the edge cases from
      spec.md (shared custom domain across multiple Workers, account-level `workers.dev` disabled
      entirely → "not reachable" not "reachable and unprotected"). Depends on T014.
- [x] T022 [US2] Style `ExposureStatusBadge`'s critical state using the design system's critical
      token from `docs/design.zip` (T017). Depends on T017.

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Effectively-open Access policy warning (Priority: P2)

**Goal**: A hostname covered by an Access application whose policy doesn't actually restrict anyone
(e.g. "Allow — Everyone", or no policy at all) reads as warning, not safe.

**Independent Test**: quickstart.md Scenario 3 — a hostname behind an "Allow — Everyone" Access
application shows `warning`, distinguishable from both critical and safe.

### Tests for User Story 3

- [x] T023 [P] [US3] Unit test in `tests/unit/evaluate.test.ts`: an Access application with an
      "Everyone" policy, and separately one with zero policies, both evaluate their covered hostname
      to `warning`; a hostname behind a group/email-scoped policy evaluates to `safe`.
- [x] T024 [P] [US3] Playwright e2e test in `tests/e2e/exposure-inventory.spec.ts`: the warning
      badge is visually distinct from both critical and safe.

### Implementation for User Story 3

- [x] T025 [US3] Extend `inventory.ts` (T013) to fetch Access application policies
      (`Access: Apps and Policies Read` scope, research.md §3), and extend `evaluate()` (T014/T021)
      with the policy-openness branch: "Everyone" include rule or zero policies → `warning`;
      group/email/IdP- scoped policy → `safe`. Depends on T013, T021.
- [x] T026 [US3] Surface the policy-openness `reason` string end-to-end through
      `GET /api/exposure/inventory` (T015). Depends on T015, T025.

**Checkpoint**: All three P1/P2 status-detection stories (US1, US2, US3) are independently
functional.

---

## Phase 6: User Story 4 - Scheduled drift alerting (Priority: P2)

**Goal**: The same evaluation runs on a schedule and alerts on new critical/warning transitions
without repeat-alerting on unchanged findings.

**Independent Test**: quickstart.md Scenario 4 — two identical scheduled runs produce no duplicate
alerts; a run following an actual state change produces exactly one new alert.

### Tests for User Story 4

- [x] T027 [P] [US4] Unit test in `tests/unit/alerts.test.ts`: first-ever evaluation of a hostname
      in critical/warning state always alerts (no grace period, spec Edge Cases); an unchanged state
      across two runs produces zero new alert rows (FR-009, SC-005); a genuine transition produces
      exactly one.
- [ ] T028 [P] [US4] Integration test in `tests/e2e/scheduled-audit.spec.ts` hitting the local
      `/cdn-cgi/handler/scheduled` endpoint (per quickstart.md Scenario 4): confirms
      `exposure_alerts` rows appear/don't appear as expected across two consecutive local scheduled
      runs.

### Implementation for User Story 4

- [x] T029 [US4] Implement the new-vs-repeat diff in
      `worker/modules/workers-access-exposure/alerts.ts`: compares the current run's
      `exposure_findings` rows against the immediately previous run per hostname, writes
      `exposure_alerts` rows per data-model.md. Depends on T007, T025.
- [x] T030 [US4] Wire the real `scheduled` handler in `worker/index.ts` (replacing T009's stub):
      calls `inventory.ts` + `evaluate()` + persists `exposure_findings`, then `alerts.ts`. This is
      the same shared module US1's `POST /api/exposure/evaluate` (T016) calls — constitution
      Principle III requires no divergent logic between the two entry points. Depends on T009, T016,
      T029.
- [x] T031 [US4] Implement `GET /api/exposure/alerts` in routes.ts per contracts/api.md. Depends on
      T029.
- [x] T032 [US4] Implement `POST /api/exposure/alerts/{id}/acknowledge` in routes.ts. Not a
      Cloudflare account mutation — not written to `audit_log` (data-model.md's note). Depends on
      T029.

**Checkpoint**: All 4 user stories independently functional — module 1 is feature-complete per
spec.md.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T033 [P] Run all 6 quickstart.md scenarios end-to-end against a real scratch Cloudflare test
      account (not production) and record results.
- [x] T034 [P] Document the exact required API token scopes (research.md §3's table) in the
      repository README, per constitution Principle VIII.
- [ ] T035 Verify quickstart.md Scenario 6 explicitly: no `/api/exposure/*` endpoint returns any
      exposure data without a valid Access JWT, for both a missing header and a tampered/expired
      one.
- [x] T036 [P] `deno fmt` + `deno lint` pass across `worker/` and `app/`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. T001 (tooling validation) blocks nothing
  else in Phase 1 logically, but should still go first since a failure here changes T002's import
  map contents.
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories.
- **User Stories (Phase 3–6)**: All depend on Phase 2. US1 (Phase 3) should land first since
  US2/US3/US4 all extend `evaluate.ts`/`inventory.ts` that US1 creates — true parallelism across
  stories is limited here despite the template's general guidance, because this module's stories are
  layered refinements of one evaluation function, not independent verticals.
- **Polish (Final Phase)**: Depends on US1–US4 all being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories — creates `evaluate.ts` and `inventory.ts` that
  US2/US3/US4 extend.
- **US2 (P1)**: Extends US1's `evaluate.ts`; not independently buildable before US1 exists, but
  independently _testable_ once both are in place (T019 tests the critical branch specifically).
- **US3 (P2)**: Extends US1+US2's `evaluate.ts`/`inventory.ts`.
- **US4 (P2)**: Depends on US1's `POST /api/exposure/evaluate` (T016) and US3's completed
  `evaluate()` (since scheduled runs should detect the same warning/critical states interactive runs
  do) — built last by design.

### Parallel Opportunities

- T003, T004 (Setup) in parallel once T001/T002 land.
- T006, T007 (D1 migrations) in parallel.
- Within each story's Tests subsection, the `[P]` tasks run in parallel (different files).
- T017 (frontend components) can proceed in parallel with T013–T016 (backend) within US1, since they
  touch disjoint files.

---

## Parallel Example: User Story 1

```bash
# Tests (parallel — different files):
Task: "Unit test in tests/unit/evaluate.test.ts"
Task: "Playwright e2e test in tests/e2e/exposure-inventory.spec.ts"

# Backend + frontend (parallel — disjoint files, both depend only on T013's types):
Task: "Implement inventory.ts Cloudflare API helpers"
Task: "Build ExposureInventory.tsx + ExposureStatusBadge.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

Both are P1 — the MVP is not "just US1" here, since an inventory without an unmistakable critical
flag doesn't yet solve the founding problem (spec's User Story 2 rationale). Complete Phases 1–4,
validate quickstart.md Scenarios 1–2 and 6, then decide whether to ship before US3/US4.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 + US2 → MVP: full inventory with unmistakable critical flagging. Validate, consider
   deploying.
3. US3 → adds the effectively-open-policy warning refinement.
4. US4 → adds unattended scheduled drift alerting, closing the loop on the founding problem's "drift
   between visits" framing.

---

## Notes

- Tests are REQUIRED (constitution Principle VI) — write them first per story, confirm they fail,
  then implement.
- US2–US4 extending US1's `evaluate.ts`/`inventory.ts` rather than being fully independent verticals
  is a deliberate consequence of this module's design (one shared pure evaluation function,
  constitution Principle III) — do not force artificial independence by duplicating that logic per
  story.
- Commit after each task or logical group, per the git-workflow discipline already established for
  this repository (branch per unit of work, PR, merge).
- Run `quickstart.md` in full (T033) before considering module 1 done.

---

## Phase 7: Convergence

- [x] T037 Make `buildWorkerInventory`'s top-level Cloudflare list calls (`listWorkerScripts`,
      `listWorkerCustomDomains` in `worker/modules/workers-access-exposure/inventory.ts`) degrade to
      a `not_evaluated` sentinel finding on failure instead of throwing uncaught — today a failure
      of `GET /accounts/{id}/workers/scripts` or `.../workers/domains` propagates unhandled through
      `runEvaluation()` (`worker/modules/workers-access-exposure/routes.ts`), so
      `POST
      /api/exposure/evaluate` and the `scheduled` handler abort the whole run with no
      `exposure_findings` rows written at all, instead of the "502 with a body distinguishing which
      resources couldn't be evaluated" contract in `contracts/api.md`. The same file's own
      `getAccountWorkersDevSubdomain`/`listAccessApplications`, and every later module's
      `inventory.ts` (e.g. `worker/modules/pages/inventory.ts`,
      `worker/modules/security/inventory.ts`), already use the evaluationError-sentinel pattern this
      is missing. per FR-011 (partial)
- [x] T038 Enumerate legacy zone-bound Worker Routes (`GET
      /zones/{zone_id}/workers/routes`,
      `Workers Routes Read` permission) in `worker/modules/workers-access-exposure/inventory.ts`
      alongside Custom Domains, or formally amend `plan.md`/`research.md` to document that this is
      an intentional scope narrowing — `plan.md`'s Project Structure section names `inventory.ts` as
      covering "scripts, custom domains, routes, access apps/policies" and `research.md` §3 lists
      the routes endpoint, but the implementation only calls `/accounts/{id}/workers/domains`; a
      Worker reachable solely via a legacy Route (not a Custom Domain) is currently invisible to the
      inventory, which is exactly the class of blind spot this module exists to close. `README.md`'s
      token-scope table already documents this gap as a conscious deferral ("reserved — kept for
      future route-level checks") but the design docs were never updated to match. per plan:
      inventory.ts touch-point (routes) (missing)
- [x] T039 Update `README.md`'s "Required API token scopes" table to account for the
      `/accounts/{id}/workers/domains` endpoint that `listWorkerCustomDomains()`
      (`worker/modules/workers-access-exposure/inventory.ts`) actually calls — the
      `Workers Scripts Read` row's endpoint list omits it, and `Workers Routes Read` is marked
      "reserved... not used," so the table doesn't currently name any scope for the endpoint
      custom-domain detection depends on. per Constitution VIII (partial)

---

## Phase 8: Convergence

- [x] T040 Fix `runEvaluation()` in `worker/modules/workers-access-exposure/routes.ts` so a Worker
      with zero public hostnames (no custom domain, `workers.dev` disabled, no Preview URL — the
      normal, error-free outcome of `buildWorkerInventory()` in
      `worker/modules/workers-access-exposure/inventory.ts` for such a Worker) is still represented
      in `exposure_findings` and therefore still appears in the `GET /api/exposure/inventory`
      response. Today `findingStatements` is built via
      `results.flatMap((worker) => worker.hostnames.map(...))`: a `WorkerEvaluation` with an empty
      `hostnames` array (see `evaluateWorker()` in
      `worker/modules/workers-access-exposure/evaluate.ts`, which simply maps over whatever
      `inventory.ts` produced) contributes zero INSERT statements, so that Worker has no row for the
      run and is silently absent from `GET /api/exposure/inventory`'s `byWorker`-grouped response —
      the endpoint has no other source of "which Workers exist" to fall back on. This directly
      contradicts spec.md User Story 1's Acceptance Scenario 3 ("that Worker appears with no
      exposure to report, not omitted from the list"), FR-006 ("every Worker in the account
      represented exactly once"), and SC-002 ("100% of Workers... appear in the inventory — zero
      silent omissions"). Neither `data-model.md` nor `research.md` documents how a zero-hostname
      Worker should be persisted, and no test (`tests/unit/evaluate.test.ts` or
      `tests/e2e/exposure-inventory.spec.ts`) exercises this case. per FR-006 (missing)
- [x] T041 Reconcile `contracts/api.md`'s `GET /api/exposure/inventory` **Errors** section — which
      documents a `502` response "used when the Cloudflare API itself errored or rate-limited
      mid-run" — with the actual, already-implemented behavior: since T037 (Phase 7), a top-level
      Cloudflare API failure in `buildWorkerInventory()`
      (`worker/modules/workers-access-exposure/inventory.ts`) degrades to a `not_evaluated` sentinel
      finding persisted through a normal 202/200 response
      (`worker/modules/workers-access-exposure/routes.ts`'s `runEvaluation`/`GET /inventory`), and
      no code path in this module ever returns HTTP `502`. The documented contract is
      unreachable/stale relative to the sentinel-based architecture this module (and, per T037's own
      comment, `worker/modules/pages/inventory.ts` and `worker/modules/security/inventory.ts`) now
      deliberately uses. Either implement the documented `502` path or update `contracts/api.md` to
      describe the sentinel-in-200 behavior actually shipped, so the contract stops promising a
      status code the implementation never sends. per plan: contracts/api.md 502 decision
      (contradicts)
