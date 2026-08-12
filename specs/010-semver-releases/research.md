# Phase 0 Research: Semantic Versioning & Version-Gated Production Releases

## 1. Deploy trigger: release branch (fast-forwarded on cut) vs. Workers Builds Deploy Hooks

**Decision**: Point Cloudflare Workers Builds' production-branch configuration
(Settings → Build → Branch control, a one-time manual dashboard change) at a
new dedicated branch — `release` — instead of `main`. The release workflow
(research.md §2) fast-forwards `release` to point at the exact commit a new
version was cut from, every time (and only when) a release actually ships.
Workers Builds' existing, already-trusted "push to the configured branch
triggers a build+deploy" mechanism does the rest, completely unchanged from
how it already works today for `main` — the only thing that changes is
*which* branch Workers Builds watches.

**Rationale**: Confirmed via Cloudflare's own docs (`build-branches`,
`deploy-hooks`) that:
- Workers Builds has no native tag/release-based trigger — only branch-push
  triggers exist.
- Deploy Hooks (added 2026-04-01, per Cloudflare's own changelog) are a
  real, newer alternative — a unique per-branch URL that triggers a build
  on `POST` — but neither the Deploy Hooks doc nor the Branch Build
  Controls doc confirms whether a branch's automatic push-trigger can be
  disabled *while* a Deploy Hook for that same branch stays usable, or
  whether Deploy Hooks are meant to layer on top of / replace the
  automatic trigger. That interaction isn't documented, and getting it
  wrong risks a period where production deploys on both push-to-`main`
  *and* the hook, defeating the whole point of this feature.
- The release-branch approach carries none of that risk: it reuses the
  exact mechanism this project has already deployed via and verified
  live, repeatedly, throughout its whole history (branch-push →
  Workers Builds build+deploy) — the only Cloudflare-dashboard change
  needed is re-pointing which branch counts as "production," a single
  well-understood setting, not adopting an undocumented interaction
  between two features.

**Alternatives considered**:
- **Deploy Hooks, with `main`'s automatic build disabled**: rejected for
  now per the undocumented-interaction risk above — worth revisiting
  later if Cloudflare's docs mature, but not the right default for a
  feature whose whole point is deploy reliability/predictability.
- **Deploy Hooks, `main` still auto-building**: rejected outright — would
  deploy on every push to `main` *and* on every release, which is exactly
  the behavior this feature exists to stop.

**Rollback implication** (spec.md FR-011): rolling back production to a
previous release is "fast-forward (or force-update) `release` to point at
an older tag's commit" — the same release workflow's own git operations,
just pointed backward. No separate rollback mechanism needs to be built.

## 2. Release automation: `release-please-action`, plus a small daily auto-merge job

**Decision**: Use `googleapis/release-please-action@v4` with
`release-type: simple` (release-please's own generic-project mode,
confirmed to require no `package.json` — it works from Conventional
Commit history alone) on every push to `main`, configured with its
"generic updater" pointed at a single plain-text `VERSION` file at the
repo root (not `package.json` or any file resembling a package manifest).
Pair it with a second, small scheduled workflow
(`release-automerge.yml`, cron roughly-daily) that checks whether
release-please's standing release PR is open and, if so, merges it —
which is what actually cuts the tag/GitHub Release and (via §1's
mechanism) triggers the production deploy.

**Rationale**:
- `release-please-action` already implements exactly FR-001/FR-002/FR-003
  (excluding the "roughly daily" cadence itself, addressed by the
  auto-merge job)/FR-005 (changelog generation)/FR-004 (a maintainer can
  merge the standing release PR immediately instead of waiting for the
  daily job, satisfying "trigger a release outside the normal cadence"
  without any extra tooling) — reimplementing this from scratch would be
  a meaningfully larger, higher-risk surface for no real benefit.
- Confirmed it runs entirely as a GitHub Action (Constitution Check §IV)
  — no local install, no `package.json` added to this repo.
- release-please's own default model is "propose via PR, cut on merge" —
  it does not auto-merge its own PRs. This is a deliberate safety
  property (a human — or, here, the scheduled job — has one clean point
  to hold back a release if something looks wrong), and the small
  auto-merge job is what turns that into the "roughly daily, no manual
  step required" cadence spec.md's FR-003/SC-003 actually asks for,
  while FR-004's manual-override path (a maintainer merges the PR early)
  keeps working exactly as release-please already supports it, with zero
  extra code.
- **Version-bump classification**: release-please's own Conventional-
  Commit parsing is exactly the mechanism spec.md's own Assumptions
  section already commits to (`fix:` → patch, `feat:` → minor); it does
  not auto-bump MAJOR from `BREAKING CHANGE:`/`!` without that being
  explicit in a commit message, matching the spec's assumption that MAJOR
  bumps require deliberate maintainer action.

**Alternatives considered**:
- **Hand-rolled script parsing `git log` + `gh release create`**: rejected
  — reimplements a well-tested tool's job, for a marginal reduction in
  "one more GitHub Action dependency," which Constitution Principle IV
  already permits for exactly this category of tool.
- **`semantic-release` (the npm-ecosystem-standard tool)**: rejected — its
  plugin ecosystem and typical setup assume an npm project far more
  deeply than release-please's `simple` mode does (multiple `.npmrc`/
  `package.json`-adjacent conventions baked into its default plugins);
  achieving an equivalently package.json-free setup would need more
  custom plugin configuration than release-please's generic updater.
