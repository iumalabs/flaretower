# Tasks: Semantic Versioning & Version-Gated Production Releases

**Input**: Design documents from `/specs/010-semver-releases/` **Prerequisites**: plan.md, spec.md,
research.md, data-model.md, contracts/workflows.md, quickstart.md

**Tests**: Not explicitly requested for this feature beyond what's already called out below (a small
e2e assertion for the footer's two states) — this is CI/release-tooling infrastructure with no
application logic to unit-test beyond that one presentational computation.

**Organization**: Tasks are grouped by user story per spec.md's priorities (US1 → US2 → US3),
matching the dependency chain research.md/plan.md describe: releases must exist (US1) before
production can be gated by them (US2), before a version can be displayed (US3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)

## Phase 1: Setup

**Purpose**: The plain-text version artifact and release-please's own required config, with no
behavior yet — nothing here changes what deploys or what the app displays.

- [x] T001 Create repo-root `VERSION` file containing `1.0.0` (no `v` prefix, no trailing newline
      beyond what a normal text file has — data-model.md's `VERSION` file format) — the starting
      point for release-please's first release, matching spec.md FR-001/Edge Case 1 ("first release,
      no prior version to compare against ... MUST establish v1.0.0").
- [x] T002 [P] Create `release-please-config.json` at repo root:
      `{ "packages": { ".": { "release-type": "simple", "version-file":
      "VERSION" } } }` —
      confirmed against release-please's actual source (`DefaultUpdater`/`schemas/config.json`) that
      `version-file` is the correct, minimal way to point the `simple` strategy's built-in
      whole-file version updater at a non-default filename; no `extra-files`/`type: "generic"`/regex
      marker needed for this whole-file-is-just-the-version case (research.md §2).
- [x] T003 [P] Create `.release-please-manifest.json` at repo root: `{ ".": "1.0.0" }`, matching
      T001's starting `VERSION` value — release-please's own manifest-mode requirement so it knows
      the current version without re-deriving it from git tags on its very first run.

**Checkpoint**: Config files exist; nothing runs yet, nothing deploys differently yet. Safe to merge
in isolation if needed, but has no user-visible effect until Phase 2/US1 land.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `release` branch itself must exist before either US1's release workflow or US2's
re-pointed Workers Builds setting can do anything meaningful — release-please needs `main` in place
(already true) and the fast-forward target branch must exist before `release-please.yml`'s
fast-forward step (T008) first tries to push to it.

**⚠️ CRITICAL**: T004 must be done before T008's fast-forward step can succeed, and before US2's
manual Cloudflare dashboard step (T012) makes sense to perform.

- [x] T004 Create the `release` branch, pushed to `origin`, pointed at the same commit as current
      `origin/main` at the moment this feature's own work is ready to ship (research.md §1's "so
      production doesn't silently roll back the moment the branch switch happens" — do this right
      before/as part of merging this feature, not earlier, so it doesn't go stale while this feature
      is still in review).
- [x] **T004b — NEW, manual, human-only step, discovered live, now resolved**:
      `release-please.yml`'s first real run (triggered by T005-T009's own merge to `main`) confirmed
      the workflow logic itself works — it correctly found 87 candidate commits, built a release
      branch/commit — but failed at the final "create PR" API call with
      `GitHub Actions is
      not permitted to create or approve pull requests`. This was an
      organization-level setting (**Settings → Actions → General → Workflow permissions → "Allow
      GitHub Actions to create and approve pull requests"**, unchecked by default; the repo-level
      toggle was greyed out because the org policy overrode it), not something `contents: write`/
      `pull-requests: write` workflow permissions alone could grant, and not scriptable via `gh`/the
      API without already having this permission. The user enabled it at the org level; a re-run of
      the same workflow immediately succeeded (T006).

**Checkpoint**: `release` branch exists and matches `main`. US1 can now be implemented and merged
independently of US2/US3.

---

## Phase 3: User Story 1 - New work is kept ready to release, with zero manual versioning work (Priority: P1) 🎯 MVP

**Goal**: Merges to `main` are automatically proposed as a release (via a standing PR); a maintainer
ships it by merging that PR whenever they choose — immediately, or after letting several changes
accumulate — with zero manual versioning/changelog work, entirely independent of whether production
deploys differently yet (US2) or the UI shows anything (US3).

**Independent Test**: Per spec.md — merge a `fix:`/`feat:`-prefixed change to `main`, confirm a
release PR appears/updates with the correct version bump; merge that PR, confirm a git tag + GitHub
Release + `CHANGELOG.md` entry appear. Verifiable with zero changes to deployment or the UI.

