-- issue #466 — covering_app_id (migration 0015) is a raw Cloudflare Access
-- Application UUID, correct for anything that needs the real identifier but
-- wrong for direct display (the exact bug this issue reports elsewhere).
-- Nullable for the same reason migration 0015's own columns are: existing
-- rows predating this migration have no value.
ALTER TABLE pages_domain_findings ADD COLUMN covering_app_name TEXT;
