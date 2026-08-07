-- Module 3 (Zero Trust / Access) — see specs/003-zero-trust/data-model.md.
-- Two independent finding/alert table pairs: applications and service
-- tokens have different identity shapes and lifecycles.

CREATE TABLE zt_app_findings (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  app_domain TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_zt_app_findings_app_evaluated_at
  ON zt_app_findings(app_id, evaluated_at DESC);

CREATE TABLE zt_app_alerts (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  app_domain TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_zt_app_alerts_unacknowledged ON zt_app_alerts(acknowledged_at);

CREATE TABLE zt_token_findings (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL,
  token_name TEXT NOT NULL,
  expires_at TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_zt_token_findings_token_evaluated_at
  ON zt_token_findings(token_id, evaluated_at DESC);

CREATE TABLE zt_token_alerts (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL,
  token_name TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning', 'critical')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_zt_token_alerts_unacknowledged ON zt_token_alerts(acknowledged_at);
