// The hard-coded registry of all seventeen finding/alert table pairs
// Modules 1-6 already populate (research.md §2, data-model.md). Table
// and column names here are the only place they may ever come from —
// never request input — the same allowlist discipline every prior
// module's ALERT_TABLE_BY_KIND already established (research.md §3).
//
// Two distinct column lists per source, because "the true stable
// identity of one entity" and "what's readable to a human" aren't
// always the same column, and a finding table sometimes carries more
// identity detail than its alert-table counterpart (e.g.
// exposure_findings tracks worker_name/hostname/hostname_kind, but
// exposure_alerts only tracks hostname):
//   - findingIdentityColumns: from findingsTable, a stable unique key
//     for one entity — used to group/compare the same entity's status
//     over time (changes.ts).
//   - alertLabelColumns: from alertsTable, the most readable columns
//     for display in the unified inbox (inbox.ts) — the alert row's own
//     `id` is what acknowledge actually keys off, so this never needs
//     to be a strict unique key, only a clear label.
export interface AuditSource {
  module: string;
  kind: string;
  findingsTable: string;
  alertsTable: string;
  findingIdentityColumns: string[];
  alertLabelColumns: string[];
}

export const AUDIT_SOURCES: readonly AuditSource[] = [
  {
    module: "exposure",
    kind: "hostname",
    findingsTable: "exposure_findings",
    alertsTable: "exposure_alerts",
    findingIdentityColumns: ["hostname"],
    alertLabelColumns: ["hostname"],
  },
  {
    module: "dns",
    kind: "record",
    findingsTable: "dns_findings",
    alertsTable: "dns_alerts",
    findingIdentityColumns: ["zone_name", "record_name", "record_type", "content"],
    alertLabelColumns: ["zone_name", "record_name", "record_type"],
  },
  {
    module: "zero-trust",
    kind: "application",
    findingsTable: "zt_app_findings",
    alertsTable: "zt_app_alerts",
    findingIdentityColumns: ["app_id"],
    alertLabelColumns: ["app_domain"],
  },
  {
    module: "zero-trust",
    kind: "service_token",
    findingsTable: "zt_token_findings",
    alertsTable: "zt_token_alerts",
    findingIdentityColumns: ["token_id"],
    alertLabelColumns: ["token_name"],
  },
  {
    module: "pages",
    kind: "domain",
    findingsTable: "pages_domain_findings",
    alertsTable: "pages_domain_alerts",
    findingIdentityColumns: ["project_name", "domain_name"],
    alertLabelColumns: ["project_name", "domain_name"],
  },
  {
    module: "pages",
    kind: "subdomain",
    findingsTable: "pages_subdomain_findings",
    alertsTable: "pages_subdomain_alerts",
    findingIdentityColumns: ["project_name"],
    alertLabelColumns: ["subdomain"],
  },
  {
    module: "pages",
    kind: "deployment",
    findingsTable: "pages_deployment_findings",
    alertsTable: "pages_deployment_alerts",
    findingIdentityColumns: ["project_name"],
    alertLabelColumns: ["project_name"],
  },
  {
    module: "storage",
    kind: "r2_bucket",
    findingsTable: "r2_bucket_findings",
    alertsTable: "r2_bucket_alerts",
    findingIdentityColumns: ["bucket_name"],
    alertLabelColumns: ["bucket_name"],
  },
  {
    module: "storage",
    kind: "kv_namespace",
    findingsTable: "kv_namespace_findings",
    alertsTable: "kv_namespace_alerts",
    findingIdentityColumns: ["namespace_id"],
    alertLabelColumns: ["title"],
  },
  {
    module: "storage",
    kind: "d1_database",
    findingsTable: "d1_database_findings",
    alertsTable: "d1_database_alerts",
    findingIdentityColumns: ["database_uuid"],
    alertLabelColumns: ["name"],
  },
  {
    module: "security",
    kind: "ssl_tls",
    findingsTable: "ssl_tls_findings",
    alertsTable: "ssl_tls_alerts",
    findingIdentityColumns: ["zone_id"],
    alertLabelColumns: ["zone_name"],
  },
  {
    module: "security",
    kind: "dnssec",
    findingsTable: "dnssec_findings",
    alertsTable: "dnssec_alerts",
    findingIdentityColumns: ["zone_id"],
    alertLabelColumns: ["zone_name"],
  },
  {
    module: "security",
    kind: "waf",
    findingsTable: "waf_findings",
    alertsTable: "waf_alerts",
    findingIdentityColumns: ["zone_id"],
    alertLabelColumns: ["zone_name"],
  },
  {
    module: "security",
    kind: "rate_limiting",
    findingsTable: "rate_limiting_findings",
    alertsTable: "rate_limiting_alerts",
    findingIdentityColumns: ["zone_id"],
    alertLabelColumns: ["zone_name"],
  },
  // The 3 checks 0013_security_findings_add_bot_https_min_tls.sql (specs
  // 017) added after this registry's original 14 entries were written —
  // without these, evaluate runs for these checks still write real
  // findings/alerts (security/routes.ts), but they'd be invisible to
  // changes.ts/inbox.ts/summary.ts, silently excluded from the very
  // cross-module views Module 7 exists to provide.
  {
    module: "security",
    kind: "bot_fight_mode",
    findingsTable: "bot_fight_mode_findings",
    alertsTable: "bot_fight_mode_alerts",
    findingIdentityColumns: ["zone_id"],
    alertLabelColumns: ["zone_name"],
  },
  {
    module: "security",
    kind: "always_https",
    findingsTable: "always_https_findings",
    alertsTable: "always_https_alerts",
    findingIdentityColumns: ["zone_id"],
    alertLabelColumns: ["zone_name"],
  },
  {
    module: "security",
    kind: "min_tls",
    findingsTable: "min_tls_findings",
    alertsTable: "min_tls_alerts",
    findingIdentityColumns: ["zone_id"],
    alertLabelColumns: ["zone_name"],
  },
];

export function findAuditSource(module: string, kind: string): AuditSource | undefined {
  return AUDIT_SOURCES.find((s) => s.module === module && s.kind === kind);
}

// Shared across inbox.ts/changes.ts/summary.ts (FR-010 / spec.md Edge
// Cases bullet 2): a genuine D1 read failure for one of the seventeen
// sources must be reported distinctly from that source legitimately
// having zero rows, in the same shape from all three query functions so
// the API responses and AuditInventory.tsx don't each invent their own.
export interface UnavailableSource {
  module: string;
  kind: string;
  error: string;
}

export function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "unknown error";
}

// Builds a SQL expression joining the given columns into one readable
// label, e.g. ["zone_name", "record_name"] -> "zone_name || ' · ' || record_name".
// Columns always come from a source's own *Columns list in this
// module's registry above — never from request input.
export function labelSqlExpr(columns: string[]): string {
  if (columns.length === 1) return columns[0];
  return columns.join(" || ' · ' || ");
}
