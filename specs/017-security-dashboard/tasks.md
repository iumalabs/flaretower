---

## description: "Task list for Security Dashboard implementation"

# Tasks: Security Dashboard

**Input**: Design documents from `/specs/017-security-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md),
[quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: 3 independently-shippable user stories (P1/P2/P3) — zone-row restructuring, 3 new
persisted checks, 2 new live-fetched panels.

---

## Phase 1: Foundational (blocking prerequisite for User Story 2)

- [x] T001 Add `worker/db/migrations/0013_security_findings_add_bot_https_min_tls.sql`: 3 new
      finding/alert table pairs, mirroring `0007_security_findings.sql`'s existing 4 pairs exactly
      (data-model.md).

**Checkpoint**: Migration exists; User Story 2's `routes.ts` work can now persist its new checks.
(User Stories 1 and 3 don't depend on this migration.)

---

## Phase 2: User Story 1 - See each zone's full security posture in one row (Priority: P1) 🎯 MVP

**Goal**: The zone table shows one row per zone (SSL/TLS, DNSSEC, WAF, Rate Limiting) with a
rolled-up overall status, instead of today's one-row-per-check flattening.

**Independent Test**: quickstart.md Scenario 1.

### Tests for User Story 1

- [x] T002 [P] [US1] Unit test in `tests/unit/security-evaluate.test.ts`: `rollUpZoneStatus()` —
      critical outranks warning outranks not_evaluated outranks safe; empty array defaults safe
      (research.md §2, mirrors `rollUpExposureStatus`'s own test precedent).
- [x] T003 [P] [US1] Unit test in `tests/unit/security-routes.test.ts` (NEW file): `GET /inventory`
      assembles one row per zone from the 4 existing finding tables, with `overall_status` equal to
      the worst of that zone's 4 checks (contracts/api.md).
- [x] T004 [P] [US1] Playwright e2e test extending `tests/e2e/security-inventory.spec.ts`: each zone
      appears exactly once; a zone with one critical check among 3 safe ones shows an overall
      critical status (spec.md Acceptance Scenarios 1-3).

### Implementation for User Story 1

- [x] T005 [US1] Add `rollUpZoneStatus()` to `worker/modules/security/evaluate.ts` (research.md §2).
      Depends on T002.
- [x] T006 [US1] Restructure `GET /inventory` in `worker/modules/security/routes.ts`: join the 4
      existing per-check tables into one row per zone with `overall_status` (contracts/api.md). The
      existing 4 checks' status/reason values are unchanged (spec.md FR-003) — only the response
      shape changes. Depends on T005.
- [x] T007 [US1] Rewrite `app/pages/SecurityPostureInventory.tsx`'s main table: one
      `FindingsTableRow` per zone (removes the current per-check flattening), a small pill/text per
      check plus the row's overall status; Turnstile section unchanged. Depends on T006.

**Checkpoint**: User Story 1 fully functional and independently shippable.

---

## Phase 3: User Story 2 - See Bot Fight Mode, Always Use HTTPS, Minimum TLS Version per zone (Priority: P2)

**Goal**: Each zone row also shows these 3 new checks, each independently persisted and alertable.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [x] T008 [P] [US2] Unit test in `tests/unit/security-inventory.test.ts`: the 3 new zone-setting
      fetch functions map `{ value }` correctly, mirroring `getZoneSslSetting()`'s own test
      (research.md §3).
- [x] T009 [P] [US2] Unit test in `tests/unit/security-evaluate.test.ts`:
      `evaluateBotFightMode()`/`evaluateAlwaysUseHttps()` (on=safe, off=warning) and
      `evaluateMinTlsVersion()` (1.2/1.3=safe, 1.0/1.1=warning), mirroring `evaluateWaf()`'s shape.
- [x] T010 [P] [US2] Playwright e2e test extending `tests/e2e/security-inventory.spec.ts`: a zone
      with Bot Fight Mode off shows warning for that check and it's reflected in the row's overall
      status when it's the worst check (spec.md Acceptance Scenarios 1-3).

### Implementation for User Story 2

- [x] T011 [US2] Extend `worker/modules/security/types.ts`: `ZoneInventoryItem` gains
      `botFightMode`/`alwaysUseHttps`/`minTlsVersion`; new `SettingStatus`,
      `BotFightModeEvaluation`/`AlwaysHttpsEvaluation`/`MinTlsVersionEvaluation` (data-model.md).
- [x] T012 [US2] Extend `worker/modules/security/inventory.ts`: 3 new
      `getZoneBotFightMode()`/`getZoneAlwaysUseHttps()`/`getZoneMinTlsVersion()` functions (same
      generic `/zones/{id}/settings/{setting_id}` pattern as `getZoneSslSetting()`); wire into
      `fetchZoneSecuritySettings()`. Depends on T011.
- [x] T013 [US2] Extend `worker/modules/security/evaluate.ts`: `evaluateBotFightMode()`/
      `evaluateAlwaysUseHttps()`/`evaluateMinTlsVersion()` + their plural mapping functions. Depends
      on T011, T012.
- [x] T014 [US2] Extend `worker/modules/security/alerts.ts`: 3 new diff functions, mirroring
      `diffForWafAlerts()`. Depends on T011.
- [x] T015 [US2] Extend `worker/modules/security/routes.ts`: persist the 3 new checks in
      `runSecurityEvaluation()` (INSERT + alert diff/insert); include them in each zone row in
      `GET /inventory`, folded into `overall_status`; add their `kind`s to `GET /alerts` and
      `ALERT_TABLE_BY_KIND`. Depends on T001, T006, T013, T014.
- [x] T016 [US2] Extend `app/pages/SecurityPostureInventory.tsx`: add the 3 new checks to each zone
      row. Depends on T015.

**Checkpoint**: User Story 2 fully functional and independently shippable.

---

## Phase 4: User Story 3 - See real certificate expiry and real WAF custom rules (Priority: P3)

**Goal**: Two new live-fetched panels below the zone table: Certificates and WAF Custom Rules.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [x] T017 [P] [US3] Unit test in `tests/unit/security-inventory.test.ts`: a new
      `getZoneCertificatePacks()` maps `certificates[]` correctly; a new `getZoneCustomWafRules()`
      maps rule fields correctly and treats a 404 as zero rules (not an error), mirroring
      `cfFetchRulesetOrNull()`'s existing 404-tolerant precedent.
- [x] T018 [P] [US3] Unit test in `tests/unit/security-evaluate.test.ts`:
      `classifyCertificateExpiry()` (<30 days=warning, else safe, null=not_evaluated) and
      `classifyCustomWafRule()` (disabled=not_evaluated, enabled+skip=warning, enabled+other=safe).
- [x] T019 [P] [US3] Playwright e2e test extending `tests/e2e/security-inventory.spec.ts`: the
      Certificates panel shows real host/issuer/expiry with correct status; the WAF Custom Rules
      panel shows every rule labeled with its real zone, a skip-action rule as warning, a disabled
      rule as not-evaluated (spec.md Acceptance Scenarios 1-4).

### Implementation for User Story 3

- [x] T020 [US3] Extend `worker/modules/security/inventory.ts`: `getZoneCertificatePacks()`
      (`GET /zones/{id}/ssl/certificate_packs`) and `getZoneCustomWafRules()`
      (`GET /zones/{id}/rulesets/phases/http_request_firewall_custom/entrypoint` via
      `cfFetchRulesetOrNull()`) (research.md §5/§6).
- [x] T021 [US3] Extend `worker/modules/security/evaluate.ts`: `classifyCertificateExpiry()` and
      `classifyCustomWafRule()` pure functions. Depends on T020.
- [x] T022 [US3] Extend `worker/modules/security/routes.ts`: `fetchCertificatesPanel()` and
      `fetchWafCustomRulesPanel()` live-fetch functions (mirrors `fetchAccessGroupsPanel()` in
      `worker/modules/zero-trust/routes.ts` — called fresh on every `GET /inventory`, never
      persisted). Depends on T020, T021.
- [x] T023 [US3] Extend `app/pages/SecurityPostureInventory.tsx`: add a Certificates panel and a WAF
      Custom Rules panel below the zone table; Turnstile section stays at the bottom, unchanged.
      Depends on T022.

**Checkpoint**: User Story 3 fully functional and independently shippable — Module 017 is
feature-complete per spec.md.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T024 [P] Run all 3 quickstart.md scenarios end-to-end against a real scratch Cloudflare test
      account (real-account dependency, same as every prior module's equivalent task).
- [x] T025 [P] `deno fmt` + `deno lint` pass across every touched file.

---

## Dependencies & Execution Order

T001 (migration) blocks only User Story 2's `routes.ts` task (T015). User Story 1 has zero new
Cloudflare API calls or persisted columns — it's a response-shape and frontend change only. User
Story 3 is entirely additive and live-fetched (no migration dependency). Within each story, the
usual chain applies: types → inventory → evaluate → alerts → routes → frontend.

### Parallel Opportunities

Every story's test tasks (T002-T004, T008-T010, T017-T019) can be written in parallel with each
other ahead of the implementation they verify, per constitution Principle VI's test-first
requirement. T024/T025 in the Final Phase are independent of each other.

---

## Implementation Strategy

### MVP First

User Story 1 (zone-row restructuring, P1) is the MVP — it delivers the core "one row per zone" value
with zero new API calls. User Stories 2 and 3 are strictly additive on top, each independently
shippable and independently testable without the other.

---

## Notes

- `evaluate.ts`'s existing `evaluateSslTlsMode()`/`evaluateDnssec()`/`evaluateWaf()`/
  `evaluateRateLimiting()` are untouched throughout this entire spec (spec.md FR-003) — do not
  "improve" their decision logic as part of any story.
- Email Obfuscation is never fetched or evaluated (research.md §4) — do not add it even if a future
  task seems to invite it.
- WAF rule "Hits 24h" is explicitly out of scope (research.md §6).
- Run `quickstart.md` in full (T024) before considering Module 017 done — same real-account caveat
  as every prior module.
