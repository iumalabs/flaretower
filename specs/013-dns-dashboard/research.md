# Phase 0 Research: DNS Dashboard

## 1. TTL capture

**Decision**: Add `ttl` to the raw record shape already fetched by `listZoneRecords()`
(`GET /zones/{id}/dns_records`, which Cloudflare's API already returns a `ttl` field on — confirmed
against Cloudflare's own DNS record schema, `ttl: 1` meaning "auto" for a proxied record), thread it
through `DnsRecord`/`DnsRecordEvaluation`, and add a new nullable `ttl` column to the existing
`dns_findings` table (one new D1 migration) so it persists alongside every other per-record field
this page already shows.

**Rationale**: No new Cloudflare API call — the data is already present in the exact response this
module already parses, just not read yet. Persisting it (rather than a parallel live-only fetch, the
pattern spec 012 used for last-deploy-time) keeps every field on this page sourced the same way, from
one evaluation run, which is simpler here since there's no second unrelated API call this data would
otherwise piggyback on.

**Alternatives considered**:

- **Live-only fetch on each page load (spec 012's pattern for last-deploy-time)**: rejected — that
  pattern exists in spec 012 because last-deploy-time came from a *second*, otherwise-unneeded API
  call; TTL is already inside the *first* call this module makes, so persisting it alongside
  everything else already being persisted is simpler, not more work.

## 2. DMARC ineffective-policy detection

**Decision**: A zone's `_dmarc` TXT record (matched by exact record name, e.g. `_dmarc.example.com`)
is parsed as a `;`-delimited `tag=value` string (DMARC's own standard format, RFC 7489) looking
specifically for a `p=` tag. `p=none` → warning ("DMARC policy provides no enforcement"). `p=quarantine`
or `p=reject` → no warning from this check. No `_dmarc` record present in the zone at all → no
finding fabricated (spec.md Edge Cases) — this check only evaluates a `_dmarc` record that exists.

**Rationale**: Purely a string-parse of data already fetched (the record's own `content` value) — no
new Cloudflare API call, no new token scope. `p=none` is DMARC's own defined "monitor only, take no
enforcement action" value per RFC 7489 §6.3 — a well-established, unambiguous signal, not a judgment
call this project is inventing.

**Alternatives considered**:

- **Warn on missing `_dmarc` record entirely (no DMARC set up at all)**: rejected for this spec — a
  materially different, broader claim ("you have no email-spoofing protection at all" vs. "the
  protection you configured doesn't enforce anything") that deserves its own deliberate scoping
  decision rather than folding in silently; spec.md's Edge Cases explicitly rules this out for now.

## 3. "Points at a Cloudflare platform domain" informational label

**Decision**: A record's `content` value is pattern-matched against a small set of known Cloudflare
platform domain suffixes (`.pages.dev`, `.workers.dev`) — a match sets a presentational
`isPlatformTarget: true` flag, shown as a neutral informational label, never a warning/critical
severity and never affecting `status`.

**Rationale**: The design mockup itself tags this case "PUBLIC" in a neutral (na) tone, not a warning
color — it's explicitly informational in the source design, matching spec.md's own framing (FR-007:
"informational (non-warning) label"). A simple suffix match needs no new API call and no
cross-referencing this project's own Pages/Workers modules.

**Alternatives considered**:

- **Cross-reference against Module 4 (Pages)/Module 1 (Workers) to confirm the target project/Worker
  actually exists and is itself already flagged**: rejected as disproportionate for a purely
  informational label — the label's whole purpose is "this points somewhere Cloudflare-hosted,"
  which a suffix match answers directly without a second module's data.

## 4. Zone-scoped table, not a flattened cross-zone table

**Decision**: The frontend selects one zone (client-side, local component state — spec.md's own
Assumption) and passes only that zone's already-fetched records to the existing `FindingsTable`
component, unchanged. `FindingsTable`'s own built-in per-status count footer and status-filter chips
then naturally scope to the selected zone with no new component logic (data-model.md's Zone tab
entity is presentational only, derived from the same `GET /api/dns/inventory` response every
`Zone`/`records` array already carries).

**Rationale**: `GET /api/dns/inventory` already returns every zone with its own records grouped —
zone-scoping the table is a pure frontend filtering change, no backend/API shape change needed beyond
the TTL/DMARC/platform-target field additions above.
