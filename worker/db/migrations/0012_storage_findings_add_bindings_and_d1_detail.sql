-- specs/016-storage-dashboard: "Bound to" is derived from the Worker-bindings
-- scan this module already performs for its existing usage-status check
-- (research.md §2) — this just persists which Worker names were found,
-- instead of discarding them. R2's custom_domain is already-fetched data
-- (research.md §3). D1's num_tables/file_size come from the per-database
-- detail endpoint, a new but cheap call (research.md §1).
-- Numbered 0012 (not 0010) to avoid colliding with specs/015-pages-dashboard's
-- still-unmerged 0011_pages_findings_add_branch_and_build_time.sql
-- (data-model.md's numbering note). Nullable: existing rows predating this
-- migration have no value.
ALTER TABLE r2_bucket_findings ADD COLUMN custom_domain TEXT;
ALTER TABLE r2_bucket_findings ADD COLUMN bound_to_workers TEXT;

ALTER TABLE kv_namespace_findings ADD COLUMN bound_to_workers TEXT;

ALTER TABLE d1_database_findings ADD COLUMN bound_to_workers TEXT;
ALTER TABLE d1_database_findings ADD COLUMN num_tables INTEGER;
ALTER TABLE d1_database_findings ADD COLUMN file_size INTEGER;
