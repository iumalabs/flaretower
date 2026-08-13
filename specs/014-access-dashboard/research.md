# Phase 0 Research: Access Dashboard

## 1. Session duration, covered hostnames, and raw policy rules — already in the existing fetch

**Decision**: Cloudflare's Access Application object (returned by the same
`GET /accounts/{id}/access/apps` call `listAccessApplications()` already makes) already carries
`session_duration`, and each policy object already carries its full `include`/`require`/`exclude`
rule arrays — Module 3 currently only reads `policies[].decision` and summarizes `include` down to
two booleans, discarding the rest. Multi-hostname coverage is captured via the application's
`self_hosted_domains` array when present, falling back to `[domain]` for an app that only has the
legacy single-domain field.

**Rationale**: No new Cloudflare API call for any of this — purely capturing fields already present
in a response this module already fetches and parses.

## 2. Identity provider name resolution — new API call

**Decision**: A new `GET /accounts/{id}/access/identity_providers` call builds an `id -> name` map,
used both to humanize a policy's `login_method` rule (e.g. "REQUIRE identity provider · Okta") and to
populate the table's Identity column (the distinct set of provider names across an application's
policies, joined; "— none —" when no policy has a `login_method` rule anywhere; "service token" when
every policy's rules are `service_token`-only). An id with no match in the map (a deleted provider)
renders as "unknown provider" (spec.md Edge Cases), never omitted or fabricated.

**Rationale**: A `login_method` rule only carries the provider's `id`, not a human name — matching
this project's own established principle from `worker/lib/cloudflare-permission-groups.ts`-style
lookups: resolve what needs a name via a small, purpose-built fetch rather than showing a raw ID.

## 3. Access Groups — new API call, live-read (not persisted)

**Decision**: A new `GET /accounts/{id}/access/groups` call, read **live on every
`GET /api/zero-trust/inventory` request** — not persisted through the evaluate/scheduled pipeline,
unlike the Application-level fields in §1. Each group shows its own rule-type summary (via the same
rule-humanizer built for §4, e.g. "Okta group", "service token") and a reference count computed by
scanning every application's policies for a `group` rule matching that group's id (pure local
computation over data already fetched, no extra API call for the count itself).

**Rationale for live-read, not persisted**: Groups have no safe/warning evaluation concept of their
own (informational only, nothing to alert on) — the same reasoning spec 012 used for its Workers
recent-changes panel (a second, self-contained data source with no evaluation semantics of its own).
Persisting them through the finding/alert pipeline would imply a status they don't have.

**Correction from the design mockup's own placeholder data**: the mockup's example groups show a
literal member count ("9 members · Okta group"). Cloudflare's Access API does not expose a queryable
headcount for a group — group membership is evaluated per-request against its rules, not a static,
listable number. Fabricating one would violate this project's own "never fabricate data the app has
no real source for" principle (established repeatedly across prior modules, e.g. specs/009's own
footer-version precedent). **This spec drops the member-count figure** and shows only the group's
real, honestly-obtainable rule-type summary and its real application-reference count.

## 4. Rule-humanizer scope

**Decision**: A pure function maps one Cloudflare Access rule selector object to a plain-language
string, covering: `everyone`, `email_domain`, `email`, `service_token`, `login_method` (via §2's
id→name map), `ip`/`ip_list`, and `group` (referencing another Access Group's id, resolved to that
group's name when known). Each policy's `decision` maps to a verb: `allow`→ALLOW, `deny`→DENY,
`bypass`→ALLOW (bypasses identity entirely — arguably its own verb, but "ALLOW, no identity check" is
the accurate plain-language read and avoids inventing a fourth verb beyond the three FR-003
specifies). Each rule inside a policy's `require` array uses the REQUIRE verb regardless of the
policy's own decision (an AND-condition, not a grant). Any rule type outside this set renders as a
generic `"<verb> <raw rule type>"` label (spec.md FR-004) — informative without guessing specifics.

**Rationale**: Covers the realistic common cases this project's own existing modules already care
about (identity, service tokens, network-level restrictions, nested groups) without attempting to
model every Cloudflare Access rule type that exists — spec.md's own Assumption on this point.

## 5. Persistence

**Decision**: Five new nullable columns on the existing `zt_app_findings` table: `policy_count
INTEGER`, `covered_hostname_count INTEGER`, `identity_summary TEXT`, `session_duration TEXT`,
`policy_rules_json TEXT` (the rule-humanizer's structured output, pre-computed at evaluation time and
serialized — read back as-is by `GET /inventory`, not re-parsed from raw Cloudflare data on every
request). Access Groups (§3) are NOT persisted — read live, separately, in the same
`GET /inventory` handler.

**Rationale**: These five fields describe the SAME application entity `zt_app_findings` already has
one row per, from the SAME evaluation run, sourced from data already fetched in §1's single API call
— natural fit for the existing table, consistent with spec 013's TTL precedent (persist alongside
data from the same fetch, rather than a parallel live-only re-fetch). A JSON column for the
pre-computed rule breakdown avoids re-deriving human-readable strings from raw policy data on every
`GET /inventory` call, and avoids a much heavier normalized rules table for what is fundamentally
per-run, read-only display data with no cross-run query need of its own.

## 6. Token scope

**Decision**: Assumed to sit under the account's existing `Access: Apps and Policies Read` scope
(Cloudflare's dashboard permission picker groups Access apps, policies, groups, and identity
providers under one closely-related Zero Trust permission surface) — a working assumption, to be
confirmed live at quickstart.md's end-to-end run, with a README token-scope table update at that
point if a distinct scope turns out to be required. No code depends on which turns out to be true.
