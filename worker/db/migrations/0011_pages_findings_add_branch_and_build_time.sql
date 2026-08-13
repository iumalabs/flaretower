-- specs/015-pages-dashboard: both fields are already present in the same
-- Cloudflare API responses this module already fetches (research.md §1) —
-- production_branch on the project object, created_on on the deployment
-- object — just not captured until now. Numbered 0011 (not 0010) to avoid
-- colliding with specs/014-access-dashboard's still-unmerged
-- 0010_zt_app_findings_add_policy_detail.sql (data-model.md's numbering
-- note). Nullable: existing rows predating this migration have no value.
ALTER TABLE pages_subdomain_findings ADD COLUMN production_branch TEXT;
ALTER TABLE pages_deployment_findings ADD COLUMN created_at TEXT;
