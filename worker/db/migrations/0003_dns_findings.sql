-- Module 2 (DNS) — see specs/002-dns/data-model.md. Structurally parallel
-- to Module 1's exposure_findings/exposure_alerts, kept as this module's
-- own pair of tables rather than shared/polymorphic (research.md §5).

CREATE TABLE dns_findings (
  id TEXT PRIMARY KEY,
  zone_name TEXT NOT NULL,
  record_name TEXT NOT NULL,
  record_type TEXT NOT NULL,
  content TEXT NOT NULL,
  proxy_capable INTEGER NOT NULL,
  proxied INTEGER,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_dns_findings_record_evaluated_at
  ON dns_findings(zone_name, record_name, record_type, evaluated_at DESC);

CREATE TABLE dns_alerts (
  id TEXT PRIMARY KEY,
  zone_name TEXT NOT NULL,
  record_name TEXT NOT NULL,
  record_type TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  new_status TEXT NOT NULL
    CHECK (new_status IN ('warning', 'critical')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_dns_alerts_unacknowledged
  ON dns_alerts(acknowledged_at);
