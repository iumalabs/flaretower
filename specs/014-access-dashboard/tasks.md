---

## description: "Task list for Access Dashboard implementation"

# Tasks: Access Dashboard

**Input**: Design documents from `/specs/014-access-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md),
[quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: By user story (US1 P1, US2 P2, US3 P3). No Foundational phase — extends Module 3's
existing files.

---

## Phase 1: User Story 1 - Real coverage/identity/session data per application (Priority: P1) 🎯 MVP

**Goal**: The applications table shows policy count, covered-hostname count, identity summary, and
session duration, alongside the existing unchanged health status.

**Independent Test**: quickstart.md Scenario 1.

### Tests for User Story 1

- [x] T001 [P] [US1] Unit test in `tests/unit/zero-trust-inventory.test.ts`:
      `listIdentityProviders()` parses id→name; application parsing captures `session_duration` and
      `self_hosted_domains` (falling back to `[domain]`).
- [x] T002 [P] [US1] Playwright e2e test in `tests/e2e/zero-trust-inventory.spec.ts` (mocked
      `GET /api/zero-trust/inventory`): table shows policy count, covered-hostname count (with a
      "+N" indicator for a multi-hostname app), identity summary (including the "— none —" and
      "unknown provider" cases), session duration; existing health status pill unchanged.

### Implementation for User Story 1

- [x] T003 [US1] Add `worker/db/migrations/0010_zt_app_findings_add_policy_detail.sql`: 5 nullable
      columns per data-model.md.
- [x] T004 [P] [US1] Extend `worker/modules/zero-trust/types.ts`:
      `AccessApplication`/`AppEvaluation` gain `policyCount`, `coveredHostnames`, `identitySummary`,
      `sessionDuration`, `policyRules` (data-model.md). New `PolicyRuleLine` type.
- [x] T005 [US1] Implement `listIdentityProviders()` in `worker/modules/zero-trust/inventory.ts`
      (research.md §2) and extend `listAccessApplications()` to capture `session_duration`,
      `self_hosted_domains`/`domain`, and each policy's full `include`/`require`/`exclude` raw rule
      arrays (research.md §1). Depends on T004.
- [x] T006 [US1] Extend `worker/modules/zero-trust/evaluate.ts`'s `evaluateApplication()` to compute
      `policyCount`, `coveredHostnames`, `identitySummary` (via the id→name map from T005) — status/
      reason logic unchanged (spec.md FR-002). Depends on T004, T005.
- [x] T007 [US1] Extend `worker/modules/zero-trust/routes.ts`: persist the 5 new columns in
      `runZeroTrustEvaluation`'s INSERT, read them back in `GET /inventory` (contracts/api.md).
      Depends on T003, T006.
- [x] T008 [US1] Rewrite the Applications half of `app/pages/ZeroTrustInventory.tsx`: bespoke table
      (Application/Covers/Policies/Identity/Session columns + the existing unchanged health pill),
      reusing `FindingsTable`. Service Tokens half unchanged. Depends on T007.

**Checkpoint**: User Story 1 fully functional and independently testable — MVP.

---

## Phase 2: User Story 2 - Plain-language policy detail for a selected application (Priority: P2)

**Goal**: Selecting an application shows its policies as ALLOW/REQUIRE/DENY rule lines in plain
language, with an honest fallback for unrecognized rule types.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [x] T009 [P] [US2] Unit test in `tests/unit/zero-trust-rule-humanizer.test.ts`: every rule type in
      research.md §4 (`everyone`, `email_domain`, `email`, `service_token`, `login_method`,
      `ip`/`ip_list`, `group`) humanizes correctly; an unrecognized rule type falls back to the
      generic `"<verb> <raw type>"` label (spec.md FR-004); `require`-array rules always render as
      REQUIRE regardless of the policy's own decision; `bypass` decision renders as ALLOW.
- [x] T010 [P] [US2] Playwright e2e test: selecting a different application swaps the policy detail
      panel; a rule type not in the humanizer's known set still renders (not dropped); zero
      applications shows the panel's own empty state (spec.md AC3).

### Implementation for User Story 2

- [x] T011 [P] [US2] Create `worker/modules/zero-trust/rule-humanizer.ts`: pure
      `humanizeRule(rule, verb, identityProviderNames, groupNames)` and
      `humanizePolicies(policies, ...)` functions per research.md §4.
- [x] T012 [US2] Wire `rule-humanizer.ts` into `evaluate.ts`'s `evaluateApplication()` (T006) to
      populate `policyRules`. Depends on T011.
- [x] T013 [US2] Extend `ZeroTrustInventory.tsx` (T008): selectable application row (local
      `useState`, default first) driving a "Policy detail" panel rendering `policyRules` as
      verb-labeled lines; explicit empty state when there are zero applications.

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 3: User Story 3 - Access Groups panel (Priority: P3)

**Goal**: A panel listing Access Groups with their rule summary and application-reference count;
degrades gracefully on fetch failure without blocking the rest of the page.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [x] T014 [P] [US3] Unit test: `listAccessGroups()` parsing (mocked `fetch`); a total failure
      returns a value the caller can distinguish from a confirmed-empty list (research.md §3,
      spec.md FR-008).
- [x] T015 [P] [US3] Unit test: group-reference-count computation — a group referenced by N
      applications' policies counts N; an unreferenced group counts 0, never omitted.
- [x] T016 [P] [US3] Playwright e2e test: a group's reference count matches mocked data; a group
      with 0 references still appears; a mocked Groups-fetch failure shows the panel's own "not
      available" state while the table and policy detail render normally.

### Implementation for User Story 3

- [x] T017 [P] [US3] Implement `listAccessGroups()` in `inventory.ts` (research.md §3) — returns
      `null` on total failure, distinct from `[]`.
- [x] T018 [US3] Implement the reference-count computation (pure function, scans every application's
      raw policy rules for a `group` rule matching each group's id) and the group's own rule-summary
      via `rule-humanizer.ts` (T011). Depends on T011, T017.
- [x] T019 [US3] Extend `routes.ts`'s `GET /inventory` (T007) to live-fetch Access Groups (T017,
      T018) on every request — NOT part of `runZeroTrustEvaluation`'s persisted pipeline
      (research.md §3) — and include `access_groups` (`null` on failure) in the response.
- [x] T020 [US3] Extend `ZeroTrustInventory.tsx` (T013): render the Groups panel, with its own empty
      and "not available" states, independent of the table's/policy detail's own states.

**Checkpoint**: All 3 user stories independently functional — Module 014 is feature-complete per
spec.md.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T021 [P] Confirm live (quickstart.md) whether Groups/Identity Providers need a token scope
      beyond `Access: Apps and Policies Read` (research.md §6); update README's token-scope table if
      a new scope is actually required, otherwise leave it unchanged. **Groups: confirmed
      2026-08-14/15** — `Access: Groups Read` (the narrower scope, not the combined
      `Access: Organizations, Identity Providers, and Groups Read`) was genuinely missing in
      production (issue #401: `access_groups` was `null` until added); README updated. **Identity
      Providers: inconclusive** — production currently shows `identity_summary: "— none —"` on every
      application, which is also the expected output for an account with no `login_method` policy
      rules at all, so this doesn't distinguish "scope missing" from "genuinely no such rules" —
      left unconfirmed in README rather than guessing.
- [ ] T022 [P] Run all 3 quickstart.md scenarios end-to-end against a real scratch Cloudflare test
      account (real-account dependency, same as every prior module's equivalent task).
- [x] T023 [P] `deno fmt` + `deno lint` pass across every touched file.

---

## Dependencies & Execution Order

US1 (table columns) is the MVP and has no dependency on US2/US3. US2 (policy detail) depends on
US1's richer `AppEvaluation` existing but is otherwise independent of US3. US3 (Groups) is
independent of US2 but reuses US2's `rule-humanizer.ts` for group rule summaries, so T018 depends on
T011. `routes.ts`/`ZeroTrustInventory.tsx` are touched across all three stories — implementation
tasks for each are sequenced accordingly (T007→T012's caller, T019, T020 each extend the prior
story's version of the same files).

### Parallel Opportunities

T001/T002 in parallel; T004 parallel with T003 (different files); T009/T010 in parallel;
T014/T015/T016 in parallel; T017 parallel with T011 (independent until T018 needs both).

---

## Implementation Strategy

### MVP First (User Story 1)

Real coverage/identity/session data in the table alone is a real improvement over today's
domain-and-reason-only view — P1, independently shippable before the policy detail or groups panels
exist.

### Incremental Delivery

1. US1 → MVP: richer applications table, existing status unchanged.
2. US2 → adds the plain-language policy detail panel (this spec's headline new value).
3. US3 → adds the Access Groups panel, with its own honest degradation on failure.

---

## Notes

- T007/T019 and T008/T013/T020 are the two files (`routes.ts`, `ZeroTrustInventory.tsx`) touched
  across all three user stories — review each extension with that in mind, same caveat as every
  prior module's equivalent shared-file task.
- research.md §3's correction (dropping the mockup's fabricated Group member count) is a deliberate,
  documented departure from the visual mockup's own placeholder data — don't "fix" T017/T018 to try
  to recover a number Cloudflare's API doesn't actually provide.
- Run `quickstart.md` in full (T022) before considering Module 014 done — same real-account caveat
  as every prior module.
