# Phase 0 Research: Storage Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

## §1. D1 per-database detail endpoint returns table count and size

**Decision**: Fetch `GET /accounts/{account_id}/d1/database/{database_id}` (the per-database
detail endpoint) for every D1 database already discovered by the existing list call
(`GET /accounts/{account_id}/d1/database`). This is a genuinely new Cloudflare API call, but a
cheap one — accounts typically have few D1 databases, and this project already fires one detail
fetch per resource elsewhere (e.g. Module 4/Pages' per-project domains/deployments fetches).

**Rationale**: Confirmed against Cloudflare's own OpenAPI specification during planning — the
detail endpoint's `result` object includes `num_tables` (number) and `file_size` (number, bytes),
neither of which the list endpoint returns. No new token scope: this is the same D1 read access
already granted for `listD1Databases()`.

**Alternatives considered**: Deriving size/table-count from D1's query interface
(`PRAGMA table_list` / `sqlite_master` via `POST /d1/database/{id}/query`) — rejected as needless;
the detail endpoint already returns both fields directly, no query execution needed.

## §2. "Bound to" — reworking the existing binding scan to preserve Worker names

**Decision**: `worker/modules/storage/inventory.ts`'s existing `buildBindingReferences()` already
scans every deployed Worker's bindings to build `Set<string>` of referenced KV namespace ids and
D1 database ids (used only for the existing safe/warning "referenced or not" usage check). Extend
it to also build `Map<string, string[]>` per resource type (namespace id → Worker names, database
id → Worker names, bucket name → Worker names) — additive alongside the existing flat Sets, which
stay exactly as they are so `evaluateKvNamespaceUsage()`/`evaluateD1DatabaseUsage()` in
`evaluate.ts` need zero changes to their decision logic (spec.md FR-004).

**Rationale**: The scan already visits every binding of every script; the only change is not
discarding the script's own name when a match is found. No new Cloudflare API call.

**R2 buckets are a new addition to the scan**: today's `buildBindingReferences()` only recognizes
`kv_namespace` and `d1` binding types — R2 isn't scanned for "unused" at all (R2's exposure check,
`evaluateBucketExposure()`, is about public reachability, not usage, so it never needed this). This
feature adds `r2_bucket`-typed binding recognition purely to populate the new Bound-to map for
buckets — it does NOT add a new "orphaned R2 bucket" warning state, since that's outside this
spec's scope (FR-004 — no new status/reason decision).

**R2 binding shape**: confirmed against Cloudflare's OpenAPI specification — an `r2_bucket`-typed
binding has a `bucket_name` field (the bucket's name, not an opaque id), unlike KV/D1 bindings
which reference by id. Matching is therefore by name for R2, by id for KV/D1 — each resource type
already has the right natural key for this (`bucketName` vs `namespaceId`/`databaseUuid`).

**Display rule** (spec.md FR-001, Edge Cases): 0 referencing Workers → "none"; exactly 1 → that
Worker's name; more than 1 → a count ("N workers"), never a truncated name list — a small pure
helper function computes this from the persisted array, mirroring spec 015's
`deriveProductionDomain()` precedent of a pure display-derivation helper living in `routes.ts`.

## §3. R2 "Custom domain" column — already-fetched data, not yet surfaced

**Decision**: `fetchBucketsWithDomains()` already returns each bucket's full `customDomains` array
(`{ domain, enabled }[]`). Surface the first *enabled* domain as its own column value, or an
explicit "none" state when none are enabled — no new fetch.

**Rationale**: Directly mirrors spec 015's `deriveProductionDomain()` precedent (first
active/enabled entry among already-fetched per-resource data, a display simplification not a new
evaluation).

## §4. R2 object count/size and KV key count/size — deliberately out of scope

**Decision**: Do not attempt to fetch or approximate these values.

**Rationale**:
- **R2 objects/size**: Cloudflare's R2 bucket API (list, get) exposes no per-bucket object-count or
  storage-size field. The only real source is R2 Analytics via the GraphQL Analytics API (the same
  API family Module 1/Workers Dashboard already uses for request metrics) — a comparable-scale
  research and implementation effort to an entire extra spec, disproportionate to a "one more
  column" ask, and explicitly out of scope per spec.md FR-007/Assumptions.
- **KV keys/size**: Cloudflare's KV namespace list API returns no key-count or size field either.
  The only way to get an exact key count is to paginate `GET .../storage/kv/namespaces/{id}/keys`
  to exhaustion — the design mockup's own example shows a namespace with 180,442 keys, meaning a
  real account could require hundreds of paginated calls per namespace just to render one number.
  Disproportionate cost for a non-security-relevant display detail.

Both trims are documented here rather than silently dropped, matching this rollout's established
precedent (specs 013/015: DMARC's "no record at all" case, Pages' build-duration) of explaining
*why* a mockup detail was cut, not just that it was.

## §5. Migration numbering

**Decision**: Number this feature's migration `0012`, not `0010`.

**Rationale**: At the time this branch was created (forked from `origin/main` after spec 014's PR
merged, which claimed `0010`), spec 015 (Pages Dashboard)'s PR — still unmerged — already claims
`0011`. Naming this migration `0012` up front avoids a numbering collision once both PRs merge to
`main` in sequence, following the same defensive-numbering precedent spec 015 itself established
against spec 014.

## §6. Exposure status — no new taxonomy

**Decision**: The Exposure column continues to render exactly the existing
safe/warning/critical/not_evaluated status (via the unchanged `ExposureStatusBadge`/`FindingsTable`
components) for all three resource types. The mockup's bespoke pill text ("INTERNAL"/"ORPHANED" for
KV/D1, "PUBLIC READ"/"PRIVATE" for R2) is not built as new labels or a second taxonomy.

**Rationale**: This project's existing Reason text already communicates equivalent information in
plain language (e.g. "referenced by at least one deployed Worker's bindings", "r2.dev managed
public URL is enabled") — matching every prior spec's precedent (012-015) of reusing existing
status vocabulary rather than inventing bespoke per-page label taxonomies.
