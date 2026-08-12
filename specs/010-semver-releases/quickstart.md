# Quickstart: Semantic Versioning & Version-Gated Production Releases

Manual validation guide once implemented. Some steps genuinely require a real merge to `main` and a
real Cloudflare dashboard change — this feature can't be fully validated against mocks the way a
pure-frontend feature can, since its whole point is real release/deploy behavior.

## Prerequisites

- `release-please.yml` merged to `main`, with its same-job fast-forward step. (Two earlier
  approaches — a daily `release-automerge.yml`, then a separate `release-publish.yml` triggered on
  `release: published` — were each built, live-tested, and removed 2026-08-12; see research.md §2.
  Release shipping is always a maintainer merging the standing PR themselves, at whatever cadence
  they choose.)
- The one-time Cloudflare dashboard change made: Workers Builds' production branch re-pointed from
  `main` to `release` (Settings → Build → Branch control).
- `release` branch exists and currently points at the same commit `main` was at when this feature's
  own PR merged (so production doesn't silently roll back the moment the branch switch happens).

## Scenario 1 — A release is proposed automatically, shipped by a merge (User Story 1)

1. Merge any ordinary change (a `fix:`- or `feat:`-prefixed commit) to `main`. **Expect**: within a
   few minutes, a new "release PR" appears (or an existing one updates), showing the correct version
   bump (patch for `fix:`, minor for `feat:`) and a changelog entry describing the change.
2. Merge to `main` again with no meaningful new commit (e.g. a docs-only change release-please
   doesn't classify as release-worthy, if applicable) — or simply check the state when nothing has
   merged since the last release. **Expect**: no new/duplicate release PR.
3. Merge the standing release PR yourself, whenever you're ready to ship. **Expect**: a new git tag
   and GitHub Release appear, `VERSION`/`CHANGELOG.md` are updated on `main` — every time, the same
   way, whether shipped immediately or after several changes accumulated.

## Scenario 2 — Production only updates on release (User Story 2)

1. Merge a change to `main` without merging the release PR yet. **Expect**: `flaretower.iuma.dev`
   does not change (confirm via the footer version, once Scenario 3 is also validated, or via
   Workers Builds' own deploy history showing no new production build).
2. Merge the standing release PR. **Expect**: the same `release-please.yml` run that notices the
   merge and cuts the tag/GitHub Release also fast-forwards the `release` branch to that commit (a
   follow-up step in the same job, not a separate triggered workflow); Workers Builds' deploy
   history shows a new production build/deploy triggered by that push.
3. Push to `main` again (any ordinary PR merge) without cutting another release. **Expect**: preview
   environment deploys as it always has (per-branch/PR preview URL) — unaffected; production does
   not change.

## Scenario 3 — The running version is visible (User Story 3)

1. After Scenario 2's deploy completes, load `flaretower.iuma.dev` and look at the sidebar footer.
   **Expect**: it shows the version that was just released (e.g. `"v1.0.1 · self-hosted"`), matching
   the tag/ GitHub Release from Scenario 1.
2. Run `deno task dev` locally. **Expect**: the footer shows `"self-hosted"` only — no fabricated
   version number (FR-010).

## Automated coverage checklist (for the implementer, not manual QA)

- [ ] `deno fmt --check` / `deno lint` / `deno check` clean.
- [ ] New/extended e2e coverage in `tests/e2e/app-shell.spec.ts` for the Sidebar footer's
      version-present and version-absent states (both mockable — inject `__APP_VERSION__` via Vite's
      `define` differently per test build, or structure the component to accept the value as a prop
      from `App.tsx` so the e2e test can control it without a real release).
- [ ] `release-please.yml` YAML validated (e.g. `actionlint` or GitHub's own workflow syntax check
      on push) before merging this feature.
