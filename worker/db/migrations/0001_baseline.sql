-- Constitution-mandated baseline: users keyed by stable Access JWT `sub`
-- (never email, which can change), and an audit_log of every mutating
-- action against the managed Cloudflare account.

CREATE TABLE users (
  sub TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  idp TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_sub TEXT NOT NULL REFERENCES users(sub),
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
