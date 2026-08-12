# FlareTower — Agent Guide

Open-source control panel for Cloudflare — manage Workers, Access, DNS and security settings from
one place. Runs as a single Cloudflare Worker.

## Read this first

**`.specify/memory/constitution.md` is authoritative.** Read it before planning or implementing
anything. This file only points outward — it does not restate what's there.

## Spec Kit workflow

Specs live under `specs/<NNN-feature-name>/` (created by `/speckit-specify`). Each feature moves
through, in order:

1. `/speckit-constitution` — amend project principles (rare; governance-level)
2. `/speckit-specify` — turn a feature description into `spec.md`
3. `/speckit-clarify` — optional, resolves ambiguity in `spec.md` before planning
4. `/speckit-plan` — turn `spec.md` into a design plan (`plan.md`), gated by a Constitution Check
   against every principle
5. `/speckit-tasks` — turn the plan into ordered, actionable `tasks.md`
6. `/speckit-analyze` — optional, cross-checks spec/plan/tasks for consistency
7. `/speckit-implement` — execute `tasks.md`
8. `/speckit-converge` — reconcile the codebase against spec/plan/tasks and append any remaining
   work as new tasks

Only the first module (Workers & Access exposure) is specified so far. Everything else in the
product's full scope is documented in the constitution as future work — it gets its own spec, on its
own branch, when its turn comes. Do not jump ahead and build later modules early.

When `/speckit-taskstoissues` converts `tasks.md` tasks into GitHub issues, title them
`FT-001: <description>` (not the skill's own default `T001:
<description>`) — `FT-` (FlareTower)
makes the ID identifiable out of context (commit messages, cross-repo references), not just within
this one repo's `tasks.md`. Task IDs inside `tasks.md` itself (`T001`, `T002`, ...) stay in the
standard Spec Kit format — only the GitHub issue title gets the `FT-` prefix.

## Definition of done

A feature is done when: it complies with every constitution principle, has tests written
before/alongside the implementation, has Playwright coverage if it's a user-facing flow, passes
`deno fmt` / `deno lint` / `deno test`, and (if it mutates Cloudflare state) writes to `audit_log`
before the mutation is considered complete.

## Hard constraints — easiest to violate by accident

- **No `package.json`, ever.** Deno is the only local toolchain (`deno fmt`, `deno lint`,
  `deno test`, `deno coverage`, `deno task`). npm packages are fine via Deno's `npm:` specifier in
  `deno.json`'s import map — npm as a package manager is not.
- **One `deno.json`.** No separate `tsconfig.json`, `.eslintrc`, `.prettierrc`. If a tool wants to
  generate one of those, stop and surface it — don't let it happen silently.
- **`wrangler.jsonc` must have `"workers_dev": false`.** Non-negotiable, from the first commit
  onward. Never relax this for convenience or debugging.
- **Never implement IdP flows.** No OAuth client code, no `passport` adapters, no password storage.
  Cloudflare Access is the only auth gate; FlareTower only validates the `Cf-Access-Jwt-Assertion`
  JWT it receives. See constitution Principles I–II before touching anything auth-related.
- **Cloudflare API token lives only in Worker secrets** (`wrangler secret
  put`), never in `vars`,
  never accepted via the web UI, never logged.
