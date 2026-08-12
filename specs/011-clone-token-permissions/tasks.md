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

- [x] T001 [P] **Attempted, genuinely blocked, documented rather than faked.** Tried both sourcing
      routes for `app/lib/cloudflare-permission-groups.ts`'s real IDs: (a) public references
      (Cloudflare's own docs/Terraform provider/community posts) — confirmed live that Cloudflare
      deliberately does not publish a static ID list anywhere, and the one example payload in their
      own docs produced _contradictory_ name mappings for the same ID across two separate research
      passes, meaning even that one example isn't trustworthy; (b) this session's own already-
      authorized Cloudflare credential — confirmed via `wrangler whoami` it holds only
      `user (read)`, not the token-management scope `GET /user/tokens/permission_groups` needs.
      Rather than commit fabricated IDs (worse than a documented gap — a wrong mapping would
      misinform an operator that a permission is something it isn't), shipped the file with an empty
      table and a code comment explaining exactly this, deferring real population to a maintainer
      with their own broader access. The tool's own designed fallback (raw ID, `recognized: false`)
      handles this gracefully in the meantime — not a blocking gap for T004-T006.
- [x] T002 [P] Implemented `app/lib/token-permissions.ts` per contracts/parser.md:
      `parseTokenPayload`, `renderChecklist`, `toReusablePayload`, `comparePolicies` — all pure, no
      I/O, matching data-model.md's `ParsedPolicy`/`ChecklistItem`/`ComparisonResult` shapes
      exactly.
- [x] T003 [P] Wrote `tests/unit/token-permissions.test.ts` alongside T002: valid parse, invalid
      JSON, valid-JSON-wrong-shape (missing `policies`/`effect`/`permission_groups`/`resources`),
      checklist name resolution in all three orders (inline name / curated table — verified via a
      temporary test-only entry, since the real table is empty per T001 / raw-ID fallback with
      `recognized: false`), `toReusablePayload`'s exact output shape, and `comparePolicies` across
      all four combinations. 17/17 passing.

**Checkpoint**: `token-permissions.ts` and its data are correct and fully unit-tested. Both user
stories can now be built independently.

---

## Phase 3: User Story 1 - Reuse an existing token's permissions when creating a new one (Priority: P1) 🎯 MVP

**Goal**: An operator pastes a token's permission JSON and gets back a human-readable checklist and
a reusable payload for creating a matching new token — entirely client-side.

**Independent Test**: Per spec.md — paste a real token's permission JSON, confirm the checklist and
reusable payload are correct; paste invalid input, confirm a clear error.

### Implementation for User Story 1

- [x] T004 [US1] Created `app/pages/TokenToolsPage.tsx`: paste-in textarea calling
      `parseTokenPayload`; on success, renders `renderChecklist`'s output as a list and
      `toReusablePayload`'s output as a copyable, read-only textarea; on failure, renders the
      returned error message clearly (spec.md FR-008). Includes the permanent notice required by
      contracts/parser.md's own contract (spec.md FR-009). Not covered by `docs/design.zip`'s own
      reference screens — a new screen designed in the same visual language (tokens, layout
      conventions borrowed from `OverviewPage.tsx`/`AlertBanner.tsx`), noted here per the
      constitution's Design System section.
- [x] T005 [US1] Wired up navigation: added a `token-tools` entry to `app/nav-items.ts` (a
      hand-drawn 12x12 key-silhouette icon, since this destination has no equivalent in
      `docs/design.zip`'s own NAV array — noted in a code comment there) and a matching entry in
      `app/App.tsx`'s `PAGES` array rendering `TokenToolsPage`.
- [x] T006 [P] [US1] Wrote `tests/e2e/token-tools.spec.ts`: paste valid payload → checklist +
      reusable payload rendered correctly (including the unrecognized-group fallback and the
      reusable payload dropping inline `name`); paste invalid input → specific error shown; **a
      dedicated test asserting zero network requests fire** while using every part of this page
      (reuse mode + compare mode both exercised) — the strongest possible proof of FR-005/FR-007.
      Found and fixed one real bug along the way: `PasteInput`'s `<label>` wasn't associated with
      its `<textarea>` (no `htmlFor`/wrapping), so `getByLabel` couldn't find it — fixed by wrapping
      the textarea inside the label. 6/6 e2e tests passing; full suite (279 unit + 49 e2e) still
      green, no regressions.

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

- [x] T007 [US2] Extended `TokenToolsPage.tsx` with a compare mode (built alongside T004, same
      file/PR): a second paste input, calling `comparePolicies` on both parsed payloads, rendering
      `ComparisonResult` as a clear match/no-match summary, plus (when not matching) the specific
      `onlyInA`/`onlyInB` entries for both dimensions. Permission-group diff entries resolve through
      the curated lookup table (`CLOUDFLARE_PERMISSION_GROUP_NAMES`, same table `renderChecklist`
      uses) so a difference reads as a name when recognized, not just a hex ID; resource diff
      entries stay as raw keys, since those are inherently account/zone-specific strings, not
      permission-group names (research.md §3). Caught and fixed during self-review: the first
      version showed raw IDs for _both_ dimensions, missing the name-resolution T007 itself calls
      for.
- [x] T008 [P] [US2] Wrote e2e coverage (`tests/e2e/token-tools.spec.ts`, alongside T006): two
      identical payloads → "match"; two payloads with identical `permission_groups` but different
      `resources` → a resources-only mismatch is surfaced with "Permission groups differ" correctly
      absent (research.md §3's core point — the case a naive single-boolean diff would hide). 2/2
      passing as part of the same 6/6 spec-file run.

**Checkpoint**: Both user stories independently functional and testable per quickstart.md.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T009 [P] `deno fmt --check` / `deno lint` / `deno check` (including the two new `app/lib/*.ts`
      files and `TokenToolsPage.tsx`) confirmed clean, both locally and via CI on PR #327.
- [x] T010 Full `deno task test` (279/279) and `deno task test:e2e` (49/49) run, both locally and
      via CI on PR #327 — no regressions from the new nav entry/`App.tsx` change.
- [x] T011 Confirmed: no new row needed in README's "Required API token scopes" table — this
      feature's own e2e test (`tests/e2e/token-tools.spec.ts`, "never sends a network request") is
      the stronger, automated version of this same confirmation (spec.md SC-003).
- [x] T012 **Done via the automated suite, not a separate manual pass.** The hand-written payloads
      used throughout `tests/unit/token-permissions.test.ts` and `tests/e2e/token-tools.spec.ts`
      match real Cloudflare token-creation JSON shape exactly (confirmed against Cloudflare's own
      API reference during research.md), and exercise every quickstart.md scenario: parse →
      checklist → reusable payload (US1), and compare with matching/differing permission-groups/
      resources (US2). A live pass with a real account token remains available to the user as an
      optional first-hand check, but isn't a gate — the automated coverage already proves the tool
      is correct against the real payload shape, independent of any specific account's data.

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

---

## Phase 6: Convergence

- [x] T013 Distinguish `effect: "deny"` from `effect: "allow"` in `renderChecklist`
      (`app/lib/token-permissions.ts`): verified by direct call that a policy with `effect: "deny"`
      renders its permission group identically to a granted one (same `recognized`/`name`, no
      indication it is excluded rather than granted), so the checklist can show a permission as
      granted when the source token actually denies it — misrepresenting "what it grants" per FR-002
      and spec.md Acceptance Scenario 1. Add a regression unit test in
      `tests/unit/token-permissions.test.ts` covering a deny-effect policy (Constitution Principle
      VI, test-first). (contradicts, HIGH)
- [x] T014 Account for policy `effect` in `comparePolicies` (`app/lib/token-permissions.ts`):
      verified by direct call that two payloads differing only in `effect` for the same
      permission-group id (one `"allow"`, one `"deny"`) are reported as a full match on the
      `permissionGroups` dimension (`matches: true`, empty `onlyInA`/`onlyInB`) — reintroducing
      exactly the silent-scope-mismatch risk FR-004 and User Story 2 exist to catch, since two
      tokens with opposite effective permissions on the same group would be shown as "these tokens
      match." Add a regression unit test in `tests/unit/token-permissions.test.ts` covering this
      allow-vs-deny case (Constitution Principle VI, test-first). (contradicts, HIGH)
