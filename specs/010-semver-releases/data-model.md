# Phase 1 Data Model: Semantic Versioning & Version-Gated Production Releases

No D1 tables, columns, or migrations — this feature has no application data model (plan.md's
Constitution Check, Principle III/IX rows). The "entities" spec.md's Key Entities section names are
release-tooling artifacts (files, git refs, a GitHub Release), not database rows.

## Release

Represented by three coordinated artifacts, all produced by `release-please-action` (research.md §2)
— not a single record anywhere:

- **A git tag** (`vMAJOR.MINOR.PATCH`) on the exact commit the release was cut from.
- **A GitHub Release** (the reviewable, retrievable record spec.md FR-005 requires — visible in the
  repo's Releases tab indefinitely, not just "at release time").
- **An entry in `CHANGELOG.md`** (release-please's own generated changelog file, committed to the
  repo — a second, in-repo copy of the same record for anyone browsing the source rather than
  GitHub's UI).

"Currently in production" (spec.md's "exactly one release is currently in production at any given
time") is represented by wherever the `release` branch (research.md §1) currently points — always
exactly one commit, always the commit of exactly one tagged release.

## Running Version

A single build-time string constant, sourced from the repo-root `VERSION` file (release-please's
generic-updater target) at the moment `deno task build` runs, injected via Vite's `define`:

```ts
// vite.config.ts
declare const __APP_VERSION__: string | undefined;
```

`App.tsx` reads `__APP_VERSION__` directly — `""` in any build not built from the `release` branch
(local dev, feature branches, PR previews, per FR-010 — see research.md §3's implementation-time
correction: `VERSION` exists identically on every branch, so the empty fallback is keyed off the
checked-out git branch, not off whether the file itself exists), a real `"1.0.3"`-shaped string in a
build produced from the `release` branch after a real cut.

## `VERSION` file

Plain text, single line, no leading `v`, no trailing newline convention enforced beyond what
release-please itself writes (e.g. `1.0.3`) — deliberately not JSON/YAML and deliberately not named
anything that could be mistaken for a package manifest (Constitution Principle IV).