### Implementation for User Story 1

- [x] T005 [US1] Create `.github/workflows/release-please.yml`: trigger `push: branches: [main]`;
      `permissions: contents: write, pull-requests:
      write` (release-please needs to
      create/update PRs and push tags — this is the one workflow in the repo needing more than
      `ci.yml`/`e2e.yml`'s read-only `contents: read`); single job running
      `googleapis/release-please-action@v4` with `config-file: release-please-config.json`,
      `manifest-file: .release-please-manifest.json`. Matches contracts/workflows.md's
      `release-please.yml` contract exactly (proposes/updates only, never merges, never touches
      `release`).
- [x] T006 [US1] **Live-verified (2026-08-12)**: after fixing a real blocker discovered along the
      way (the org's "Allow GitHub Actions to create and approve pull requests" setting was off, so
      `release-please.yml`'s first run correctly built a release but couldn't open the PR — user
      enabled it at the org level), a re-run correctly opened PR #310 "chore(main): release 1.1.0",
      bumping `VERSION` via `version-file` (T002) exactly as designed. `1.1.0` (not `1.0.0`) because
      `feat:`-prefixed commits had already landed on `main` since the `1.0.0` manifest baseline —
      correct minor-bump classification, not a bug. Merged by the user directly; see T008's note for
      the real fast-forward bugs that merge path exposed.
- [x] ~~T007~~ — **REMOVED (2026-08-12), see below.** Originally: a `release-automerge.yml` daily
      scheduled job auto-merging the standing PR, to satisfy the original request's literal
      "unattended daily" framing. **Live-tested via `workflow_dispatch` and confirmed broken**: its
      `gh pr merge`, authenticated with the default `GITHUB_TOKEN`, merged the PR (`VERSION`/
      `CHANGELOG.md` landed on `main` correctly, since those are just part of the merged diff) but
      never triggered a second `release-please.yml` run — GitHub Actions deliberately does not let a
      `GITHUB_TOKEN`-authored push trigger downstream workflows (anti-recursion protection, not a
      permission that can be granted). The maintainer confirmed sibling projects (`odograph`,
      `typstreak`) already work without any such job — they merge the standing PR themselves
      whenever ready — and preferred that over provisioning a new PAT/GitHub App just to route
      around the platform restriction. Deleted `release-automerge.yml` entirely; see spec.md's User
      Story 1 Scope note, research.md §2, contracts/workflows.md.
- [x] T008 [US1] **Revised twice, see history below.** Current, correct design: a follow-up step
      inside `release-please.yml`'s own job (not a separate workflow), gated on
      `steps.release.outputs.release_created`, fast-forwards `release` to
      `steps.release.outputs.sha` — idempotent per contracts/workflows.md. Depends on T004 (the
      `release` branch must already exist) and on the job having an `actions/checkout@v4` step so
      the tagged commit is present locally to push. - _v1 (removed)_: the fast-forward lived inside
      `release-automerge.yml`'s own merge step. Confirmed live that a maintainer merging the
      standing PR by hand (T007's own removal, or FR-004's supported path even before that) bypassed
      it entirely. - _v2 (removed)_: moved to a standalone `release-publish.yml` on
      `on: release: types:
        [published]`. **Confirmed live it never fired even once**
      (`gh api
        .../actions/workflows/<id>/runs` → `total_count: 0`), despite a real release
      (v1.1.1) publishing after this workflow existed on `main`. Root cause (confirmed against
      `googleapis/release-please-action`'s own README): release-please-action's tag/release creation
      is _itself_ GITHUB_TOKEN-authenticated — the same restriction as T007's bug, one step further
      down the chain, unrelated to who merged the PR. - _v3 (current)_: the action's own README
      documents the fix directly — check `steps.release.outputs.release_created`/`sha` in a
      follow-up step of the _same job_. Same-job steps aren't "triggering a workflow," so the
      restriction doesn't apply. Zero new credentials.
- [x] T009 [US1] The fast-forward step in `release-please.yml` runs under `set -euo pipefail` with
      no bypass flags and no `|| true` swallowing — a failure there fails the job itself, visible in
      the Actions tab/commit status (spec.md FR-012, contracts/workflows.md's explicit "must fail
      visibly"), consistent with how `ci.yml`/`e2e.yml` failures already surface in this repo.
- [x] T009b — **One-time manual catch-up, twice, then confirmed unnecessary going forward**: v1.1.0
      (T006) was published before any fast-forward mechanism existed; v1.1.1 was published while the
      (broken) `release-publish.yml` existed but never fired (T008's v2 bug) — neither ever got
      `release` advanced automatically. One-time `git push origin <commit>:release` performed for
      both after T008's v3 fix landed, to catch `release` up to the latest real release (v1.1.1)
      just before the live test below. **Live end-to-end confirmation (2026-08-12)**: merged the
      next standing release PR (v1.1.2, #315) and watched the triggered `release-please.yml` run
      directly (`gh run watch`) — its `Fast-forward release branch` step ran and succeeded in the
      _same job_, with zero manual intervention, zero new credentials. `release` now points at the
      v1.1.2 commit, confirmed via `git log origin/release`. No further manual catch-up needed for
      any future release.

**Checkpoint**: Merging conventional-commit changes to `main` now produces a standing,
correctly-versioned release PR; a maintainer merging that PR whenever they choose cuts a real
tag/GitHub Release/changelog entry and fast-forwards `release`. Fully testable per quickstart.md
Scenario 1, independent of US2/US3.

---

## Phase 4: User Story 2 - Production only updates when a release ships, not on every merge (Priority: P2)

**Goal**: Cloudflare Workers Builds deploys production from the `release` branch (which only moves
when US1's `release-please.yml` fast-forward step advances it, in reaction to a maintainer shipping
a release) instead of from every push to `main`; preview stays completely unaffected.

**Independent Test**: Per spec.md — merge an ordinary change to `main` without merging the release
PR, confirm production doesn't change; merge the release PR, confirm production updates as a direct
consequence of `release` advancing (via Workers Builds' own deploy history) — independently of
whether the UI displays a version yet (US3).

### Implementation for User Story 2

- [x] T010 [US2] **Done (2026-08-12), by the user**. **Manual, human-only step (flag clearly to the
      user, cannot be scripted/API'd)**: In the Cloudflare dashboard → **Workers & Pages** →
      `flaretower` → **Settings** → **Build**, change the **Production branch** setting from `main`
      to `release` (research.md §1 — this single dashboard field is the entire mechanism; nothing
      else about the existing Workers Builds connection changes). Do this only once T004's `release`
      branch exists and points at a real, working commit — never flip this setting while `release`
      is still unset/stale, or production would deploy a stale build on the very next unrelated
      event.
- [x] T011 [US2] **Partially verified (2026-08-12), inconclusive on one point**: confirmed T010 only
      changed the Production branch field, per the user directly (no other Build settings touched).
      Attempted to confirm preview still deploys per-PR by checking for the PR-comment preview URL
      README describes — none appeared on any PR opened today (#319, #320, or earlier), before or
      after T010, so this repo's Workers Builds integration may simply not post PR comments (a
      README description that may not hold for this repo's actual config, or a separate opt-in not
      enabled) rather than a regression from T010 — inconclusive either way from this signal alone.
      Indirect evidence is reassuring: preview version uploads (`wrangler versions list`,
      `has_preview:
      true` entries) continued at their normal cadence across the entire
      session, spanning both before and after T010, with no gap. Recommend the user spot-check once
      by opening any PR and confirming a preview build still appears in the Cloudflare dashboard,
      for full first-hand confidence.
- [x] T012 [US2] Updated `README.md`'s Deployment section: "Production branch" now says `release`
      instead of `main`, plus a new "Releases" section explaining the release-please → maintainer
      merges → fast-forward flow and linking to `specs/010-semver-releases/`. (Also fixed a
      pre-existing unrelated duplicate "Build command for both" line noticed while editing this
      section — not new-feature scope, a one-line drive-by fix.)

**Checkpoint**: Production deploys are now gated by real releases (once T010 is performed by the
user); preview is confirmed unaffected. Fully testable per quickstart.md Scenario 2, independent of
US3.

---

## Phase 5: User Story 3 - An operator can see which version is currently running (Priority: P3)

**Goal**: The Sidebar footer shows the real running version in production builds, and continues to
show exactly today's `"self-hosted"`-only text in local dev / any build with no real release baked
in.

**Independent Test**: Per spec.md — load the running (production) app, confirm the footer shows the
version matching the release that triggered the current deploy; run `deno task dev` locally, confirm
the footer shows `"self-hosted"` only, no fabricated version.

### Implementation for User Story 3

- [x] T013 [US3] **Revised after a second live bug find.** Add a build-time constant to
      `vite.config.ts`: `define: { __APP_VERSION__: JSON.stringify(readAppVersion()) }`, where
      `readAppVersion()` checks Cloudflare's own `WORKERS_CI_BRANCH` env var and only reads/trims the
      repo-root `VERSION` file when it's exactly `release` — otherwise (or on any failure) returns
      `""`. Branch-gated rather than a plain file read, since `VERSION` exists identically on every
      branch and an unconditional read would leak a version into preview/dev builds too (research.md
      §3's first implementation-time correction; FR-010). **First version used `git rev-parse
      --abbrev-ref HEAD` instead — confirmed live in production (2026-08-12) that this was broken**:
      the real production build from `release` (v1.1.3) shipped a footer with no version at all,
      because Workers Builds' checkout doesn't resolve to a branch name via plain git. Fixed by
      reading `WORKERS_CI_BRANCH` (confirmed via Cloudflare's build-configuration docs — the branch
      name from the triggering push event, injected for every Workers Builds run) instead of asking
      git — sidesteps the checkout-state question entirely (research.md §3's second correction).
- [x] T014 [P] [US3] Add the ambient type declaration for the injected constant in
      `app/vite-env.d.ts` (new file): `declare const __APP_VERSION__: string;` — matches plan.md's
      Project Structure entry, needed for `deno check`/strict TS (Constitution Principle VI) to
      accept the reference in T015.
- [x] T015 [US3] In `app/App.tsx`, compute the footer version string from `__APP_VERSION__` and pass
      it as `footer={{ version: ... }}` (the existing `Sidebar` prop — no `Sidebar.tsx` change
      needed, per contracts/workflows.md's corrected contract): when `__APP_VERSION__` is non-empty,
      `` `v${__APP_VERSION__} · self-hosted` ``; when empty, exactly today's literal
      `"self-hosted"`. Replaces the previous hardcoded `footer={{ version: "self-hosted" }}` at
      `app/App.tsx:76`.
- [x] T016 [US3] Confirmed, not extended: `tests/e2e/app-shell.spec.ts`'s existing
      `page.getByText("self-hosted")` assertion already passes unchanged (43/43 e2e suite green in
      PR #308) — because CI's Playwright webserver never builds from a branch literally named
      `release` (`ci.yml`/`e2e.yml` only trigger on `pull_request`/`push: main`), the "version
      present" branch of the footer logic can never actually be exercised in CI regardless of how
      the assertion is written, so a second assertion for that shape would be untestable dead weight
      rather than real coverage. Real verification of the version-present state happens live, per
      quickstart.md Scenario 3 (T021) — the correct place for something only a real `release`-branch
      build can prove.

**Checkpoint**: All three user stories independently functional and testable per quickstart.md. Full
feature complete pending T010's manual dashboard step.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Repo-wide consistency and final validation once all three stories are in.

- [x] T017 [P] `release-please.yml` validated the strongest possible way — real live runs on the
      real repo (T006/T009b/T020), not just syntax checking, across three iterations of T008's
      fast-forward mechanism. No `actionlint` step added separately since live validation already
      happened and is stronger evidence.
- [x] T018 `deno fmt --check` / `deno lint` / `deno check` (app+worker+tests plus `vite.config.ts`
      separately) clean on every PR in this feature, confirmed via CI, not just locally.
- [x] T019 Full `deno task test` (262/262) and `deno task test:e2e` (43/43) run on every PR in this
      feature via CI — no regressions.
- [x] T020 **Fully live-verified (2026-08-12), through three real bug-finds — Scenario 1 complete**:
      the "propose and tag a release" half ran for real four times (v1.1.0 through v1.1.2 and the
      docs-only prefix PR in between), always correctly tagging/publishing a real GitHub Release
      with a real `CHANGELOG.md` entry regardless of which fast-forward bug was live at the time.
      The fast-forward half took three iterations to actually work (T008's v1/v2/v3 history — none
      of the three bugs would have been exposed by a purely-scripted dry run) — **confirmed working
      end-to-end on v1.1.2 (#315)**: watched the triggered `release-please.yml` run directly
      (`gh run watch`), its `Fast-forward release branch` step ran and succeeded in the same job,
      and `release` now points at the v1.1.2 commit with zero manual intervention. Scenario 1 is
      fully done; only Scenarios 2/3 (T021, gated on T010) remain.
- [x] T021 **Live-verified (2026-08-12), conclusively**. T010 performed by the user (Cloudflare
      dashboard → Workers & Pages → `flaretower` → Settings → Build → Production branch →
      `release`). Confirmed flipping that setting alone does _not_ trigger a rebuild — Workers
      Builds only reacts to a real push, so nothing new appeared in
      `wrangler deployments list --name flaretower` until the next actual release. Shipped a real
      one (v1.1.3, PR #319/#320) specifically to complete this check: immediately after
      `release-please.yml`'s fast-forward step pushed the new commit to `release`, a fresh
      deployment appeared at 100% traffic, timestamped seconds after the push. Confirmed it's
      genuinely the **production** environment, not preview, by checking
      `wrangler versions view <id>`'s D1 binding directly — it's bound to database ID
      `9480e87c-...`, which `wrangler.jsonc`'s `env.production.d1_databases` (not
      `env.preview.d1_databases`, a different ID) confirms is exactly `flaretower-production`. This
      is unambiguous, not inferred from timing alone. Did not visually confirm the production
      footer's rendered text directly (Cloudflare Access-protected, no browser session available to
      the agent) — the version-threading mechanism itself was already confirmed correct via the
      local build-bundle check in T013–T015's PR, so this is a reasonable-confidence, not full
      first-hand, confirmation of Scenario 3's footer text; a quick visual glance by the user would
      close that last gap if desired.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: T004 (create `release` branch) should happen right before/at this
  feature's own merge, not earlier — see T004's note. Blocks T008 (US1's fast-forward step) and T010
  (US2's dashboard step).
- **US1 (Phase 3)**: Depends on Setup (Phase 1: T001–T003's config files must exist for
  `release-please-action` to run correctly). T008 additionally depends on T004.
- **US2 (Phase 4)**: Depends on US1 being merged and having cut at least one real release (T010 only
  makes sense once `release` is a real, advancing branch — i.e. after T004 and at least one
  successful T008/T009 run).
- **US3 (Phase 5)**: Depends on Setup (Phase 1: T001's `VERSION` file must exist for T013 to read).
  Does NOT depend on US2 being live — the footer code is correct and testable (T016) the moment
  `VERSION`/the Vite `define` exist, even before Workers Builds is repointed.
- **Polish (Phase 6)**: T017–T019 depend on all of US1–US3's code existing. T020 depends on US1
  being merged to `main`. T021 depends on T020 and T010.

### User Story Dependencies

- **US1 (P1)**: No dependencies on US2/US3 — the MVP; releases work end-to-end (proposal → tag →
  GitHub Release → changelog) with zero deployment or UI change.
- **US2 (P2)**: Functionally depends on US1 existing (there must be releases before production can
  be gated by them) — matches spec.md's own stated ordering ("depends on releases existing first").
- **US3 (P3)**: Only depends on the `VERSION` file (Setup) — can technically be implemented in
  parallel with US1/US2, but has no real version to display until US1 has cut at least one release.

### Parallel Opportunities

- T002/T003 (Setup) can run in parallel — different files.
- T013/T014 (US3) can run in parallel — different files, both prerequisites for T015.
- T017 (Polish) can run in parallel with T018/T019.
- US1 and US3's _code_ (not their live validation) can be implemented in parallel by different
  people, since neither's implementation tasks touch the other's files — only the live end-to-end
  validation (T020/T021) requires sequencing.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003).
2. Complete Phase 2: Foundational (T004).
3. Complete Phase 3: User Story 1 (T005–T009).
4. **STOP and VALIDATE**: quickstart.md Scenario 1, live on `main`.
5. This alone is shippable/mergeable — production still deploys on every push to `main` exactly as
   before until US2 lands, so there is zero risk of a broken/incomplete production-gating
   half-state.

### Incremental Delivery

1. Setup + Foundational → release infrastructure config ready.
2. Add US1 → releases actually get cut → validate live → merge.
3. Add US2 (needs the one manual Cloudflare dashboard step, T010, performed by the user, not
   scriptable) → production gated by release → validate live → merge.
4. Add US3 → version visible in the UI → validate live → merge.
5. Polish (T017–T021) → final full-suite + live verification pass.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- T010 is the one task in this entire feature that a coding agent cannot perform — it must be
  flagged to and performed by the user (Cloudflare dashboard has no Wrangler/API equivalent for this
  setting, per research.md §1).
- Verify the full test suite (not just new assertions) after any change to
  `App.tsx`/`Sidebar`-adjacent code — this project's established discipline after real regressions
  were caught this way during prior features.
- No task touches `worker/` — confirmed by plan.md's Project Structure and Constitution Check (this
  feature is CI/build-tooling plus one frontend read).
