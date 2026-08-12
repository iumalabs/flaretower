# Contracts: Semantic Versioning & Version-Gated Production Releases

This feature adds no HTTP API endpoints. Its "interfaces" are two GitHub Actions workflows' behavior
contracts, plus one frontend component contract.

## `.github/workflows/release-please.yml`

**Trigger**: `push` to `main` (every merge, same trigger `ci.yml`/`e2e.yml` already use).

**Behavior contract**:

- If there are Conventional-Commit-classified changes since the last release, creates or updates a
  single standing "release PR" (branch name/format owned by `release-please-action` itself)
  containing: the bumped `VERSION` file, an updated `CHANGELOG.md` entry, and a PR body summarizing
  the included changes.
- If there is nothing new since the last release, does nothing (no PR created/updated) — spec.md
  FR-002.
- Never merges its own PR — a maintainer merges it whenever they choose to ship (spec.md FR-004,
  revised 2026-08-12 — see below).
- Never touches the `release` branch directly — only `main`.

**Implementation-time correction (superseding the original plan)**: this feature originally paired
`release-please.yml` with a third workflow, `release-automerge.yml`, that merged the standing PR on
a daily cron so releases would ship with zero maintainer action, matching the original request's
literal "roughly daily, unattended" framing. **Removed (2026-08-12)** after live use confirmed a
real, silent gap: a merge performed with GitHub Actions' own default `GITHUB_TOKEN` doesn't trigger
downstream workflows (anti-recursion protection built into the platform, not something workflow
permissions can override) — so that job's `gh pr merge` correctly merged the PR, but never triggered
a second `release-please.yml` run to notice the merge and cut the tag/ GitHub Release, and
`release-publish.yml` (below) never fired either. The maintainer confirmed this project's sibling
repos already work this way — release-please proposing, a human merging whenever ready, no
auto-merge job or extra credential at all — and preferred that over provisioning a PAT/GitHub App
purely to work around the platform restriction. See spec.md's User Story 1 Scope note and revised
FR-003/FR-004/SC-003.

## `.github/workflows/release-publish.yml`

**Trigger**: `release: types: [published]` — fires the moment release-please-action tags and
publishes a GitHub Release, which now only ever happens via a maintainer merging the standing PR
themselves (the `release-automerge.yml` path described above having been removed).

**Behavior contract**:

- Checks out the exact tag the published release points to (not whatever `main`'s HEAD happens to be
  at event-delivery time) and fast-forwards `release` to that commit — the one thing that actually
  triggers Cloudflare Workers Builds' production deploy, once its production-branch setting is
  re-pointed at `release` (research.md §1). A plain (non-force) push, so it only ever succeeds as a
  genuine fast-forward; already-up-to-date is a no-op, not an error (idempotent).
- Guards on the tag name starting with `v` (release-please's own convention) so a differently-named
  release created by hand doesn't unexpectedly move `release`.
- A failure (e.g. `release` has diverged and the push is rejected) MUST fail the workflow run
  visibly (spec.md FR-012) — no silent swallowing.

## `App.tsx`'s `footer={{ version }}` string (no `Sidebar.tsx` change needed)

Confirmed by reading the actual current code (`app/components/Sidebar.tsx`, `app/App.tsx`):
`Sidebar`'s `footer` prop already has an optional `version?: string` field, rendered verbatim as its
own line when non-empty — `App.tsx` already populates it today with the literal string
`"self-hosted"`. No new field, prop, or `Sidebar.tsx` change is required.

**Contract**: `App.tsx` becomes the one place that reads the injected `__APP_VERSION__` build-time
constant and computes the string passed as `footer.version`:

- When `__APP_VERSION__` is a real non-empty version string (a production build produced from the
  `release` branch after a real cut): `footer.version = "v${__APP_VERSION__} · self-hosted"`
  (matches the design source's own footer treatment, e.g. `"v1.0.3 ·
  self-hosted"`).
- When `__APP_VERSION__` is `undefined`/empty (local dev, or any build not produced from a real
  release — spec.md FR-010, data-model.md): `footer.version = "self-hosted"`, i.e. exactly today's
  existing behavior, unchanged.

`Sidebar.tsx` itself stays untouched — it already has no knowledge of where `footer.version`'s
string comes from, consistent with every other prop it receives.
