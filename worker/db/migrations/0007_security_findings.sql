-- Module 6 (Security Posture) — see specs/006-security-posture/data-model.md.
-- Four independent finding/alert table pairs, all zone-keyed but kept
-- separate so each of the four checks alerts independently (Module 4's
-- established precedent for same-parent-entity, independently-alertable
-- signals).

CREATE TABLE ssl_tls_findings (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_ssl_tls_findings_zone_evaluated_at
  ON ssl_tls_findings(zone_id, evaluated_at DESC);

CREATE TABLE ssl_tls_alerts (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning', 'critical')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_ssl_tls_alerts_unacknowledged ON ssl_tls_alerts(acknowledged_at);

CREATE TABLE dnssec_findings (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_dnssec_findings_zone_evaluated_at
  ON dnssec_findings(zone_id, evaluated_at DESC);

CREATE TABLE dnssec_alerts (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_dnssec_alerts_unacknowledged ON dnssec_alerts(acknowledged_at);

CREATE TABLE waf_findings (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_waf_findings_zone_evaluated_at
  ON waf_findings(zone_id, evaluated_at DESC);

CREATE TABLE waf_alerts (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_waf_alerts_unacknowledged ON waf_alerts(acknowledged_at);

CREATE TABLE rate_limiting_findings (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_rate_limiting_findings_zone_evaluated_at
  ON rate_limiting_findings(zone_id, evaluated_at DESC);

CREATE TABLE rate_limiting_alerts (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_rate_limiting_alerts_unacknowledged ON rate_limiting_alerts(acknowledged_at);
