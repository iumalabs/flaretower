# Contracts: Semantic Versioning & Version-Gated Production Releases

This feature adds no HTTP API endpoints. Its "interface" is one GitHub Actions workflow's behavior
contract, plus one frontend component contract.

## `.github/workflows/release-please.yml`

**Trigger**: `push` to `main` (every merge, same trigger `ci.yml`/`e2e.yml` already use).

**Behavior contract**:

- If there are Conventional-Commit-classified changes since the last release, creates or updates a
  single standing "release PR" (branch name/format owned by `release-please-action` itself)
  containing: the bumped `VERSION` file, an updated `CHANGELOG.md` entry, and a PR body summarizing
  the included changes.
- If there is nothing new since the last release, does nothing (no PR created/updated) — spec.md
  FR-002.
- Never merges its own PR — a maintainer merges it whenever they choose to ship (spec.md FR-004).
- If — and only if — this run is the one where release-please-action notices the standing PR was
  just merged (`steps.release.outputs.release_created` is truthy), it also fast-forwards the
  `release` branch to `steps.release.outputs.sha` (the exact commit just tagged) in a follow-up step
  of the **same job** — the one thing that actually triggers Cloudflare Workers Builds' production
  deploy, once its production-branch setting is re-pointed at `release` (research.md §1). A plain
  (non-force) push, so it only ever succeeds as a genuine fast-forward; already-up-to-date is a
  no-op, not an error (idempotent). A failure (e.g. `release` has diverged) MUST fail the job
  visibly (spec.md FR-012) — no silent swallowing.

**Implementation-time corrections (superseding the original plan, both found live 2026-08-12)**:

1. This feature originally paired `release-please.yml` with a second workflow,
   `release-automerge.yml`, that merged the standing PR on a daily cron so releases would ship with
   zero maintainer action, matching the original request's literal "roughly daily, unattended"
   framing. **Removed** after live use confirmed a real, silent gap: a merge performed with GitHub
   Actions' own default `GITHUB_TOKEN` doesn't trigger downstream workflows (anti-recursion
   protection built into the platform, not something workflow permissions can override) — so that
   job's `gh pr merge` correctly merged the PR, but never triggered a second `release-please.yml`
   run to notice the merge and cut the tag/GitHub Release. The maintainer confirmed this project's
   sibling repos already work without any such job — release-please proposing, a human merging
   whenever ready — and preferred that over provisioning a PAT/GitHub App purely to work around the
   platform restriction. See spec.md's User Story 1 Scope note and revised FR-003/FR-004/SC-003.
2. A third workflow, `release-publish.yml`, was then added on `on: release: types: [published]` to
   fast-forward `release` once a release was cut. **Also removed** after confirming (via
   `googleapis/release-please-action`'s own README, and 0 real runs ever recorded for that workflow
   despite a real release publishing) that release-please-action's own tag/release creation is
   _itself_ GITHUB_TOKEN-authenticated — the exact same anti-recursion restriction as correction #1,
   just one step further down the chain, and no merge-path choice (bot vs. human) can avoid it. The
   action's own documented, no-extra-credential fix is exactly what this workflow now does: check
   its own step outputs (`release_created`/`sha`) and act in the _same job_, since same-job steps
   aren't "triggering another workflow" and are therefore unaffected by the restriction.

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
