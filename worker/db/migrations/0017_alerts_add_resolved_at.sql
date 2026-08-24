-- issue #481: an alert that has recovered (its entity's latest evaluated
-- status is back to safe/not warning-or-critical) auto-resolves instead of
-- staying in the Unified Alerts Inbox/Overview forever until someone
-- manually acknowledges it — acknowledge remains available for alerts
-- that are still genuinely open. Nullable: NULL means "not resolved" (the
-- same convention acknowledged_at already uses), and every existing row
-- predates this column so starts NULL regardless of its real current state.
ALTER TABLE exposure_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE dns_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE zt_app_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE zt_token_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE pages_domain_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE pages_subdomain_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE pages_deployment_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE r2_bucket_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE kv_namespace_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE d1_database_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE ssl_tls_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE dnssec_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE waf_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE rate_limiting_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE bot_fight_mode_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE always_https_alerts ADD COLUMN resolved_at TEXT;
ALTER TABLE min_tls_alerts ADD COLUMN resolved_at TEXT;
