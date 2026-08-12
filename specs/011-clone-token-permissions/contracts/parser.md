# Contracts: Clone API Token Permissions

This feature adds no HTTP API endpoints (plan.md's Constitution Check — no `worker/` changes at
all). Its "interface" is the pure function contract of `app/lib/token-permissions.ts`, which
`TokenToolsPage.tsx` calls directly.

## `parseTokenPayload(input: string): { ok: true; policies: ParsedTokenPayload } | { ok: false; error: string }`

**Contract**:

- Accepts the raw pasted text. Attempts `JSON.parse`; on failure, returns
  `{ ok: false, error: "..." }` with a message naming the actual problem (invalid JSON), not a
  generic "something went wrong" (spec.md FR-008).
- If valid JSON but not shaped like a token-creation payload (no `policies` array, or a policy
  missing `effect`/`permission_groups`/`resources`), returns `{ ok: false, error: "..." }` with a
  message naming what was expected (spec.md Acceptance Scenario 3, FR-008).
- On success, returns `{ ok: true, policies }` — see data-model.md's `ParsedPolicy` shape.
  `permission_groups[].name`, when present in the input, is preserved; when absent, left `undefined`
  (resolved to a display name only in `renderChecklist`, not here — keeps parsing and lookup-table
  concerns separate).
- Never throws — every failure mode is a returned `{ ok: false }`, never an uncaught exception that
  would crash the page.

## `renderChecklist(policies: ParsedTokenPayload): ChecklistItem[]`

**Contract**:

- Flattens every policy's `permissionGroups` into one list of `ChecklistItem`s (data-model.md).
- For each, resolves a display name in this order: the input's own inline `name` (if present) → the
  curated static lookup table (`cloudflare-permission-groups.ts`, research.md §2) → the raw `id`
  (edge case: unrecognized groups are still represented, `recognized: false`, never dropped —
  spec.md's edge case).
- Pure — no I/O, no Cloudflare API call, ever (spec.md FR-005/FR-006, non-negotiable for this entire
  module).

## `toReusablePayload(policies: ParsedTokenPayload): object`

**Contract**:

- Produces a JSON-serializable object shaped for pasting into Cloudflare's own token-creation flow:
  `{ policies: [{ effect, permission_groups: [{ id }], resources }] }` — deliberately drops any
  inline `name`/`meta` from `permission_groups` (Cloudflare's own creation endpoint only requires
  `id`) and omits `name`/`expires_on`/`not_before`/`condition` entirely (spec.md Assumptions — those
  are per-token operator decisions, never carried over automatically).

## `comparePolicies(a: ParsedTokenPayload, b: ParsedTokenPayload): ComparisonResult`

**Contract**:

- Flattens each side's `permissionGroups` into an ID set and each side's `resources` into a
  key/value map, per data-model.md's `ComparisonResult` shape — reported as two independent
  dimensions, never collapsed into one boolean (research.md §3: a permission-groups match with a
  resources mismatch is a real, meaningful signal, not noise).
- Order-independent: `comparePolicies(a, b)` and the mirrored inputs produce mirrored
  `onlyInA`/`onlyInB` results, not a different verdict.
- Pure — no I/O.

## `TokenToolsPage.tsx`'s own contract

- Never sends the pasted input anywhere over the network — no `fetch` call in this page or anything
  it imports, at all (spec.md FR-005/FR-007). This is directly verifiable by reading the page's own
  source: it imports only from `app/lib/token-permissions.ts` and
  `app/lib/cloudflare-permission-groups.ts`, neither of which performs I/O.
- Displays a clear, permanent notice that this tool only reformats/compares what's pasted and never
  touches the operator's actual Cloudflare account (spec.md FR-009).
