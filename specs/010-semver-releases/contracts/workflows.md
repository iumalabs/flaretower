# Contracts: Semantic Versioning & Version-Gated Production Releases

This feature adds no HTTP API endpoints. Its "interfaces" are three GitHub
Actions workflows' behavior contracts, plus one frontend component
contract.

## `.github/workflows/release-please.yml`

**Trigger**: `push` to `main` (every merge, same trigger `ci.yml`/`e2e.yml`
already use).

**Behavior contract**:
- If there are Conventional-Commit-classified changes since the last
  release, creates or updates a single standing "release PR" (branch
  name/format owned by `release-please-action` itself) containing: the
  bumped `VERSION` file, an updated `CHANGELOG.md` entry, and a PR body
  summarizing the included changes.
- If there is nothing new since the last release, does nothing (no PR
  created/updated) — spec.md FR-002.
- Never merges its own PR.
- Never touches the `release` branch directly — only `main`.

## `.github/workflows/release-automerge.yml`

**Trigger**: `schedule` (daily cron) + `workflow_dispatch` (manual,
on-demand — spec.md FR-004's "trigger a release outside the normal
cadence" path, alongside a maintainer just merging the standing PR by
hand at any time).

**Behavior contract**:
- If `release-please.yml`'s standing release PR exists and is open,
  merges it. Merging it is what makes `release-please-action` actually
  cut the tag + GitHub Release (its own documented merge-triggered
  behavior) — this job does not create the tag/release itself.
- If no such PR is open, does nothing (spec.md edge case: no new
  changes means no release, whether triggered on schedule or manually).
- Does **not** touch the `release` branch itself — that's
  `release-publish.yml`'s job (below), by design (see that contract's
  "Implementation-time correction").
- A failure merging the PR (e.g. blocked by branch protection) MUST fail
  the workflow run visibly (spec.md FR-012) — no silent swallowing.

## `.github/workflows/release-publish.yml`

**Trigger**: `release: types: [published]` — fires the moment
release-please-action tags and publishes a GitHub Release, regardless of
*what* caused that: `release-automerge.yml` merging the standing PR, or a
maintainer merging it by hand directly in the GitHub UI.

**Implementation-time correction (superseding the original plan)**: the
first version of this feature fast-forwarded `release` as a step *inside*
`release-automerge.yml`, run only immediately after that same job's own
merge. Confirmed live (2026-08-12) that this missed a real case: a
maintainer merged the standing release PR by hand (exactly spec.md
FR-004's supported path) and the fast-forward never ran, since that PR
merge didn't go through `release-automerge.yml` at all — the tag/GitHub
Release/`CHANGELOG.md`/`VERSION` update all happened correctly (those are
release-please's own reaction to the PR merging, any way it merges), but
`release` silently stayed on the previous commit. Moving the
fast-forward to its own workflow keyed on the `release: published` event
— which fires identically no matter which of the two merge paths
produced it — closes this gap structurally instead of requiring every
future merge path to remember to also fast-forward `release` itself.

**Behavior contract**:
- Checks out the exact tag the published release points to (not
  whatever `main`'s HEAD happens to be at event-delivery time) and
  fast-forwards `release` to that commit — the one thing that actually
  triggers Cloudflare Workers Builds' production deploy, once its
  production-branch setting is re-pointed at `release` (research.md
  §1). A plain (non-force) push, so it only ever succeeds as a genuine
  fast-forward; already-up-to-date is a no-op, not an error (idempotent).
- Guards on the tag name starting with `v` (release-please's own
  convention) so a differently-named release created by hand doesn't
  unexpectedly move `release`.
- A failure (e.g. `release` has diverged and the push is rejected) MUST
  fail the workflow run visibly (spec.md FR-012) — no silent swallowing.

## `App.tsx`'s `footer={{ version }}` string (no `Sidebar.tsx` change needed)

Confirmed by reading the actual current code (`app/components/Sidebar.tsx`,
`app/App.tsx`): `Sidebar`'s `footer` prop already has an optional
`version?: string` field, rendered verbatim as its own line when
non-empty — `App.tsx` already populates it today with the literal string
`"self-hosted"`. No new field, prop, or `Sidebar.tsx` change is required.

**Contract**: `App.tsx` becomes the one place that reads the injected
`__APP_VERSION__` build-time constant and computes the string passed as
`footer.version`:
- When `__APP_VERSION__` is a real non-empty version string (a
  production build produced from the `release` branch after a real
  cut): `footer.version = "v${__APP_VERSION__} · self-hosted"` (matches
  the design source's own footer treatment, e.g. `"v1.0.3 ·
  self-hosted"`).
- When `__APP_VERSION__` is `undefined`/empty (local dev, or any build
  not produced from a real release — spec.md FR-010, data-model.md):
  `footer.version = "self-hosted"`, i.e. exactly today's existing
  behavior, unchanged.

`Sidebar.tsx` itself stays untouched — it already has no knowledge of
where `footer.version`'s string comes from, consistent with every other
prop it receives.
