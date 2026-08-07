-- Module 5 (R2 / KV / D1) — see specs/005-r2-kv-d1/data-model.md.
-- Three independent finding/alert table pairs: R2 buckets, KV
-- namespaces, and D1 databases each have a genuinely distinct identity
-- space and lifecycle.

CREATE TABLE r2_bucket_findings (
  id TEXT PRIMARY KEY,
  bucket_name TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_r2_bucket_findings_bucket_evaluated_at
  ON r2_bucket_findings(bucket_name, evaluated_at DESC);

CREATE TABLE r2_bucket_alerts (
  id TEXT PRIMARY KEY,
  bucket_name TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning', 'critical')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_r2_bucket_alerts_unacknowledged ON r2_bucket_alerts(acknowledged_at);

CREATE TABLE kv_namespace_findings (
  id TEXT PRIMARY KEY,
  namespace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_kv_namespace_findings_namespace_evaluated_at
  ON kv_namespace_findings(namespace_id, evaluated_at DESC);

CREATE TABLE kv_namespace_alerts (
  id TEXT PRIMARY KEY,
  namespace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_kv_namespace_alerts_unacknowledged ON kv_namespace_alerts(acknowledged_at);

CREATE TABLE d1_database_findings (
  id TEXT PRIMARY KEY,
  database_uuid TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_d1_database_findings_database_evaluated_at
  ON d1_database_findings(database_uuid, evaluated_at DESC);

CREATE TABLE d1_database_alerts (
  id TEXT PRIMARY KEY,
  database_uuid TEXT NOT NULL,
  name TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_d1_database_alerts_unacknowledged ON d1_database_alerts(acknowledged_at);
