---

## description: "Task list for DNS Dashboard implementation"

# Tasks: DNS Dashboard

**Input**: Design documents from `/specs/013-dns-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: Included and REQUIRED (constitution Principle VI).

**Organization**: By user story (US1 P1, US2 P2, US3 P2). No Foundational phase — this spec extends
Module 2's existing files rather than scaffolding a new module.

---

## Phase 1: User Story 1 - Browse one zone's records at a time (Priority: P1) 🎯 MVP

**Goal**: Zone tabs above the table; only the selected zone's records shown.

**Independent Test**: quickstart.md Scenario 1.

### Tests for User Story 1

- [x] T001 [P] [US1] Playwright e2e test in `tests/e2e/dns-inventory.spec.ts` (mocked, multi-zone
      `GET /api/dns/inventory`): zone tabs render with correct name+count; selecting a different tab
      swaps the table to that zone's records only, no reload; a zero-record zone shows its own empty
      state when selected.

### Implementation for User Story 1

- [x] T002 [US1] Rewrite `app/pages/DnsInventory.tsx`: add zone-tab row (local `useState` for
      selected zone, defaulting to the first zone), pass only the selected zone's records to the
      existing `FindingsTable` (unchanged component — research.md §4), remove the old flattened
      cross-zone row-building logic.

**Checkpoint**: User Story 1 fully functional and independently testable — MVP.

---

## Phase 2: User Story 2 - Proxy status and TTL columns (Priority: P2)

**Goal**: Each record row shows Proxy status (proxied / DNS only / not applicable) and TTL.

**Independent Test**: quickstart.md Scenario 2.

### Tests for User Story 2

- [x] T003 [P] [US2] Unit test in `tests/unit/dns-inventory.test.ts`: `listZoneRecords()` parses
      `ttl` from the raw Cloudflare response (research.md §1).
- [x] T004 [P] [US2] Playwright e2e test: a proxied record shows "proxied" + `ttl` "auto"; an
      unproxied capable record shows "DNS only" + its real TTL; a non-proxy-capable record (MX/TXT)
      shows "not applicable".

### Implementation for User Story 2

- [x] T005 [US2] Add `worker/db/migrations/0009_dns_findings_add_ttl.sql`: `ALTER TABLE dns_findings
      ADD COLUMN ttl INTEGER` (data-model.md).
- [x] T006 [P] [US2] Extend `worker/modules/dns/types.ts`: add `ttl?: number` to `DnsRecord`, `ttl:
      number | null` to `DnsRecordEvaluation`.
- [x] T007 [US2] Extend `worker/modules/dns/inventory.ts`'s `RawDnsRecord`/`buildDnsInventory()` to
      capture `ttl` from the existing `listZoneRecords()` response (research.md §1). Depends on T006.
- [x] T008 [US2] Extend `worker/modules/dns/evaluate.ts`'s `evaluateRecord()` to carry `ttl` through
      into its returned `DnsRecordEvaluation` unchanged (pure pass-through, no new branch). Depends
      on T006, T007.
- [x] T009 [US2] Extend `worker/modules/dns/routes.ts`: persist `ttl` in `runDnsEvaluation`'s INSERT,
      read it back in `GET /inventory`'s response (`ttl` field, contracts/api.md). Depends on T005,
      T008.
- [x] T010 [US2] Extend `DnsInventory.tsx` (T002): add Proxy and TTL columns to the table (a small
      local `ProxyStatusPill` presentational helper — proxied/DNS-only/not-applicable — distinct
      from the existing Finding status pill FindingsTable already renders).

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 3: User Story 3 - Ineffective DMARC policy warning (Priority: P2)

**Goal**: A `_dmarc` TXT record with `p=none` is flagged; one with `p=quarantine`/`p=reject`, or a
zone with no `_dmarc` record, is not.

**Independent Test**: quickstart.md Scenario 3.

### Tests for User Story 3

- [x] T011 [P] [US3] Unit test in `tests/unit/dns-evaluate.test.ts`: `evaluateDmarcPolicy()` —
      `p=none` → warning; `p=quarantine`/`p=reject` → no warning from this check; an unparseable
      value → no fabricated warning (spec.md Edge Cases); a non-`_dmarc` record → this check never
      applies to it at all.
- [x] T012 [P] [US3] Unit test: `isPlatformTargetDomain()` — `*.pages.dev`/`*.workers.dev` content →
      `true`; anything else → `false`; never affects `status`.
- [x] T013 [P] [US3] Playwright e2e test: the `p=none` `_dmarc` record shows a DMARC warning; a zone
      with `p=reject` or no `_dmarc` record shows none; a record pointing at a platform domain shows
      the informational label without a warning/critical color.

### Implementation for User Story 3

- [x] T014 [P] [US3] Implement `evaluateDmarcPolicy()` and `isPlatformTargetDomain()` as pure
      functions in `worker/modules/dns/evaluate.ts` (research.md §2, §3).
- [x] T015 [US3] Wire both into `evaluateRecord()`: DMARC check applies only when `recordName`
      starts with `_dmarc.` and `recordType === "TXT"`; platform-domain match sets
      `isPlatformTarget` unconditionally (independent of `status`). Depends on T014.
- [x] T016 [US3] Extend `routes.ts`'s `GET /inventory` response to include `is_platform_target`
      (contracts/api.md). Depends on T009, T015.
- [x] T017 [US3] Extend `DnsInventory.tsx` (T010): render the DMARC warning's reason text (already
      carried by the existing Finding/reason column) and a small informational badge for
      `is_platform_target` records.

**Checkpoint**: All 3 user stories independently functional — Module 013 is feature-complete per
spec.md.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Run all 4 quickstart.md scenarios end-to-end against a real scratch Cloudflare test
      account (real-account dependency, same as every prior module's equivalent task).
- [x] T019 [P] `deno fmt` + `deno lint` pass across every touched file.

---

## Dependencies & Execution Order

US1 (zone tabs) has no dependency on US2/US3 and is independently shippable (MVP). US2's backend
chain (T005→T006→T007→T008→T009) is sequential (same files/columns each step builds on); its
frontend task (T010) depends on T002 (US1's rewrite) existing first. US3 is independent of US2's
column additions but shares the same `routes.ts`/`DnsInventory.tsx` files, so its implementation
tasks are sequenced after US2's for those two files specifically.

### Parallel Opportunities

T003/T004 in parallel; T006 parallel with T005 (different files); T011/T012/T013 in parallel; T014 is
one task covering two independent pure functions, doable as one unit.

---

## Implementation Strategy

### MVP First (User Story 1)

Zone-tab isolation alone is a real usability improvement over today's flattened table — P1,
independently shippable before any new Finding logic exists.

### Incremental Delivery

1. US1 → MVP: zone-tabbed browsing.
2. US2 → adds Proxy/TTL columns (no new findings, just more visible data).
3. US3 → adds the two new Finding-adjacent signals (DMARC warning, platform-domain label).

---

## Notes

- T009/T016 and T010/T017 are the two files (`routes.ts`, `DnsInventory.tsx`) touched across both
  US2 and US3 — review each extension with that in mind, same caveat as every prior module's
  equivalent shared-file task.
- Run `quickstart.md` in full (T018) before considering Module 013 done — same real-account caveat as
  every prior module.
