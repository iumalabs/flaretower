-- specs/017-security-dashboard: 3 new independent finding/alert table
-- pairs, mirroring the exact shape of the 4 pairs already established in
-- 0007_security_findings.sql — "kept separate so each of the four checks
-- alerts independently" applies equally to these 3 new checks.
-- Numbered 0013 (not 0007's follow-on 0008/0009/0010) to avoid colliding
-- with specs/015-pages-dashboard's 0011 and specs/016-storage-dashboard's
-- still-unmerged 0012 (data-model.md's numbering note).

CREATE TABLE bot_fight_mode_findings (
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

CREATE INDEX idx_bot_fight_mode_findings_zone_evaluated_at
  ON bot_fight_mode_findings(zone_id, evaluated_at DESC);

CREATE TABLE bot_fight_mode_alerts (
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

CREATE INDEX idx_bot_fight_mode_alerts_unacknowledged ON bot_fight_mode_alerts(acknowledged_at);

CREATE TABLE always_https_findings (
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

CREATE INDEX idx_always_https_findings_zone_evaluated_at
  ON always_https_findings(zone_id, evaluated_at DESC);

CREATE TABLE always_https_alerts (
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

CREATE INDEX idx_always_https_alerts_unacknowledged ON always_https_alerts(acknowledged_at);

CREATE TABLE min_tls_findings (
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

CREATE INDEX idx_min_tls_findings_zone_evaluated_at
  ON min_tls_findings(zone_id, evaluated_at DESC);

CREATE TABLE min_tls_alerts (
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

CREATE INDEX idx_min_tls_alerts_unacknowledged ON min_tls_alerts(acknowledged_at);
