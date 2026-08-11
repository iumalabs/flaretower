---

description: "Task list for Security Posture module implementation"
---

# Tasks: Security Posture

**Input**: Design documents from `/specs/006-security-posture/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: By user story (US1 P1, US2 P1, US3 P2, US4 P2). No Setup
phase — reuses Modules 1-5's tooling entirely.

---

## Phase 1: Foundational (Blocking Prerequisites)

- [ ] T001 [P] Create D1 migration `worker/db/migrations/0007_security_findings.sql`
      for `ssl_tls_findings`, `ssl_tls_alerts`, `dnssec_findings`,
      `dnssec_alerts`, `waf_findings`, `waf_alerts`,
      `rate_limiting_findings`, `rate_limiting_alerts` per
      data-model.md.
- [ ] T002 Mount `/api/security/*` in `worker/index.ts`'s Hono app,
      gated by the existing `accessAuth` middleware. Stub router until
      US1.

**Checkpoint**: D1 schema and routing mount point exist.

---

## Phase 2: User Story 1 - Full security posture inventory (Priority: P1) 🎯 MVP

**Goal**: Every zone's SSL/TLS mode, DNSSEC status, WAF presence, and
rate-limiting presence listed, plus every Turnstile widget, none
omitted.

**Independent Test**: quickstart.md Scenario 1.

### Tests for User Story 1

- [ ] T003 [P] [US1] Unit test in `tests/unit/security-inventory.test.ts`
      (mocked `fetch`): zones and their four raw settings are correctly
      enumerated, including a zone with no WAF/rate-limiting ruleset
      deployed (404 handled as "none," not an error) and the Turnstile
      widgets list.
- [ ] T004 [P] [US1] Playwright e2e test in
      `tests/e2e/security-inventory.spec.ts` (mocked
      `GET /api/security/inventory`): every zone's four checks and every
      Turnstile widget render, none omitted.

### Implementation for User Story 1

- [ ] T005 [P] [US1] Implement `worker/modules/security/types.ts` and
      `inventory.ts`: list zones, fetch each zone's SSL/TLS setting
      value and DNSSEC status, fetch each zone's WAF and rate-limiting
      ruleset entrypoints (404 → "none deployed," not an error), and
      list account Turnstile widgets, per research.md §1-§6.
- [ ] T006 [US1] Implement basic `evaluateSslTlsMode()`,
      `evaluateDnssec()`, `evaluateWaf()`, `evaluateRateLimiting()` in
      `worker/modules/security/evaluate.ts`: returns `not_evaluated` on
      an evaluationError, `safe` otherwise for now (US2/US3 extend the
      real branches). Depends on T005's types.
- [ ] T007 [US1] Implement `GET /api/security/inventory` in
      `worker/modules/security/routes.ts`, including the live (never
      persisted) Turnstile widgets list per contracts/api.md. Depends on
      T005, T006.
- [ ] T008 [US1] Implement `POST /api/security/evaluate`: runs inventory
      + evaluate, persists to `ssl_tls_findings`, `dnssec_findings`,
      `waf_findings`, `rate_limiting_findings`. Depends on T001, T006.
- [ ] T009 [P] [US1] Build `app/pages/SecurityPostureInventory.tsx`,
      reusing `ExposureStatusBadge` unchanged, with a per-zone row group
      (four checks) plus a Turnstile widgets section. Add a sixth nav
      entry to `app/App.tsx`.
- [ ] T010 [US1] Wire `routes.ts` into the `/api/security` mount from
      T002.

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 3: User Story 2 - SSL/TLS mode flag (Priority: P1)

**Goal**: Off/Flexible → critical; Full → warning; Full (strict) (and
the Enterprise-only strict-origin-pull variant) → safe.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [ ] T011 [P] [US2] Unit test: `"off"`/`"flexible"` → critical;
      `"full"` → warning; `"strict"`/`"origin_pull"` → safe.
- [ ] T012 [P] [US2] Playwright e2e test: the critical, warning, and
      safe SSL/TLS badges render distinctly for mocked zones.

### Implementation for User Story 2

- [ ] T013 [US2] Implement the real SSL/TLS mode decision logic in
      `evaluate.ts` (research.md §2) and wire it into
      `evaluateSslTlsMode()`, replacing US1's stub. Persist real values
      in `POST /api/security/evaluate` (T008) and surface them in
      `GET /api/security/inventory` (T007).

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 4: User Story 3 - DNSSEC/WAF/rate-limiting gap flags (Priority: P2)

**Goal**: DNSSEC disabled/pending/pending-disabled → warning, active →
safe, error → not_evaluated. WAF/rate-limiting absent or fully-disabled
→ warning, at least one enabled rule → safe.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [ ] T014 [P] [US3] Unit test: DNSSEC `"active"` → safe;
      `"disabled"`/`"pending"`/`"pending-disabled"` → warning; `"error"`
      → not_evaluated. WAF/rate-limiting: no ruleset → warning; ruleset
      with zero enabled rules → warning; ruleset with at least one
      enabled rule → safe (shared `hasEnabledManagedRule()` helper,
      tested against both phases).
- [ ] T015 [P] [US3] Playwright e2e test: DNSSEC, WAF, and
      rate-limiting badges render distinctly for mocked zones.

### Implementation for User Story 3

- [ ] T016 [US3] Implement `hasEnabledManagedRule()` and the real
      decision logic for `evaluateDnssec()`, `evaluateWaf()`,
      `evaluateRateLimiting()` in `evaluate.ts` (research.md §3-§5),
      replacing US1's stubs. Persist real values in
      `POST /api/security/evaluate` (T008) and surface them in
      `GET /api/security/inventory` (T007).

**Checkpoint**: All four status-detection checks independently
functional.

---

## Phase 5: User Story 4 - Scheduled drift alerting (Priority: P2)

**Goal**: Scheduled evaluation joins the existing shared handler; alerts
on new SSL/TLS, DNSSEC, WAF, or rate-limiting findings, no repeats.

**Independent Test**: quickstart.md Scenario 4.

### Tests for User Story 4

- [ ] T017 [P] [US4] Unit test in `tests/unit/security-alerts.test.ts`:
      first-run alerting, no-repeat on unchanged state, transitions, for
      all four diff functions (SSL/TLS, DNSSEC, WAF, rate-limiting —
      four separate diff functions per data-model.md's four-table
      design).

### Implementation for User Story 4

- [ ] T018 [US4] Implement `worker/modules/security/alerts.ts` — four
      diff functions (`diffForSslTlsAlerts`, `diffForDnssecAlerts`,
      `diffForWafAlerts`, `diffForRateLimitingAlerts`), same
      new-vs-repeat semantics as every prior module.
- [ ] T019 [US4] **Integration point** (plan.md's Constitution Check):
      add this module's evaluation + alert-diffing to the *existing*
      `scheduled` handler in `worker/index.ts`, as a sixth independent
      `waitUntil` call alongside Modules 1-5's. Depends on T008, T013,
      T016, T018.
- [ ] T020 [US4] Implement `GET /api/security/alerts` (merges all four
      alert tables with a `kind` discriminator per contracts/api.md).
      Depends on T018.
- [ ] T021 [US4] Implement
      `POST /api/security/alerts/:kind/:id/acknowledge` (routes to the
      matching table based on `:kind`). Depends on T018.

**Checkpoint**: All 4 user stories independently functional — Module 6 is
feature-complete per spec.md.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Run all 6 quickstart.md scenarios end-to-end against a
      real scratch Cloudflare test account (real-account dependency,
      same as every prior module's equivalent task) — also confirm the
      exact zone-ruleset permission scope name(s) flagged as an open
      item in research.md §8.
- [ ] T023 [P] Add this module's required token scopes (`Zone Settings
      Read`, `Zone WAF Read`/`Zone Rulesets Read`, `Turnstile Read` —
      all new, pending T022's live-account confirmation; `Zone Read` is
      already documented) to the README.
- [ ] T024 [P] `deno fmt` + `deno lint` pass across the new
      `worker/modules/security/` and `SecurityPostureInventory.tsx`
      files.

---

## Dependencies & Execution Order

Same shape as Modules 1-5: Foundational blocks everything; US1 creates
the shared `evaluate.ts`/`inventory.ts` that US2/US3 extend; US4 depends
on US1's persistence and US2/US3's complete evaluation, built last.

### Parallel Opportunities

T001/T002 in parallel; `[P]`-marked tests within each story in parallel;
T009 (frontend) parallel with T007/T008 (backend) within US1.

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

Both P1 — an inventory without the SSL/TLS mode flag doesn't yet deliver
this module's headline value, same reasoning as every prior module.

### Incremental Delivery

1. Foundational → foundation ready.
2. US1 + US2 → MVP: full inventory with SSL/TLS mode detection.
3. US3 → adds DNSSEC/WAF/rate-limiting gap detection.
4. US4 → adds scheduled drift alerting, joining the shared handler as a
   sixth independent evaluation.

---

## Notes

- T019 is the one task touching the shared `worker/index.ts` scheduled
  handler — review it with that in mind, same caveat as every prior
  module's equivalent task.
- Run `quickstart.md` in full (T022) before considering Module 6 done —
  same real-account caveat as every prior module, plus the added
  zone-ruleset scope-name confirmation noted in research.md §8.

---

## Phase 6: Convergence

- [ ] T025 Preserve the null-vs-empty-array distinction for a failed
      Turnstile widget fetch in `GET /api/security/inventory`
      (`worker/modules/security/routes.ts`, both the no-run-yet branch
      and the main branch): both currently call
      `listTurnstileWidgets(creds).catch(() => [])` directly instead of
      going through `buildSecurityInventory()`'s
      `turnstileWidgets: TurnstileWidget[] | null`, so a scoped-down
      token (missing `Turnstile Read`) or any transient API error is
      silently rendered as "confirmed zero widgets" instead of
      not-fully-evaluated — the exact distinction
      `inventory.ts`'s own type and its dedicated unit test
      ("a total failure to list Turnstile widgets yields null, not an
      empty (confirmed-zero) list") establish but the route discards.
      Breaks quickstart.md Scenario 5 for the Turnstile field. per
      FR-012 (contradicts)
- [ ] T026 Fix the empty-state check in
      `app/pages/SecurityPostureInventory.tsx` (`if (data.zones.length
      === 0 && data.turnstile_widgets.length === 0)`) to key off
      `data.run_id === null` instead of both arrays being empty: the
      backend already sets `run_id: null` precisely to mean "no
      evaluation run yet" (`worker/modules/security/routes.ts`'s `if
      (!latest) return { run_id: null, ... }`), so a real completed run
      against a zero-zone account (the spec's explicitly named "account
      has zero zones" edge case) incorrectly shows "No evaluation runs
      yet. Trigger one via `POST /api/security/evaluate`." instead of
      the required confirmed-empty result. per Edge Cases: "What
      happens when the account has zero zones?" / SC-002 (contradicts)
