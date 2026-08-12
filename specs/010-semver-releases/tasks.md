# Tasks: Semantic Versioning & Version-Gated Production Releases

**Input**: Design documents from `/specs/010-semver-releases/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/workflows.md, quickstart.md

**Tests**: Not explicitly requested for this feature beyond what's already
called out below (a small e2e assertion for the footer's two states) — this
is CI/release-tooling infrastructure with no application logic to unit-test
beyond that one presentational computation.

**Organization**: Tasks are grouped by user story per spec.md's priorities
(US1 → US2 → US3), matching the dependency chain research.md/plan.md
describe: releases must exist (US1) before production can be gated by them
(US2), before a version can be displayed (US3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)

## Phase 1: Setup

**Purpose**: The plain-text version artifact and release-please's own
required config, with no behavior yet — nothing here changes what deploys
or what the app displays.

- [ ] T001 Create repo-root `VERSION` file containing `1.0.0` (no `v` prefix,
      no trailing newline beyond what a normal text file has — data-model.md's
      `VERSION` file format) — the starting point for release-please's first
      release, matching spec.md FR-001/Edge Case 1 ("first release, no prior
      version to compare against ... MUST establish v1.0.0").
- [ ] T002 [P] Create `release-please-config.json` at repo root:
      `release-type: "simple"`, package path `"."`, a generic `extra-files`
      entry targeting `VERSION` (plain-text, whole-file replace — no regex
      needed since the file contains nothing but the version string), and
      `changelog-path: "CHANGELOG.md"` (research.md §2).
- [ ] T003 [P] Create `.release-please-manifest.json` at repo root:
      `{ ".": "1.0.0" }`, matching T001's starting `VERSION` value —
      release-please's own manifest-mode requirement so it knows the current
      version without re-deriving it from git tags on its very first run.

**Checkpoint**: Config files exist; nothing runs yet, nothing deploys
differently yet. Safe to merge in isolation if needed, but has no user-visible
effect until Phase 2/US1 land.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `release` branch itself must exist before either US1's
release workflow or US2's re-pointed Workers Builds setting can do anything
meaningful — release-please needs `main` in place (already true) and the
fast-forward target branch must exist before the first automerge run tries
to fast-forward it.

**⚠️ CRITICAL**: T004 must be done before any part of US1's automerge job
(T008) can succeed, and before US2's manual Cloudflare dashboard step (T012)
makes sense to perform.

- [ ] T004 Create the `release` branch, pushed to `origin`, pointed at the
      same commit as current `origin/main` at the moment this feature's own
      work is ready to ship (research.md §1's "so production doesn't
      silently roll back the moment the branch switch happens" — do this
      right before/as part of merging this feature, not earlier, so it
      doesn't go stale while this feature is still in review).

**Checkpoint**: `release` branch exists and matches `main`. US1 can now be
implemented and merged independently of US2/US3.

---

## Phase 3: User Story 1 - New work is automatically packaged into a versioned release (Priority: P1) 🎯 MVP

**Goal**: Merges to `main` are automatically proposed as a release (via a
standing PR), and that PR can be merged — manually anytime, or by a daily
scheduled job — to actually cut a version + changelog, entirely independent
of whether production deploys differently yet (US2) or the UI shows anything
(US3).

**Independent Test**: Per spec.md — merge a `fix:`/`feat:`-prefixed change
to `main`, confirm a release PR appears/updates with the correct version
bump; merge that PR (or run the automerge workflow manually), confirm a git
tag + GitHub Release + `CHANGELOG.md` entry appear. Verifiable with zero
changes to deployment or the UI.

### Implementation for User Story 1

- [ ] T005 [US1] Create `.github/workflows/release-please.yml`: trigger
      `push: branches: [main]`; `permissions: contents: write, pull-requests:
      write` (release-please needs to create/update PRs and push tags — this
      is the one workflow in the repo needing more than `ci.yml`/`e2e.yml`'s
      read-only `contents: read`); single job running
      `googleapis/release-please-action@v4` with
      `release-type: simple`,
      `config-file: release-please-config.json`,
      `manifest-file: .release-please-manifest.json`. Matches
      contracts/workflows.md's `release-please.yml` contract exactly
      (proposes/updates only, never merges, never touches `release`).
- [ ] T006 [US1] Confirm (via release-please's own `dry-run: true` input, run
      once locally-triggered via `workflow_dispatch` against a throwaway
      test, or by reading its action output on the first real push) that the
      generic `extra-files` updater in T002's config actually rewrites
      `VERSION`'s contents correctly — plan.md's Testing section flags this
      as the one piece of this feature worth a real dry-run rather than
      trusting the config file alone.
- [ ] T007 [US1] Create `.github/workflows/release-automerge.yml`:
      triggers `schedule` (daily cron, e.g. `0 9 * * *` — matches spec.md's
      "roughly daily") + `workflow_dispatch` (FR-004's manual-trigger path);
      `permissions: contents: write, pull-requests: write`; steps: find the
      open release-please PR via `gh pr list --label "autorelease: pending"`
      (release-please's own standard label), if none found exit 0
      (no-op — spec.md Acceptance Scenario 2/FR-002), otherwise
      `gh pr merge --squash` it. Matches contracts/workflows.md's
      `release-automerge.yml` PR-merge half of its contract.
- [ ] T008 [US1] Extend `release-automerge.yml` (same file as T007) with a
      final step, run only after a successful merge: fast-forward `release`
      to the new `main` HEAD (`git fetch origin main && git push origin
      origin/main:release`) — idempotent per contracts/workflows.md (a
      fast-forward to a commit `release` is already at is a no-op, so a
      re-run after a prior success or a run with nothing to merge doesn't
      error). Depends on T004 (the `release` branch must already exist).
- [ ] T009 [US1] Ensure every step in `release-automerge.yml` that can fail
      (PR-merge conflict, fast-forward rejection because `release` diverged)
      causes the workflow run itself to fail/exit non-zero rather than being
      swallowed by `|| true` or similar — spec.md FR-012, contracts/
      workflows.md's explicit "must fail visibly." A failed GitHub Actions
      run is itself the visible signal (shows red in the Actions tab /
      commit status) — no additional notification channel needed beyond
      that, consistent with how `ci.yml`/`e2e.yml` failures are already
      surfaced in this repo.

**Checkpoint**: Merging conventional-commit changes to `main` now produces a
standing, correctly-versioned release PR; merging that PR (by hand or via the
daily job) cuts a real tag/GitHub Release/changelog entry and fast-forwards
`release`. Fully testable per quickstart.md Scenario 1, independent of US2/US3.

---

## Phase 4: User Story 2 - Production only updates when a release ships, not on every merge (Priority: P2)

**Goal**: Cloudflare Workers Builds deploys production from the `release`
branch (which only moves when US1's automerge job fast-forwards it) instead
of from every push to `main`; preview stays completely unaffected.

**Independent Test**: Per spec.md — merge an ordinary change to `main`
without merging the release PR, confirm production doesn't change; merge/
automerge the release PR, confirm production updates as a direct
consequence of `release` advancing (via Workers Builds' own deploy history)
— independently of whether the UI displays a version yet (US3).

### Implementation for User Story 2

- [ ] T010 [US2] **Manual, human-only step (flag clearly to the user, cannot
      be scripted/API'd)**: In the Cloudflare dashboard → **Workers & Pages**
      → `flaretower` → **Settings** → **Build**, change the **Production
      branch** setting from `main` to `release` (research.md §1 — this
      single dashboard field is the entire mechanism; nothing else about the
      existing Workers Builds connection changes). Do this only once T004's
      `release` branch exists and points at a real, working commit — never
      flip this setting while `release` is still unset/stale, or production
      would deploy a stale build on the very next unrelated event.
- [ ] T011 [US2] Confirm the **Preview deploy command**/branch-control
      settings in that same dashboard screen are untouched — preview must
      keep deploying on every push/PR exactly as today (spec.md FR-007,
      Acceptance Scenario 3). This is a verification-only task (screenshot
      or written confirmation of the unchanged preview config), not a code
      change.
- [ ] T012 [US2] Update `README.md`'s Deployment section (the "Connect
      **once**" block, currently listing "**Production branch** (`main`)")
      to say `release` instead of `main`, and add one short paragraph above
      it explaining the new flow: production only deploys when
      `release-automerge.yml` (US1) fast-forwards the `release` branch after
      a release ships — not on every push to `main` — linking to this
      feature's `research.md` §1 for the full rationale (mirrors how the
      constitution/README already cross-reference `specs/` docs elsewhere
      in this project).

**Checkpoint**: Production deploys are now gated by real releases (once T010
is performed by the user); preview is confirmed unaffected. Fully testable
per quickstart.md Scenario 2, independent of US3.

---

## Phase 5: User Story 3 - An operator can see which version is currently running (Priority: P3)

**Goal**: The Sidebar footer shows the real running version in production
builds, and continues to show exactly today's `"self-hosted"`-only text in
local dev / any build with no real release baked in.

**Independent Test**: Per spec.md — load the running (production) app,
confirm the footer shows the version matching the release that triggered the
current deploy; run `deno task dev` locally, confirm the footer shows
`"self-hosted"` only, no fabricated version.

### Implementation for User Story 3

- [ ] T013 [US3] Add `server: { define: ... }`-equivalent build-time
      constant to `vite.config.ts`: read the repo-root `VERSION` file's
      contents at config-evaluation time (Node/Deno `readFileSync`-style
      read, trimmed) and inject via Vite's `define: { __APP_VERSION__:
      JSON.stringify(versionOrEmptyString) }` — falls back to an empty
      string if `VERSION` is missing/unreadable (keeps local dev/any
      unusual build safe by construction, not just by convention;
      data-model.md/FR-010).
- [ ] T014 [P] [US3] Add the ambient type declaration for the injected
      constant (e.g. in `app/vite-env.d.ts`, creating it if it doesn't exist
      yet): `declare const __APP_VERSION__: string;` — matches plan.md's
      Project Structure entry, needed for `deno check`/strict TS
      (Constitution Principle VI) to accept the reference in T015.
- [ ] T015 [US3] In `app/App.tsx`, compute the footer version string from
      `__APP_VERSION__` and pass it as `footer={{ version: ... }}` (the
      existing `Sidebar` prop — no `Sidebar.tsx` change needed, per
      contracts/workflows.md's corrected contract): when `__APP_VERSION__`
      is non-empty, `` `v${__APP_VERSION__} · self-hosted` ``; when empty,
      exactly today's literal `"self-hosted"`. Replaces the current
      hardcoded `footer={{ version: "self-hosted" }}` at
      `app/App.tsx:76`.
- [ ] T016 [US3] Extend `tests/e2e/app-shell.spec.ts`'s existing footer
      assertion (currently `page.getByText("self-hosted")` at line ~113) to
      cover both states: the existing test build (no real `VERSION`-derived
      constant baked into the Playwright webserver's build) continues to
      assert `"self-hosted"` renders with no version prefix; add one new
      assertion that if a `v`-prefixed version segment is ever present, it
      matches the `v\d+\.\d+\.\d+ · self-hosted` shape — guards the format
      itself without requiring a real release to exist in CI.

**Checkpoint**: All three user stories independently functional and testable
per quickstart.md. Full feature complete pending T010's manual dashboard
step.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Repo-wide consistency and final validation once all three
stories are in.

- [ ] T017 [P] Validate both new workflow YAML files (T005, T007) with
      `actionlint` (or GitHub's own workflow syntax check via a throwaway
      push) before this feature's PR merges — plan.md's Testing section /
      quickstart.md's automated-coverage checklist.
- [ ] T018 Run `deno fmt --check`, `deno lint`, and the same `deno check`
      glob `ci.yml` uses, confirming T013–T015's frontend changes are clean.
- [ ] T019 Run the full `deno task test` and `deno task test:e2e` suites
      (not just T016's new assertion) — this project's established
      "full-suite, not just new coverage" verification discipline, since
      touching `App.tsx`'s footer prop is exactly the kind of small change
      that broke unrelated assertions earlier in this engagement (e.g. the
      overview-default-page regression during the Design System feature).
- [ ] T020 Run `specs/010-semver-releases/quickstart.md` Scenario 1 for
      real once T005–T009 are merged to `main` (release PR appears on the
      next qualifying push; manual `workflow_dispatch` of
      `release-automerge.yml` actually cuts v1.0.0 or the next appropriate
      version) — the one part of this feature that can only be verified
      against the real repo, not locally.
- [ ] T021 After T010 (manual dashboard step) is performed by the user and
      T020's release has shipped, run quickstart.md Scenarios 2 and 3 live:
      confirm Workers Builds' deploy history shows a production build
      triggered by the `release` branch fast-forward, and confirm
      `flaretower`'s real production footer shows the released version.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: T004 (create `release` branch) should happen
  right before/at this feature's own merge, not earlier — see T004's note.
  Blocks T008 (US1's fast-forward step) and T010 (US2's dashboard step).
- **US1 (Phase 3)**: Depends on Setup (Phase 1: T001–T003's config files
  must exist for `release-please-action` to run correctly). T008 additionally
  depends on T004.
- **US2 (Phase 4)**: Depends on US1 being merged and having cut at least
  one real release (T010 only makes sense once `release` is a real,
  advancing branch — i.e. after T004 and at least one successful T007–T009
  run).
- **US3 (Phase 5)**: Depends on Setup (Phase 1: T001's `VERSION` file must
  exist for T013 to read). Does NOT depend on US2 being live — the footer
  code is correct and testable (T016) the moment `VERSION`/the Vite `define`
  exist, even before Workers Builds is repointed.
- **Polish (Phase 6)**: T017–T019 depend on all of US1–US3's code existing.
  T020 depends on US1 being merged to `main`. T021 depends on T020 and T010.

### User Story Dependencies

- **US1 (P1)**: No dependencies on US2/US3 — the MVP; releases work
  end-to-end (proposal → tag → GitHub Release → changelog) with zero
  deployment or UI change.
- **US2 (P2)**: Functionally depends on US1 existing (there must be releases
  before production can be gated by them) — matches spec.md's own stated
  ordering ("depends on releases existing first").
- **US3 (P3)**: Only depends on the `VERSION` file (Setup) — can technically
  be implemented in parallel with US1/US2, but has no real version to
  display until US1 has cut at least one release.

### Parallel Opportunities

- T002/T003 (Setup) can run in parallel — different files.
- T013/T014 (US3) can run in parallel — different files, both prerequisites
  for T015.
- T017 (Polish) can run in parallel with T018/T019.
- US1 and US3's *code* (not their live validation) can be implemented in
  parallel by different people, since neither's implementation tasks touch
  the other's files — only the live end-to-end validation (T020/T021)
  requires sequencing.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003).
2. Complete Phase 2: Foundational (T004).
3. Complete Phase 3: User Story 1 (T005–T009).
4. **STOP and VALIDATE**: quickstart.md Scenario 1, live on `main`.
5. This alone is shippable/mergeable — production still deploys on every
   push to `main` exactly as before until US2 lands, so there is zero risk
   of a broken/incomplete production-gating half-state.

### Incremental Delivery

1. Setup + Foundational → release infrastructure config ready.
2. Add US1 → releases actually get cut → validate live → merge.
3. Add US2 (needs the one manual Cloudflare dashboard step, T010, performed
   by the user, not scriptable) → production gated by release → validate
   live → merge.
4. Add US3 → version visible in the UI → validate live → merge.
5. Polish (T017–T021) → final full-suite + live verification pass.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- T010 is the one task in this entire feature that a coding agent cannot
  perform — it must be flagged to and performed by the user (Cloudflare
  dashboard has no Wrangler/API equivalent for this setting, per research.md
  §1).
- Verify the full test suite (not just new assertions) after any change to
  `App.tsx`/`Sidebar`-adjacent code — this project's established discipline
  after real regressions were caught this way during prior features.
- No task touches `worker/` — confirmed by plan.md's Project Structure and
  Constitution Check (this feature is CI/build-tooling plus one frontend
  read).
