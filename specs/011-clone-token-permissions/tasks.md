# Tasks: Clone API Token Permissions

**Input**: Design documents from `/specs/011-clone-token-permissions/` **Prerequisites**: plan.md,
spec.md, research.md, data-model.md, contracts/parser.md, quickstart.md

**Tests**: Explicitly requested via plan.md's Testing section (Constitution Principle VI,
test-first) — the pure parse/diff module is the easiest kind of code in this app to test
exhaustively, and the new page gets Playwright coverage same as every other user-facing page.

**Organization**: Tasks are grouped by user story per spec.md's priorities (US1 → US2), matching
plan.md's dependency shape: the shared parse/render/lookup foundation (Foundational phase) is a
prerequisite for both stories; US1 (reuse) and US2 (compare) then build on it independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2)

## Phase 1: Setup

**Purpose**: N/A — this feature adds no new dependency, config file, or toolchain change (plan.md's
Constitution Check). Nothing to set up before Foundational work starts.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The parse/render/lookup/compare logic and its data (data-model.md, contracts/parser.md)
is shared by both user stories — neither story's UI can be built before this exists.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [ ] T001 [P] Populate `app/lib/cloudflare-permission-groups.ts`: a curated static
      `Record<string, string>` (permission-group ID → human name — data-model.md), covering the
      scopes README's own "Required API token scopes" table already documents (Workers Scripts Read,
      Workers Routes Read, Access: Apps and Policies Read, Zone Read, DNS Read, Account Security
      Insights, Access: Service Tokens Read, Cloudflare Pages Read, Workers R2 Storage Read, and the
      remaining rows in that table). Source the real IDs via a one-time, out-of-band read against
      `GET /user/tokens/permission_groups` using an already-authorized credential with broader
      access than FlareTower's own token needs (research.md §2 — this lookup is explicitly NOT
      something FlareTower's own runtime code ever calls; populating this static file is a one-time
      authoring step, same category as any other reference data committed to the repo). Add a
      comment citing where/when this was sourced, same convention as `nav-items.ts`'s own sourcing
      comment.
- [ ] T002 [P] Implement `app/lib/token-permissions.ts` per contracts/parser.md:
      `parseTokenPayload`, `renderChecklist`, `toReusablePayload`, `comparePolicies` — all pure, no
      I/O, matching data-model.md's `ParsedPolicy`/`ChecklistItem`/`ComparisonResult` shapes
      exactly.
- [ ] T003 [P] Write `tests/unit/token-permissions.test.ts` alongside T002 (test-first per
      Constitution Principle VI): valid parse, invalid JSON, valid-JSON-wrong-shape (missing
      `policies`/`effect`/`permission_groups`/`resources`), checklist name resolution in all three
      orders (inline name / curated table / raw-ID fallback with `recognized: false`),
      `toReusablePayload`'s exact output shape (drops `name`/`meta`/`expires_on`/`not_before`/
      `condition`), and `comparePolicies` across all four combinations (match/match, groups differ,
      resources differ, both differ) — matches quickstart.md's automated-coverage checklist.

**Checkpoint**: `token-permissions.ts` and its data are correct and fully unit-tested. Both user
stories can now be built independently.

---

## Phase 3: User Story 1 - Reuse an existing token's permissions when creating a new one (Priority: P1) 🎯 MVP

**Goal**: An operator pastes a token's permission JSON and gets back a human-readable checklist and
a reusable payload for creating a matching new token — entirely client-side.

**Independent Test**: Per spec.md — paste a real token's permission JSON, confirm the checklist and
reusable payload are correct; paste invalid input, confirm a clear error.

### Implementation for User Story 1

- [ ] T004 [US1] Create `app/pages/TokenToolsPage.tsx`: a paste-in textarea calling
      `parseTokenPayload`; on success, renders `renderChecklist`'s output as a list (grouped by
      policy) and `toReusablePayload`'s output as a copyable JSON block; on failure, renders the
      returned error message clearly (spec.md FR-008). Includes the permanent notice required by
      contracts/parser.md's own contract ("this tool only reformats/compares what's pasted — never
      touches your actual Cloudflare account," spec.md FR-009). Follows the app's existing visual
      language (tokens, `EmptyState`/`AlertBanner`-style components where they fit) — not covered by
      `docs/design.zip`'s own reference screens, so this is a new screen designed in the same
      language, noted explicitly in the PR description per the constitution's Design System section.
