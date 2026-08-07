-- Module 4 (Pages) — see specs/004-pages/data-model.md.
-- Three independent finding/alert table pairs: custom domains have a
-- distinct identity from projects, and the two project-keyed checks
-- (pages.dev exposure, deployment health) are kept separate so each
-- alerts independently (research.md §3).

CREATE TABLE pages_domain_findings (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  domain_name TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_pages_domain_findings_domain_evaluated_at
  ON pages_domain_findings(project_name, domain_name, evaluated_at DESC);

CREATE TABLE pages_domain_alerts (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  domain_name TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_pages_domain_alerts_unacknowledged ON pages_domain_alerts(acknowledged_at);

CREATE TABLE pages_subdomain_findings (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  subdomain TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_pages_subdomain_findings_project_evaluated_at
  ON pages_subdomain_findings(project_name, evaluated_at DESC);

CREATE TABLE pages_subdomain_alerts (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  subdomain TEXT NOT NULL,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'critical', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning', 'critical')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_pages_subdomain_alerts_unacknowledged ON pages_subdomain_alerts(acknowledged_at);

CREATE TABLE pages_deployment_findings (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  deployment_id TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('safe', 'warning', 'not_evaluated')),
  reason TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled'))
);

CREATE INDEX idx_pages_deployment_findings_project_evaluated_at
  ON pages_deployment_findings(project_name, evaluated_at DESC);

CREATE TABLE pages_deployment_alerts (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  deployment_id TEXT,
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN ('safe', 'warning', 'not_evaluated')),
  new_status TEXT NOT NULL CHECK (new_status IN ('warning')),
  run_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX idx_pages_deployment_alerts_unacknowledged ON pages_deployment_alerts(acknowledged_at);
