-- specs/014-access-dashboard: policy_count, covered_hostname_count,
-- identity_summary, session_duration are all already present in the same
-- GET /accounts/{id}/access/apps response this module already fetches
-- (research.md §1-2) — just not captured until now. policy_rules_json is
-- the rule-humanizer's pre-computed output (research.md §5), persisted so
-- GET /inventory doesn't need to re-derive human-readable strings from raw
-- policy data on every request. All nullable: existing rows predating this
-- migration have no value for any of them.
-- app_name is Cloudflare's own human-readable Access Application name
-- (e.g. "gateway-admin") — a real gap this spec also closes: the table
-- previously had no readable app name at all, only app_id (a UUID) and
-- app_domain (a hostname pattern), neither of which is what an operator
-- would recognize an application by.
ALTER TABLE zt_app_findings ADD COLUMN app_name TEXT;
ALTER TABLE zt_app_findings ADD COLUMN policy_count INTEGER;
ALTER TABLE zt_app_findings ADD COLUMN covered_hostname_count INTEGER;
ALTER TABLE zt_app_findings ADD COLUMN identity_summary TEXT;
ALTER TABLE zt_app_findings ADD COLUMN session_duration TEXT;
ALTER TABLE zt_app_findings ADD COLUMN policy_rules_json TEXT;

-- JSON array of Access Group ids this app's policies reference (raw ids,
-- not humanized text) — lets GET /inventory compute each group's
-- referenced-by-app-count (research.md §3) by exact id match against the
-- live Groups list, rather than parsing policy_rules_json's human-readable
-- labels (which resolve a known group to its *name*, not its id, and so
-- can't be reliably matched back to a specific group id for a rename or a
-- duplicate-name edge case).
ALTER TABLE zt_app_findings ADD COLUMN referenced_group_ids TEXT;