- **Fully automatic merge on every release-please PR update (no daily
  job, no manual gate at all)**: considered and rejected — would mean a
  release (and therefore a production deploy) on literally every single
  push to `main`, which is the exact behavior this feature exists to
  move away from; the whole value of gating by release is that several
  merges can accumulate into one coherent, reviewable version.

## 3. Threading the version into the running app

**Decision**: `vite.config.ts` reads the repo-root `VERSION` file at
build time and injects its contents via Vite's `define` option as a
build-time string constant; `App.tsx` reads that constant directly (no
runtime fetch, no new `/api/*` endpoint) and passes it into `Sidebar`'s
existing `footer.version` field — e.g. `"v1.0.3 · self-hosted"` — only
when the constant is actually a real version string; falls back to
today's `"self-hosted"`-only text (spec.md FR-010) otherwise.

**Implementation-time correction (superseding the original plan)**:
`VERSION` is a real, committed file that exists identically on every
branch — `main`, feature branches, and PR preview branches all carry
whatever the last release wrote to it. Reading it unconditionally would
therefore inject a version into **every** build, including preview
deploys and local dev, not just production — directly violating spec.md
FR-010/US3's Acceptance Scenario 2 ("running locally or viewing a
preview deployment ... they do not see a fabricated or misleading
production version number"), since a preview build can be arbitrarily
far ahead of the last cut release. The fix: `readAppVersion()` in
`vite.config.ts` first checks the currently checked-out git branch
(`git rev-parse --abbrev-ref HEAD`) and only reads `VERSION` when it's
exactly `release` — the one branch that only ever advances via
`release-automerge.yml`'s fast-forward after a real cut (research.md
§1). Every other build (any branch name, or a failure to resolve one at
all, e.g. a shallow/detached checkout) falls back to `""`. This needs no
new Cloudflare-side configuration — Workers Builds already checks out
the exact branch it's configured to build for each deploy.

**Rationale**: This is the simplest mechanism that satisfies FR-008/
FR-009 — no new backend endpoint, no runtime network call, and the
version is baked into the exact build artifact that gets deployed,
which is the most direct possible guarantee that what the UI displays
matches what's actually running (SC-005) — there's no "the build
succeeded but forgot to update its own version" failure mode possible,
since the value is literally read from the file at the moment the
deployed artifact is produced.

**Alternatives considered**:
- **A `/api/version` endpoint reading an env var**: rejected — adds a
  new endpoint, a new Worker `vars` entry to keep in sync across both
  environments, and a runtime fetch for something that's already fully
  known at build time and never changes for the lifetime of a given
  deployed artifact.
