# Quickstart: Clone API Token Permissions

Manual validation guide once implemented. Unlike the semver/release feature, this one is fully
testable locally and in CI — nothing here requires a real Cloudflare account action beyond having
one real token payload on hand to start from (or a sample one, for a dry run).

## Prerequisites

- The feature merged; `deno task dev` running locally, or a real deploy.
- One real Cloudflare API token's permission-policy JSON, copied from Cloudflare's dashboard during
  token creation (or a hand-written sample matching the shape in data-model.md, for a dry run
  without touching a real account).

## Scenario 1 — Reuse an existing token's permissions (User Story 1)

1. Open the new "Token Tools" page from the sidebar.
2. Paste a token's permission-policy JSON into the input. **Expect**: a checklist appears listing
   every permission group by name (or by raw ID, visibly marked as unrecognized, for anything
   outside the curated lookup table).
3. Switch to (or view) the reusable-payload output. **Expect**: a JSON payload appears, shaped for
   pasting directly into Cloudflare's own token-creation flow, with the same permission groups and
   resource scoping as the input.
4. Paste that output into Cloudflare's own dashboard token-creation flow and complete creating a new
   token. **Expect**: the new token's own permission-policy JSON (viewable the same way) matches the
   original.
5. Paste clearly-invalid text (not JSON, or JSON missing `policies`). **Expect**: a specific error
   message, not a blank or misleading result.

## Scenario 2 — Verify two tokens match (User Story 2)

1. Paste two permission payloads known to be identical (e.g. the source token and the new token
   created in Scenario 1, step 4). **Expect**: a clear "these match" result.
2. Edit one pasted payload to remove or add one permission group, and re-run the comparison.
   **Expect**: the specific added/removed group is named in the result, not just a generic "these
   differ."
3. Edit one pasted payload's `resources` to reference a different account/zone ID while keeping
   `permission_groups` identical. **Expect**: the comparison reports a `resources` mismatch even
   though `permission_groups` still match — the two dimensions are reported independently
   (research.md §3), not collapsed.

## Automated coverage checklist (for the implementer, not manual QA)

- [ ] `deno fmt --check` / `deno lint` / `deno check` clean.
- [ ] `tests/unit/token-permissions.test.ts` covers: valid parse, invalid JSON,
      valid-JSON-wrong-shape, checklist name resolution (inline name / curated table / raw-ID
      fallback), reusable-payload shape, and comparison in all four combinations (match/match,
      groups differ, resources differ, both differ).
- [ ] `tests/e2e/token-tools.spec.ts` covers the same scenarios above via the actual UI, plus
      confirming (e.g. via a network-request assertion) that no request is ever sent while using
      this page — the strongest possible proof of FR-005/FR-007.
- [ ] No new entry needed in README's "Required API token scopes" table — confirming this feature
      genuinely shipped with zero new Cloudflare API scope (spec.md SC-003).