- [ ] T005 [US1] Wire up navigation: add a `token-tools` entry to `app/nav-items.ts` (a new
      12x12-viewBox icon path, hand-drawn in the same thin-line style as the existing icons since
      this destination has no equivalent in `docs/design.zip`'s own NAV array — noted explicitly,
      same convention as `nav-items.ts`'s existing sourcing comments) and a matching entry in
      `app/App.tsx`'s `PAGES` array rendering `TokenToolsPage`.
- [ ] T006 [P] [US1] Write `tests/e2e/token-tools.spec.ts` covering: paste valid payload → correct
      checklist + reusable payload rendered; paste invalid input → specific error shown; **assert no
      network request fires while using this page** (e.g. via Playwright's `page.on("request")`
      listener asserting zero calls, or an explicit route-mock that fails the test if hit) — the
      strongest possible proof of FR-005/FR-007, not just an inference from reading the source.

**Checkpoint**: An operator can go from a pasted token payload to a ready-to-use new-token payload,
entirely locally. Fully testable per quickstart.md Scenario 1, independent of US2.

---

## Phase 4: User Story 2 - Verify two tokens' permissions actually match (Priority: P2)

**Goal**: An operator pastes two token permission payloads and sees whether they match, or exactly
how they differ, across both the permission-groups and resources dimensions independently.

**Independent Test**: Per spec.md — paste two identical payloads, confirm "match"; paste two
differing payloads, confirm the specific difference is named; paste two payloads with matching
permission groups but different resource scoping, confirm that mismatch is surfaced too.

### Implementation for User Story 2

- [ ] T007 [US2] Extend `TokenToolsPage.tsx` with a compare mode: a second paste input, calling
      `comparePolicies` on both parsed payloads, rendering `ComparisonResult` as: a clear
      match/no-match summary, plus (when not matching) the specific `onlyInA`/`onlyInB` entries for
      both the `permissionGroups` and `resources` dimensions, named via the same
      `renderChecklist`/lookup-table resolution as US1 (raw IDs shown for resources, since those are
      inherently account/zone-specific strings, not permission-group names).
- [ ] T008 [P] [US2] Write e2e coverage (extend `tests/e2e/token-tools.spec.ts` or a new spec) for:
      two identical payloads → "match"; two payloads differing by one permission group → that group
      named as the difference; two payloads with identical `permission_groups` but different
      `resources` → a resources-only mismatch is still surfaced (research.md §3's core point — the
      case a naive single-boolean diff would hide).

**Checkpoint**: Both user stories independently functional and testable per quickstart.md.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T009 [P] `deno fmt --check` / `deno lint` / `deno check` (including the two new `app/lib/*.ts`
      files and `TokenToolsPage.tsx`) clean.
- [ ] T010 Run the full `deno task test` and `deno task test:e2e` suites (not just this feature's
      new coverage) — this project's established full-suite verification discipline, since a new nav
      entry/page touches `App.tsx`/`nav-items.ts`, exactly the kind of shared file that broke
      unrelated assertions earlier in this project's history.
- [ ] T011 Confirm no new row is needed in README's "Required API token scopes" table — direct,
      positive confirmation that this feature shipped with zero new Cloudflare API scope (spec.md
      SC-003), not just an absence of a PR diff there.
- [ ] T012 Run quickstart.md's manual scenarios end-to-end at least once with a real token payload
      (or a realistic hand-written sample, since no real Cloudflare account action is required by
      this feature at all) — confirms the whole loop, paste-to-checklist-to-reusable-
      payload-to-real-token-creation-to-comparison, actually works as designed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: N/A, nothing to do.
- **Foundational (Phase 2)**: No dependencies — can start immediately. BLOCKS both user stories.
- **US1 (Phase 3)**: Depends on Foundational (T001–T003).
- **US2 (Phase 4)**: Depends on Foundational (T001–T003). Builds on US1's `TokenToolsPage.tsx`
  (T004) as the same file, so in practice follows US1, but its own logic (T007/T008) doesn't depend
  on anything US1-specific beyond that shared page shell existing.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependencies beyond Foundational — the MVP; a fully working reuse tool with zero
  comparison feature.
- **US2 (P2)**: Builds on the same page US1 creates (T004) — not independently deployable as a
  separate page, but its own acceptance scenarios are independently testable once present.

### Parallel Opportunities

- T001/T002/T003 (Foundational) can run in parallel — different files, though T003 is most naturally
  written alongside T002 (test-first).
- T006 (US1 e2e) can run in parallel with T005 (nav wiring) once T004 exists.
- T008 (US2 e2e) can run in parallel with other Polish tasks once T007 exists.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001–T003).
2. Complete Phase 3: User Story 1 (T004–T006).
3. **STOP and VALIDATE**: quickstart.md Scenario 1.
4. Fully shippable on its own — the "verify two tokens match" capability (US2) is additive, not
   required for the core "reuse a permission set" value.

### Incremental Delivery

1. Foundational → parse/render/compare logic ready, fully unit-tested.
2. Add US1 → operator can reuse a token's permissions → validate → merge.
3. Add US2 → operator can verify two tokens match → validate → merge.
4. Polish (T009–T012) → final full-suite + manual quickstart pass.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- No task touches `worker/` or any D1 migration — confirmed by plan.md's Project Structure and
  Constitution Check; this is the first FlareTower feature with zero backend touch points.
- T001 is the one task requiring an actual (already-authorized, broader-than-FlareTower's-own)
  Cloudflare API read, done once by the implementer out-of-band — not something FlareTower's shipped
  code ever does, and not blocking if that data ends up sourced from Cloudflare's public
  docs/community references instead of a live read.
