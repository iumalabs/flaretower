# Phase 1 Data Model: Clone API Token Permissions

No D1 tables, columns, or migrations — this feature has no persisted data model at all (plan.md's
Constitution Check, Principle III/IX rows; spec.md FR-007). Everything below exists only as
in-memory shapes for the duration of a single paste/render cycle in the browser.

## Parsed Token Payload

The normalized, in-memory representation of a pasted Cloudflare token-creation JSON payload (shape
confirmed against Cloudflare's own API reference — research.md §1):

```ts
interface ParsedPolicy {
  effect: "allow" | "deny";
  permissionGroups: { id: string; name?: string }[];
  resources: Record<string, string>;
}
type ParsedTokenPayload = ParsedPolicy[];
```

Deliberately excludes `name`, `expires_on`, `not_before`, and `condition` from the parsed shape —
those are per-token metadata the operator sets for each token individually (spec.md Assumptions:
"this feature concerns only the permission groups/scopes portion of a token"), not something to
carry over between a source and a new token.

## Permission Group Name Lookup

A small, curated, static `Record<string, string>` (permission-group ID → human-readable name),
committed as ordinary source data (`app/lib/cloudflare-permission-groups.ts`) — not fetched at
runtime by FlareTower itself (research.md §2). Populated once, out-of-band, from Cloudflare's own
permission-groups reference for the scopes FlareTower's own README already documents.

## Checklist Item

The rendered, human-facing form of one permission group within a policy:

```ts
interface ChecklistItem {
  id: string;
  name: string; // looked-up human name, or the raw id if not in the curated table
  recognized: boolean; // false when name === id (edge case: unrecognized group, spec.md)
}
```

## Comparison Result

The outcome of comparing two `ParsedTokenPayload`s (User Story 2) — reported per-dimension per
research.md §3, not collapsed into a single boolean:

```ts
interface ComparisonResult {
  permissionGroups: { onlyInA: string[]; onlyInB: string[]; matches: boolean };
  resources: { onlyInA: string[]; onlyInB: string[]; matches: boolean };
}
```

`matches` is `true` on both when both `onlyInA`/`onlyInB` are empty. A UI-level "these match" result
(spec.md Acceptance Scenario "these match") is `permissionGroups.matches &&
resources.matches`.
