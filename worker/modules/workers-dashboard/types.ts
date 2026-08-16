export type WorkersDashboardEnvironment = "production" | "preview";
export type ExposureStatus = "safe" | "warning" | "critical" | "not_evaluated";

export interface WorkerDashboardRow {
  workerName: string;
  environment: WorkersDashboardEnvironment;
  routeCount: number;
  lastDeployAt: string | null;
  requests24h: number | null;
  errors24h: number | null;
  cpuP50Ms: number | null;
  exposureStatus: ExposureStatus;
}

export interface AccountSummary {
  deployedCount: number;
  deployedByEnvironment: { production: number; preview: number };
  requests24hTotal: number | null;
  requests24hChangePct: number | null;
  errorRatePct: number | null;
  errors24hTotal: number | null;
  cpuP99Ms: number | null;
}

export interface RecentChangeEntry {
  occurredAt: string;
  actor: string;
  actorSource: string;
  action: string;
  target: string;
  resultSummary: string | null;
}

export type UnavailableSourceName = "analytics" | "audit_log" | "exposure" | "last_deploy";

export interface UnavailableSource {
  source: UnavailableSourceName;
  error: string;
}

export interface WorkersDashboard {
  generatedAt: string;
  summary: AccountSummary;
  workers: WorkerDashboardRow[];
  recentChanges: RecentChangeEntry[];
  unavailable: UnavailableSource[];
}

// specs/023-worker-detail-page
export interface WorkerRoutePolicy {
  appId: string;
  appName: string | null;
  appDomain: string;
  // zero-trust's own PolicyRuleLine[][] shape (one array per policy, in
  // evaluation order) — reused verbatim, not re-humanized (research.md §2).
  policyRules: { verb: "ALLOW" | "REQUIRE" | "DENY"; label: string }[][];
}

export interface WorkerRouteEntry {
  hostname: string;
  kind: string;
  status: ExposureStatus;
  reason: string;
  // null when no Access application covers this route (contracts/api.md) —
  // distinct from a covering-but-permissive app, which still has a policy.
  policy: WorkerRoutePolicy | null;
}

export type WorkerDetailUnavailableSourceName = "policy" | "recent_changes";

export interface WorkerDetailUnavailableSource {
  source: WorkerDetailUnavailableSourceName;
  error: string;
}

export interface WorkerDetail {
  workerName: string;
  environment: WorkersDashboardEnvironment;
  routes: WorkerRouteEntry[];
  recentChanges: RecentChangeEntry[];
  cloudflareUrl: string;
  unavailable: WorkerDetailUnavailableSource[];
}
