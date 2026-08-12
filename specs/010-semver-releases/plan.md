# Implementation Plan: Semantic Versioning & Version-Gated Production Releases

**Branch**: `010-semver-releases` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-semver-releases/spec.md`

## Summary

Move production deploys from "every push to `main`" to "every published release," using
`release-please-action` (Conventional-Commits-driven, `release-type: simple`, no `package.json`
required) to automatically keep a standing, correctly-versioned release PR up to date with generated
changelogs, ready for a maintainer to merge whenever they choose to ship (FR-003/FR-004 — revised
2026-08-12 to drop an originally-planned unattended daily auto-merge job, after live use showed it
needed a separately-provisioned credential to work around a GitHub Actions platform restriction; see
research.md §2), and a re-pointed Cloudflare Workers Builds production-branch target (a dedicated
`release` branch a second workflow fast-forwards whenever a release is published, reusing the exact
branch-push-triggers-build mechanism this project already trusts, rather than depending on the newer
and less-documented Deploy Hooks feature). The running version is threaded from a small generated
`VERSION` file through a Vite build-time `define` into `Sidebar.tsx`'s already-reserved footer slot.

## Technical Context

**Language/Version**: TypeScript (strict), Deno 2 runtime — unchanged. The new pieces (GitHub
Actions workflow YAML, `release-please-action`) run entirely inside GitHub's CI runners, never on a
contributor's machine and never as part of `deno.json`'s own dependency graph.

**Primary Dependencies**: `googleapis/release-please-action@v4` (a GitHub Action, not an npm
dependency of this repo — see Constitution Check below for why this doesn't conflict with Principle
IV). No new runtime dependency for the app itself beyond a Vite `define`.

**Storage**: N/A — no D1/schema changes. The generated `VERSION` file and
`.release-please-manifest.json`/config live in the repo as plain text/JSON, not application data.

**Testing**: `deno test` for the pure "read VERSION, inject into build" logic if it's non-trivial
enough to warrant one; the release workflow itself is validated by dry-running it (release-please
supports a dry-run mode) and by observing the first real release it cuts, since GitHub Actions
workflow logic isn't unit-testable in the traditional sense.

**Target Platform**: GitHub Actions (release automation), Cloudflare Workers Builds (deploy trigger
reconfiguration, done manually once in the Cloudflare dashboard — not API/Wrangler-scriptable),
browser SPA (version display).

**Project Type**: Existing single-Worker web application — this feature only adds CI/release-process
files and one small frontend read of a build-time constant.

**Performance Goals**: N/A — this is deploy-cadence infrastructure, not a
runtime-performance-sensitive feature.

**Constraints**: Must not add a `package.json` to this repository (Principle IV) or a second
configuration file class (Principle V). Must not change the preview environment's existing
deploy-on-every-push behavior (FR-007, explicit scope boundary).

**Scale/Scope**: Two new GitHub Actions workflows (`release-please.yml` for release proposal,
`release-publish.yml` for advancing the `release` branch once a maintainer ships one — see
research.md §2 for why an originally-planned third, daily auto-merge workflow was built, live-tested,
and removed), one manual one-time Cloudflare dashboard change, one new small frontend read
(`Sidebar.tsx`'s footer, via `App.tsx`).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                     | Applies?                       | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Access-only gate                           | N/A                            | No identity/auth code touched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| II. Defense-in-depth JWT validation           | N/A                            | No `/api/*` auth path touched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| III. Single Worker, shared audit logic        | N/A                            | No evaluation/audit logic touched — this is deploy-process infrastructure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| IV. Deno-only local toolchain                 | Pass — see below               | `release-please-action` is a GitHub Action invoked via `uses:` in a workflow YAML, executing entirely inside GitHub's CI runner — never installed locally, never added to `deno.json`'s import map, and does not add a `package.json` to this repository. This is the identical category of tool `ci.yml`/`e2e.yml` already use without objection (`actions/checkout@v4`, `denoland/setup-deno@v2` are themselves Node-based GitHub Actions) — Principle IV's own text scopes the Deno-only mandate to "local development tooling" and this repository's own dependency graph, not to third-party CI orchestration that runs exclusively in CI. The generated version file is a plain `VERSION` text file, explicitly not a `package.json` or any file that could be mistaken for one. |
| V. One configuration file                     | Pass                           | `release-please-config.json`/`.release-please-manifest.json` are `release-please`'s own required config format (analogous to how `playwright.config.ts` and `wrangler.jsonc` already exist as separate, tool-required config files outside `deno.json` — Principle V's "one configuration file" has always meant _Deno's own_ configuration, not every tool's). No new class of _Deno_ config is introduced.                                                                                                                                                                                                                                                                                                                                                                           |
| VI. Strict TypeScript, test-first, Playwright | Pass (gate for implementation) | The one piece of actual application code this feature adds (reading the injected version constant in `Sidebar.tsx`) is strict TS and gets Playwright coverage (a new/extended e2e assertion) same as any other user-facing change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| VII. Never publicly reachable                 | Pass                           | Unaffected — `workers_dev: false` untouched; this feature doesn't change what's publicly reachable, only when new code reaches it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| VIII. Least-privilege secrets                 | Pass                           | The release workflow uses GitHub's own default `GITHUB_TOKEN` (already scoped, already used by `ci.yml`/`e2e.yml`) — no new Cloudflare API token, no new secret of any kind.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| IX. Every mutation is audited                 | N/A                            | `audit_log` stays scoped to real Cloudflare-account mutations the app itself performs (constitution's own Identity/Authorization/Audit section, reaffirmed by Module 8's spec) — a release/deploy is FlareTower's own release process, not an in-app mutating action an operator takes through the UI, so this precedent is unaffected, not reopened.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| X. English-only, Conventional Commits         | Pass — and reinforced          | This feature's entire version-bump classification mechanism (research.md §2) _depends on_ every commit already following Conventional Commits, which Principle X already mandates — this feature makes that existing discipline load-bearing rather than introducing a new requirement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/010-semver-releases/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
.github/workflows/
├── release-please.yml       # NEW — proposes/updates the release PR on every push to main; a maintainer merges it whenever ready to ship (FR-003/FR-004, revised 2026-08-12 — no unattended daily auto-merge, see research.md §2)
├── release-publish.yml      # NEW — on release:published, fast-forwards `release` to the tag
├── ci.yml                   # existing, untouched
└── e2e.yml                  # existing, untouched

release-please-config.json          # NEW — release-please's own config (release-type: simple, generic updater pointed at VERSION)
.release-please-manifest.json       # NEW — release-please's own version-tracking manifest
VERSION                             # NEW — plain-text current version, updated by release-please's generic file updater

vite.config.ts                      # define: injects the VERSION file's contents as a build-time constant
app/
├── App.tsx                         # computes footer.version string from __APP_VERSION__ (Sidebar.tsx itself unchanged — its footer.version field already exists)
└── vite-env.d.ts (or similar)      # NEW if needed — ambient type declaration for the injected constant

tests/
└── e2e/
    └── app-shell.spec.ts           # extended: footer shows the version constant when present
```

No `worker/` changes — this feature is entirely CI/build-tooling plus one frontend read, confirmed
by the Constitution Check and Technical Context above.

**Structure Decision**: Reuses the existing single-Worker web-application layout (`worker/`
untouched, `app/` gets the one Sidebar change, new top-level release-tooling files follow
`release-please`'s own required naming/location conventions). No new source directory.

## Complexity Tracking

_No Constitution Check violations — table not needed._
