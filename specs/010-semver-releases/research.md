# Phase 0 Research: Semantic Versioning & Version-Gated Production Releases

## 1. Deploy trigger: release branch (fast-forwarded on cut) vs. Workers Builds Deploy Hooks

**Decision**: Point Cloudflare Workers Builds' production-branch configuration (Settings → Build →
Branch control, a one-time manual dashboard change) at a new dedicated branch — `release` — instead
of `main`. The release workflow (research.md §2) fast-forwards `release` to point at the exact
commit a new version was cut from, every time (and only when) a release actually ships. Workers
Builds' existing, already-trusted "push to the configured branch triggers a build+deploy" mechanism
does the rest, completely unchanged from how it already works today for `main` — the only thing that
changes is _which_ branch Workers Builds watches.

**Rationale**: Confirmed via Cloudflare's own docs (`build-branches`, `deploy-hooks`) that:

- Workers Builds has no native tag/release-based trigger — only branch-push triggers exist.
- Deploy Hooks (added 2026-04-01, per Cloudflare's own changelog) are a real, newer alternative — a
  unique per-branch URL that triggers a build on `POST` — but neither the Deploy Hooks doc nor the
  Branch Build Controls doc confirms whether a branch's automatic push-trigger can be disabled
  _while_ a Deploy Hook for that same branch stays usable, or whether Deploy Hooks are meant to
  layer on top of / replace the automatic trigger. That interaction isn't documented, and getting it
  wrong risks a period where production deploys on both push-to-`main` _and_ the hook, defeating the
  whole point of this feature.
- The release-branch approach carries none of that risk: it reuses the exact mechanism this project
  has already deployed via and verified live, repeatedly, throughout its whole history (branch-push
  → Workers Builds build+deploy) — the only Cloudflare-dashboard change needed is re-pointing which
  branch counts as "production," a single well-understood setting, not adopting an undocumented
  interaction between two features.

**Alternatives considered**:

- **Deploy Hooks, with `main`'s automatic build disabled**: rejected for now per the
  undocumented-interaction risk above — worth revisiting later if Cloudflare's docs mature, but not
  the right default for a feature whose whole point is deploy reliability/predictability.
- **Deploy Hooks, `main` still auto-building**: rejected outright — would deploy on every push to
  `main` _and_ on every release, which is exactly the behavior this feature exists to stop.

**Rollback implication** (spec.md FR-011): rolling back production to a previous release is
"fast-forward (or force-update) `release` to point at an older tag's commit" — the same release
workflow's own git operations, just pointed backward. No separate rollback mechanism needs to be
built.

## 2. Release automation: `release-please-action`, maintainer merges when ready

**Decision**: Use `googleapis/release-please-action@v4` with `release-type: simple`
(release-please's own generic-project mode, confirmed to require no `package.json` — it works from
Conventional Commit history alone) on every push to `main`, configured with its "generic updater"
pointed at a single plain-text `VERSION` file at the repo root (not `package.json` or any file
resembling a package manifest). A maintainer merges the standing release PR whenever they're ready
to ship — that merge is what cuts the tag/GitHub Release. In the _same job run_ that notices the
merge (checked via the action's own `steps.release.outputs.release_created` output), a follow-up
step advances the `release` branch to `steps.release.outputs.sha`, which is what triggers the
production deploy via §1's mechanism.

**Implementation-time corrections (superseding the original plan, both found live 2026-08-12)**:

1. This feature originally also included a second, scheduled workflow (`release-automerge.yml`) that
   merged the standing PR on a daily cron, to satisfy the original request's "roughly daily, no
   manual step" framing literally. Confirmed live that this doesn't work as designed: GitHub
   Actions' own default `GITHUB_TOKEN` is deliberately prevented from triggering downstream
   workflows when it pushes/merges (anti-recursion protection) — so a `gh pr merge` performed by
   that scheduled job merged the PR (VERSION/CHANGELOG.md land on `main` correctly, since those are
   just part of the merged diff), but never triggered a second `release-please.yml` run to notice
   the merge and actually cut the tag/GitHub Release — a real, live-confirmed silent gap (v1.1.1
   stuck as merged-but-unreleased before this was caught). The standard fix is a
   separately-provisioned PAT or GitHub App token; asked the maintainer, who confirmed the project's
   sibling repos (`odograph`, `typstreak`) use release-please without any such daily auto-merge at
   all — they just merge the standing PR themselves whenever ready, which works perfectly with the
   default `GITHUB_TOKEN` since a human's own merge push isn't subject to the same restriction.
   Given that's already the maintainer's established, working practice elsewhere,
   `release-automerge.yml` was removed rather than fixed with new credentials — see spec.md's User
   Story 1 Scope note and revised FR-003/FR-004/SC-003.
2. A third workflow, `release-publish.yml`, triggered on GitHub's own `release: published` event,
   was then added to advance the `release` branch once a release was cut. **Also removed** after
   confirming — via `googleapis/release-please-action`'s own README, plus 0 real runs ever recorded
   for that workflow despite a real release (v1.1.1) actually publishing — that
   release-please-action's own tag/release creation is _itself_ GITHUB_TOKEN-authenticated, so it
   doesn't fire `release:
   published` for other workflows either. This is the exact same
   restriction as correction #1, one step further down the chain, and it applies regardless of who
   merged the PR (bot or human) — the release-_creation_ itself, not the PR-merge, is what's
   GITHUB_TOKEN-authored. The action's own README documents the correct, no-extra-credential fix
   directly: read the step's own outputs (`release_created`, `sha`) and act in a follow-up step of
   the _same job_ — same-job steps aren't "triggering a workflow" and are therefore entirely
   unaffected by the restriction. Folded that logic directly into `release-please.yml` instead of a
   separately-triggered workflow.

**Rationale**:

- `release-please-action` already implements exactly FR-001/FR-002/FR-003 (keeping the standing
  proposal current)/FR-005 (changelog generation)/ FR-004 (a maintainer merges the standing PR
  whenever they choose — the _only_ release-shipping path now, not an alternate "manual override" —
  satisfied with zero extra tooling) — reimplementing this from scratch would be a meaningfully
  larger, higher-risk surface for no real benefit.
- Confirmed it runs entirely as a GitHub Action (Constitution Check §IV) — no local install, no
  `package.json` added to this repo.
- release-please's own default model is "propose via PR, cut on merge" — it does not auto-merge its
  own PRs. This is a deliberate safety property (a human always has one clean point to hold back a
  release if something looks wrong) that this feature now leans into directly, rather than working
  around it with an unattended auto-merge job.
- **Version-bump classification**: release-please's own Conventional- Commit parsing is exactly the
  mechanism spec.md's own Assumptions section already commits to (`fix:` → patch, `feat:` → minor);
  it does not auto-bump MAJOR from `BREAKING CHANGE:`/`!` without that being explicit in a commit
  message, matching the spec's assumption that MAJOR bumps require deliberate maintainer action.

**Alternatives considered**:

- **A PAT/GitHub App-authenticated daily auto-merge job**: considered (and briefly built, then
  removed — see the correction above) to satisfy the literal "roughly daily, unattended" framing of
  the original request; rejected once the maintainer confirmed they don't want the added
  credential/complexity given their established practice on sibling projects already works without
  it.
- **Hand-rolled script parsing `git log` + `gh release create`**: rejected — reimplements a
  well-tested tool's job, for a marginal reduction in "one more GitHub Action dependency," which
  Constitution Principle IV already permits for exactly this category of tool.
- **`semantic-release` (the npm-ecosystem-standard tool)**: rejected — its plugin ecosystem and
  typical setup assume an npm project far more deeply than release-please's `simple` mode does
  (multiple `.npmrc`/ `package.json`-adjacent conventions baked into its default plugins); achieving
  an equivalently package.json-free setup would need more custom plugin configuration than
  release-please's generic updater.
- **Fully automatic merge on every release-please PR update (no daily job, no manual gate at all)**:
  considered and rejected — would mean a release (and therefore a production deploy) on literally
  every single push to `main`, which is the exact behavior this feature exists to move away from;
  the whole value of gating by release is that several merges can accumulate into one coherent,
  reviewable version.

## 3. Threading the version into the running app

**Decision**: `vite.config.ts` reads the repo-root `VERSION` file at build time and injects its
contents via Vite's `define` option as a build-time string constant; `App.tsx` reads that constant
directly (no runtime fetch, no new `/api/*` endpoint) and passes it into `Sidebar`'s existing
`footer.version` field — e.g. `"v1.0.3 · self-hosted"` — only when the constant is actually a real
version string; falls back to today's `"self-hosted"`-only text (spec.md FR-010) otherwise.

**Implementation-time correction (superseding the original plan)**: `VERSION` is a real, committed
file that exists identically on every branch — `main`, feature branches, and PR preview branches all
carry whatever the last release wrote to it. Reading it unconditionally would therefore inject a
version into **every** build, including preview deploys and local dev, not just production —
directly violating spec.md FR-010/US3's Acceptance Scenario 2 ("running locally or viewing a preview
deployment ... they do not see a fabricated or misleading production version number"), since a
preview build can be arbitrarily far ahead of the last cut release. The fix: `readAppVersion()` in
`vite.config.ts` first checks the currently checked-out git branch
(`git rev-parse --abbrev-ref HEAD`) and only reads `VERSION` when it's exactly `release` — the one
branch that only ever advances via `release-publish.yml`'s fast-forward after a real cut
(research.md §1). Every other build (any branch name, or a failure to resolve one at all, e.g. a
shallow/detached checkout) falls back to `""`. This needs no new Cloudflare-side configuration —
Workers Builds already checks out the exact branch it's configured to build for each deploy.

**Rationale**: This is the simplest mechanism that satisfies FR-008/ FR-009 — no new backend
endpoint, no runtime network call, and the version is baked into the exact build artifact that gets
deployed, which is the most direct possible guarantee that what the UI displays matches what's
actually running (SC-005) — there's no "the build succeeded but forgot to update its own version"
failure mode possible, since the value is literally read from the file at the moment the deployed
artifact is produced.

**Alternatives considered**:

- **A `/api/version` endpoint reading an env var**: rejected — adds a new endpoint, a new Worker
  `vars` entry to keep in sync across both environments, and a runtime fetch for something that's
  already fully known at build time and never changes for the lifetime of a given deployed artifact.
