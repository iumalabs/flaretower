-- Module 1 (Workers & Access exposure) — see specs/001-workers-access-exposure/data-model.md.

CREATE TABLE exposure_findings (
  id TEXT PRIMARY KEY,
  worker_name TEXT NOT NULL,
  hostname TEXT NOT NULL,
  hostname_kind TEXT NOT NULL
    CHECK (hostname_kind IN ('custom_domain', 'workers_dev', 'preview_url')),
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

-- Primary read pattern: latest known state per hostname (current-state view
-- and the US4 new-vs-repeat diff both need this).
CREATE INDEX idx_exposure_findings_hostname_evaluated_at
  ON exposure_findings(hostname, evaluated_at DESC);

CREATE TABLE exposure_alerts (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  new_status TEXT NOT NULL
    CHECK (new_status IN ('warning', 'critical')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_exposure_alerts_unacknowledged
  ON exposure_alerts(acknowledged_at);
