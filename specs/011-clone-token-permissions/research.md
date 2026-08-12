# Phase 0 Research: Clone API Token Permissions

## 1. Local-only parsing vs. a direct Cloudflare API integration

**Decision**: This feature never calls the Cloudflare API. It parses and re-renders exactly what the
operator pastes in, client-side, and nothing else.

**Rationale**: Confirmed via Cloudflare's own API reference
(`developers.cloudflare.com/api/resources/user/subresources/tokens/...`) that:

- Reading an existing token's permission policy after the fact (`GET /user/tokens/{id}`), and even
  the seemingly-innocuous convenience lookup for human-readable permission-group names
  (`GET /user/tokens/permission_groups`), both sit under the same "API Tokens" scope tier as full
  token read/write access. There is no narrower, read-only-and-harmless scope that would let
  FlareTower fetch just names without also being capable of reading every token's full policy in the
  account.
- A token capable of reading or creating other API tokens is categorically more sensitive than
  anything FlareTower's own credential has ever held (every existing module's scope is a specific,
  narrow resource-read permission — Workers, DNS, Access, Pages, R2/KV/D1, security settings,
  Turnstile). Per constitution Principle VIII (least-privilege; scope added only when a mutation
  feature actually needs it, never provisioned ahead of need), this is exactly the kind of
  escalation that needs to be avoided rather than defaulted into for a convenience feature.
- The local-only design fully satisfies the actual pain point (spec.md's whole premise): the tedious
  part is manually re-selecting permission checkboxes, not the lack of an API integration. A
  paste-in/paste-out helper solves that completely without touching the API at all.

**Alternatives considered**:

- **FlareTower calls `GET /user/tokens/{id}` to read a source token directly, and/or
  `POST /user/tokens` to create the new one**: rejected as this feature's default — would require
  provisioning the account's most sensitive possible scope for a convenience feature that a local
  paste-in tool already solves without it. Documented here, not built, per explicit product-owner
  steering; revisiting this would need its own deliberate constitution-level review, not something
  to slip in incrementally.
- **`GET /user/tokens/permission_groups` only** (read names, but not tokens themselves; still don't
  create/read actual tokens): also rejected — this endpoint sits in the same "API Tokens" scope tier
  as full token access (confirmed above), so it wouldn't actually avoid the scope-escalation concern
  that's the entire reason for the local-only design.

## 2. Permission-group name lookup: curated static table, not the full list

**Decision**: Ship a small, curated, static `id → human name` lookup table
(`app/lib/cloudflare-permission-groups.ts`), seeded from the permission scopes FlareTower's own
README already documents (the realistic common case — cloning FlareTower's own preview/ production
tokens, or any other token built from a similar, small, well-known scope set). Any permission-group
ID not in that table falls back to displaying its raw ID (spec.md's edge case: must still be
represented, never silently dropped).

**Rationale**: Confirmed via Cloudflare's own API docs that a token-creation JSON payload's
`policies[].permission_groups[].name` field is _optional_ — the canonical example in Cloudflare's
own reference omits it, showing only `id` (+ empty `meta`). Real-world pasted payloads may well
carry IDs only, so _some_ lookup is needed for spec.md FR-002's "human-readable checklist" to hold
in the common case. Cloudflare's full list (`GET /user/tokens/permission_groups`) is ~2000 entries —
shipping/maintaining that as a static asset is disproportionate to this feature's actual need (an
operator cloning a token built from a handful of well-known scopes), and populating it would itself
require a one-time privileged API read (research.md §1's exact concern) — done once by a maintainer
with their own already-existing broader access, out-of-band, not by FlareTower's runtime code, and
the result committed as ordinary static data.

**Alternatives considered**:

- **Ship the full ~2000-entry list**: rejected — large, needs a privileged one-time fetch to
  populate, and would go stale as Cloudflare adds permission groups over time; the vast majority of
  entries are irrelevant to this tool's realistic use case.
- **No lookup table at all — always display raw IDs**: rejected — technically simplest and
  zero-maintenance, but fails FR-002 for the single most common real-world use of this feature
  (FlareTower's own tokens), where an operator would otherwise see a wall of opaque hex IDs instead
  of names like "Workers Scripts Read."

## 3. Diff semantics and implementation

**Decision**: Compare two parsed payloads along two independent dimensions: `permission_groups` (as
a set of IDs) and `resources` (as a key/value map) — reported separately, not collapsed into one
pass/fail. Implemented as a small hand-rolled function, not an npm diff library.

**Rationale**: Confirmed via Cloudflare's own docs/examples that `resources` keys embed a specific
account/zone ID (e.g. `com.cloudflare.api.account.<id>`) — two tokens meant to have "the same
permissions" against the _same_ Cloudflare account (this project's own preview/ production pair,
sharing one account per `wrangler.jsonc`) will have identical `resources` keys when correctly
scoped, but a token accidentally scoped to the wrong account/zone will show identical
`permission_groups` alongside _different_ `resources` — a real, meaningful mismatch spec.md User
Story 2 exists to catch, not noise to collapse away. Reporting the two dimensions separately
preserves that signal. The comparison logic itself (two small, known-shaped collections; set/map
equality and difference) is simple enough that hand-rolling it is more appropriate than adding an
npm dependency, matching this app's already-established minimal-dependency preference (e.g. no
router — `app/App.tsx`'s own state-based nav comment).

**Alternatives considered**:

- **A generic deep-diff npm library**: rejected — this isn't a generic deep-diff problem (the input
  shape is known and narrow), and the project has an established preference for avoiding a new
  dependency when a small amount of hand-written logic covers the actual need.
- **Single pass/fail result, no dimension breakdown**: rejected — would hide exactly the
  "permissions match but resources don't" case research confirmed is a real, meaningful mismatch
  signal, undermining the whole point of User Story 2.
