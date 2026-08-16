export type HostnameKind = "custom_domain" | "workers_dev" | "preview_url";
export type ExposureStatus = "safe" | "warning" | "critical" | "not_evaluated";

export interface WorkerHostname {
  hostname: string;
  kind: HostnameKind;
  // Set by inventory.ts when it could not determine coverage-relevant facts
  // for this specific hostname (e.g. a per-script API call failed). When
  // set, evaluate.ts short-circuits straight to "not_evaluated" instead of
  // guessing (FR-011 — never silently present an unevaluated item as safe).
  evaluationError?: string;
}

export interface WorkerInventoryItem {
  workerName: string;
  hostnames: WorkerHostname[];
}

export interface AccessPolicySummary {
  decision: string;
  includesEveryone: boolean;
  hasScopedInclude: boolean;
}

export interface AccessApplicationSummary {
  id: string;
  domain: string;
  policies: AccessPolicySummary[];
}

export interface HostnameEvaluation {
  hostname: string;
  kind: HostnameKind;
  status: ExposureStatus;
  reason: string;
  // specs/023-worker-detail-page (research.md §2) — the Access application
  // ids findCoveringApps() already computed, structured instead of only
  // embedded in `reason`'s human-readable text. [] when nothing covers this
  // hostname (critical) or evaluation couldn't run (not_evaluated).
  coveringAppIds: string[];
}

export interface WorkerEvaluation {
  workerName: string;
  hostnames: HostnameEvaluation[];
}
