---

## description: "Task list for DNS module implementation"

# Tasks: DNS

**Input**: Design documents from `/specs/002-dns/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md),
[quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI), same as Module 1.

**Organization**: By user story (spec.md's 4 stories: US1 P1, US2 P1, US3 P2, US4 P2), same priority
order as Module 1's equivalent stories.

No Setup phase — this module reuses Module 1's already-validated tooling, `deno.json`, and
`wrangler.jsonc` entirely; nothing new to configure.

---

## Phase 1: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T001 [P] Create D1 migration `worker/db/migrations/0003_dns_findings.sql` for `dns_findings`
      and `dns_alerts` per data-model.md.
- [ ] T002 Mount `/api/dns/*` in `worker/index.ts`'s Hono app, gated by the existing `accessAuth`
      middleware (already applied to all of `/api/*` — this task is wiring the new sub-router in,
      not adding new auth logic). Depends on T001 existing conceptually but not on its migration
      having run; can proceed in parallel with T001 in practice.

**Checkpoint**: D1 schema and routing mount point exist — user story implementation can begin.

---

## Phase 2: User Story 1 - Full DNS inventory (Priority: P1) 🎯 MVP

**Goal**: Every zone's DNS records listed with name, type, content, and proxy status.

**Independent Test**: quickstart.md Scenario 1.

### Tests for User Story 1

- [ ] T003 [P] [US1] Unit test in `tests/unit/dns-inventory.test.ts` (mocked `fetch`, same pattern
      as Module 1's `inventory.test.ts`): zones and their records are correctly enumerated and
      grouped.
- [ ] T004 [P] [US1] Playwright e2e test in `tests/e2e/dns-inventory.spec.ts` (mocked
      `GET /api/dns/inventory` response, same pattern as Module 1's `exposure-inventory.spec.ts`):
      every zone and record renders, none omitted.

### Implementation for User Story 1

- [ ] T005 [P] [US1] Implement `worker/modules/dns/types.ts` (DnsRecord, DnsFinding, etc. per
      data-model.md) and `inventory.ts`: list zones (`GET /accounts/{id}/zones`), list records per
      zone (`GET /zones/{zone_id}/dns_records`).
- [ ] T006 [US1] Implement the basic `evaluateRecord()` in `worker/modules/dns/evaluate.ts`: passes
      through `proxied` status, returns `not_evaluated` on a zone/record-level `evaluationError`.
      Dangling-detection (US2) and DNS-only-of-note (US3) branches land in their own phases. Depends
      on T005's types.
- [ ] T007 [US1] Implement `GET /api/dns/inventory` in `worker/modules/dns/routes.ts` per
      contracts/api.md. Depends on T005, T006.
- [ ] T008 [US1] Implement `POST /api/dns/evaluate` in the same routes.ts: runs inventory +
      evaluate, persists to `dns_findings`. Depends on T001, T006.
- [ ] T009 [P] [US1] Build `app/pages/DnsInventory.tsx`, reusing `ExposureStatusBadge` unchanged
      (plan.md's Structure Decision — same status semantics, shared component).
- [ ] T010 [US1] Wire `routes.ts` into the `/api/dns` mount from T002.

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 3: User Story 2 - Dangling record critical flag (Priority: P1)

**Goal**: A record whose target is confirmed dangling (Cloudflare Security Insights) reads as
critical.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [ ] T011 [P] [US2] Unit test in `tests/unit/dns-evaluate.test.ts`: a record matching a Security
      Insights dangling finding evaluates to `critical`; a record with no matching insight evaluates
      to `safe` (pending US3's refinement of what "safe" fully means).
- [ ] T012 [P] [US2] Playwright e2e test: the critical badge renders for a mocked dangling-record
      response, using the same visual assertions as Module 1's US2 test (shape + color + row tint).

### Implementation for User Story 2

- [ ] T013 [US2] Extend `inventory.ts` (T005) to fetch Security Insights findings
      (`GET /accounts/{id}/insights`, filtered to the dangling A/AAAA/CNAME issue types —
      research.md §2; exact query parameters pinned against the live API here, not guessed further
      in advance). Requires the `Zone Security Center Insights` read token scope.
- [ ] T014 [US2] Extend `evaluateRecord()` (T006) with the dangling-match branch: a record whose
      (zone, name, type) matches a fetched insight → `critical`, reason naming the dangling target.
      Depends on T013.

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 4: User Story 3 - DNS-only exposure warning (Priority: P2)

**Goal**: An origin-facing record (`A`/`AAAA`/`CNAME`) set to DNS-only reads as warning;
non-proxy-capable record types read as not-applicable, not DNS-only.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [ ] T015 [P] [US3] Unit test: an `A`/`AAAA`/`CNAME` record with `proxied: false` evaluates to
      `warning`; the same with `proxied: true` evaluates to `safe`; an `MX`/`TXT`/`NS` record
      evaluates with `proxy_capable: false` and is never flagged DNS-only.
- [ ] T016 [P] [US3] Playwright e2e test: the warning badge renders for a mocked DNS-only record,
      distinct from both critical and safe.

### Implementation for User Story 3

- [ ] T017 [US3] Extend `evaluateRecord()` (T006/T014) with the DNS-only-of-note branch, per
      research.md §3 — a direct field read on `proxy_capable`/`proxied`, evaluated only when the
      dangling check (T014) didn't already mark the record critical.

**Checkpoint**: All three status-detection stories (US1, US2, US3) independently functional.

---

## Phase 5: User Story 4 - Scheduled drift alerting (Priority: P2)

**Goal**: The same evaluation runs on a schedule and alerts on new dangling/DNS-only transitions,
joining Module 1's existing scheduled run rather than adding a second one.

**Independent Test**: quickstart.md Scenario 4.

### Tests for User Story 4

- [ ] T018 [P] [US4] Unit test in `tests/unit/dns-alerts.test.ts` (same cases as Module 1's
      `alerts.test.ts`, adapted): first-run alerting, no-repeat on unchanged state, transitions,
      not_evaluated never alert-worthy. Record identity for diffing is
      `zone_name + record_name + record_type + content` (data-model.md's note — round-robin `A`
      records need `content` in the key to stay distinct).

### Implementation for User Story 4

- [ ] T019 [US4] Implement `worker/modules/dns/alerts.ts` — same new-vs-repeat diff shape as Module
      1's `alerts.ts`, DNS record identity per T018.
- [ ] T020 [US4] **Integration point flagged in plan.md's Constitution Check**: add this module's
      evaluation + alert-diffing to the _existing_ `scheduled` handler in `worker/index.ts`
      (alongside Module 1's `runEvaluation` call) — constitution Principle III, one shared Cron
      Trigger entry point, not a second one. Depends on T008, T019.
- [ ] T021 [US4] Implement `GET /api/dns/alerts` in routes.ts per contracts/api.md. Depends on T019.
- [ ] T022 [US4] Implement `POST /api/dns/alerts/:id/acknowledge` in routes.ts. Depends on T019.

**Checkpoint**: All 4 user stories independently functional — Module 2 is feature-complete per
spec.md.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T023 [P] Run all 6 quickstart.md scenarios end-to-end against a real scratch Cloudflare test
      account (same real-account dependency as Module 1's T033 — requires actual Zero Trust
      credentials).
- [ ] T024 [P] Add this module's required token scopes (`Zone Read`, `DNS Read`,
      `Zone Security Center Insights` read) to the README's token-scope table, alongside Module 1's.
- [ ] T025 [P] `deno fmt` + `deno lint` pass across the new `worker/modules/dns/` and
      `app/pages/DnsInventory.tsx` files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — BLOCKS all user stories.
- **US1 (Phase 2)**: Depends on Phase 1. Creates `evaluate.ts`/`inventory.ts` that US2/US3/US4
  extend — same layering as Module 1, for the same reason (one shared evaluation function per
  constitution Principle III).
- **US2 (Phase 3)**: Extends US1's files.
- **US3 (Phase 4)**: Extends US1+US2's files.
- **US4 (Phase 5)**: Depends on US1's persistence (T008) and US3's complete `evaluateRecord()`
  (scheduled runs should detect the same states interactive runs do) — built last by design, same as
  Module 1.
- **Polish**: Depends on US1–US4 complete.

### Parallel Opportunities

- T001 (migration) and T002 (route mount) in parallel.
- Within each story's Tests subsection, `[P]` tasks run in parallel.
- T009 (frontend) can proceed in parallel with T007/T008 (backend) within US1, same as Module 1's
  T017.

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

Both P1, same reasoning as Module 1: an inventory without the dangling- record critical flag doesn't
yet deliver the module's core value.

### Incremental Delivery

1. Foundational → foundation ready.
2. US1 + US2 → MVP: full inventory with dangling-record detection.
3. US3 → adds DNS-only-exposure warning.
4. US4 → adds scheduled drift alerting, joining Module 1's existing scheduled handler.

---

## Notes

- This module deliberately reuses Module 1's architecture at every decision point (shared evaluation
  module, D1 table pair, route shape, status badge component) — where a task says "same pattern as
  Module 1," that is a deliberate consistency choice, not a shortcut.
- T020 is the one task in this module that touches Module 1's existing code (`worker/index.ts`'s
  `scheduled` handler) — review it with that in mind; it must not change Module 1's own evaluation
  behavior, only add to what the shared scheduled invocation does.
- Run `quickstart.md` in full (T023) before considering Module 2 done — same real-account caveat as
  Module 1's T033.

---

## Phase 6: Convergence

- [x] T026 Fix `GET /api/dns/inventory` so a zone with zero DNS records is not silently omitted:
      `runDnsEvaluation` in `worker/modules/dns/routes.ts` derives `dns_findings` rows only via
      `results.flatMap((zone) => zone.records.map(...))`, so a zone with an empty `records` array (a
      legitimate, successfully-enumerated empty zone, per `buildDnsInventory`) contributes zero rows
      to that run; `GET /api/dns/inventory` then groups strictly from `dns_findings` rows, so that
      zone never appears in the response at all — contradicting FR-003 ("every zone represented
      exactly once"), US1/AC3 ("a zone with zero records... appears with an empty record list, not
      omitted entirely"), and SC-002 ("100% of zones... zero silent omissions"). Needs either a
      zone-level row/marker persisted alongside record rows, or the read path to independently
      source the full zone list so an empty zone still renders with an empty record list. per FR-003
      (contradicts)
- [x] T027 Update the README's `Required API token scopes` table (`Account Security Insights` row) —
      the **Cloudflare API endpoint** column still lists `GET /accounts/{id}/insights`, the
      original, pre-correction guess that research.md's 2026-08-11 update confirmed returns a
      Cloudflare routing error (7003/7000) live. The code (`worker/modules/dns/inventory.ts`'s
      `listDanglingInsights`) and research.md §2 both use the corrected path
      `GET /accounts/{id}/security-center/insights`; the README's endpoint column — whose own stated
      purpose is to be "the unambiguous, stable identifier" for finding the right scope in the
      dashboard — was not updated to match. per research.md §2 (partial)

---

## Phase 7: Convergence

- [x] T028 Guard `listZones()`'s call site in `buildDnsInventory`
      (`worker/modules/dns/inventory.ts`) against a total zone-listing failure: unlike
      `buildWorkerInventory` (`worker/modules/workers-access-exposure/inventory.ts`, whose own
      comment explicitly says "same sentinel shape Module 2/3 use for a total projects/zones-list
      failure") and `buildPagesInventory` (`worker/modules/pages/inventory.ts`), which both wrap
      their top-level list call and degrade to a placeholder item carrying `evaluationError` on
      failure, DNS's `buildDnsInventory` calls `listZones(creds, fetchImpl)` unguarded — a missing
      `Zone Read` scope, account-wide API error, or outage throws uncaught out of
      `buildDnsInventory`/`runDnsEvaluation`. In the scheduled path (`worker/index.ts`) this is
      swallowed by the outer `.catch()` with zero `dns_findings` rows written for that run, so
      `GET
      /api/dns/inventory` keeps serving the previous run's data instead of indicating the
      account could not be evaluated; in the interactive `POST /api/dns/evaluate` path it surfaces
      as an unhandled 500 instead of a `not_evaluated` degradation. Per-zone record-listing failures
      are already correctly handled (`dns-inventory.test.ts`'s "a zone whose records can't be
      listed" case) — only the top-level zones list itself is unguarded. per FR-011 (partial)
- [x] T029 Add Playwright e2e coverage in `tests/e2e/dns-inventory.spec.ts` for the `not_evaluated`
      ("N/A") status on a DNS record — US2's Acceptance Scenario 3 ("FlareTower cannot conclusively
      determine whether a record's target is dangling... marked not evaluated, never silently safe")
      is exercised by unit tests (`tests/unit/dns-evaluate.test.ts`'s "not_evaluated (not silently
      safe)... when insights couldn't be fetched at all") but has no corresponding e2e assertion in
      this module's Playwright spec, unlike the `critical` (US2) and `warning`/not-applicable (US3)
      states, which both have dedicated e2e tests. per US2/AC3 (partial)
