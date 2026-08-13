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
