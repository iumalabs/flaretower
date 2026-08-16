-- specs/023-worker-detail-page (research.md §2): evaluateHostname() already computes which
-- Access application(s) cover a hostname (findCoveringApps()) but previously only surfaced the
-- IDs concatenated into the human-readable `reason` string. Structured here instead, so the
-- Worker detail page can join against zt_app_findings without depending on reason's exact
-- wording. Nullable JSON array — same pattern as migration 0010's referenced_group_ids on
-- zt_app_findings; existing rows predating this migration have no value.
ALTER TABLE exposure_findings ADD COLUMN covering_app_ids TEXT;
