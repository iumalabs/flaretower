-- issue #457: the production custom domain's own Access-policy coverage —
-- a genuinely separate signal from pages_domain_findings' existing `status`
-- (domain activation/SSL health, unchanged by this migration). Nullable:
-- existing rows predating this migration have no value, same pattern as
-- migration 0014's covering_app_ids on exposure_findings. access_status
-- deliberately excludes 'critical' — see worker/modules/pages/types.ts's
-- DomainAccessEvaluation doc comment for why a production domain with no
-- covering Access app isn't treated as a severity claim.
ALTER TABLE pages_domain_findings ADD COLUMN access_status TEXT
  CHECK (access_status IS NULL OR access_status IN ('safe', 'warning', 'not_evaluated'));
ALTER TABLE pages_domain_findings ADD COLUMN access_reason TEXT;
ALTER TABLE pages_domain_findings ADD COLUMN covering_app_id TEXT;
