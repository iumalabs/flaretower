-- Convergence fix (specs/003-zero-trust/tasks.md T025/T026): a run-level
-- log independent of zt_app_findings/zt_token_findings row counts.
--
-- Two problems this closes at once:
--   T025 — GET /api/zero-trust/inventory gated its ENTIRE response on
--   `zt_app_findings` alone (latest run looked up from that table only),
--   so an account with zero Access applications but legitimate service
--   token findings got an all-empty response. This table gives both
--   findings tables one shared, run-scoped source of truth for "which
--   run_id is latest" instead of either table having to stand in for it.
--   T026 — `runZeroTrustEvaluation` only ever inserted finding rows when
--   there was at least one application or token to record, so a run
--   against a genuinely empty account persisted nothing at all — making
--   "never evaluated" and "evaluated, found nothing" indistinguishable.
--   A row here is written unconditionally on every run, regardless of how
--   many findings it produced.
CREATE TABLE zt_evaluation_runs (
  run_id TEXT PRIMARY KEY,
  evaluated_at TEXT NOT NULL,
  run_trigger TEXT NOT NULL
    CHECK (run_trigger IN ('interactive', 'scheduled')),
  app_count INTEGER NOT NULL,
  token_count INTEGER NOT NULL
);

CREATE INDEX idx_zt_evaluation_runs_evaluated_at
  ON zt_evaluation_runs(evaluated_at DESC);
