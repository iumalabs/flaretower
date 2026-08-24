// New-vs-repeat diffing for the Pages scheduled drift audit. Pure logic —
// no D1 access here (constitution Principle III). Three separate diff
// functions, mirroring the three independent finding/alert table pairs
// (data-model.md §3 — custom domains have a distinct identity from
// projects, and the two project-keyed checks are kept separate so each
// alerts independently).
import type {
  DeploymentEvaluation,
  DeploymentStatus,
  DomainEvaluation,
  DomainStatus,
  SubdomainEvaluation,
  SubdomainStatus,
} from "./types.ts";

export interface DomainAlertToRecord {
  projectName: string;
  domainName: string;
  previousStatus: DomainStatus | null;
  newStatus: "warning";
}

export interface SubdomainAlertToRecord {
  projectName: string;
  subdomain: string;
  previousStatus: SubdomainStatus | null;
  newStatus: "warning" | "critical";
}

export interface DeploymentAlertToRecord {
  projectName: string;
  deploymentId: string | null;
  previousStatus: DeploymentStatus | null;
  newStatus: "warning";
}

// Custom domain names aren't unique account-wide, so the previous-status
// map is keyed by project+domain, not domain alone.
export function domainKey(projectName: string, domainName: string): string {
  return `${projectName}::${domainName}`;
}

// FR-010/FR-011 + the spec's "no grace period on first run" edge case —
// same semantics as every prior module's diff function.
export function diffForDomainAlerts(
  results: DomainEvaluation[],
  previousStatuses: ReadonlyMap<string, DomainStatus>,
): DomainAlertToRecord[] {
  const alerts: DomainAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning") continue;
    const previous = previousStatuses.get(domainKey(r.projectName, r.domainName)) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      projectName: r.projectName,
      domainName: r.domainName,
      previousStatus: previous,
      newStatus: "warning",
    });
  }
  return alerts;
}

export function diffForSubdomainAlerts(
  results: SubdomainEvaluation[],
  previousStatuses: ReadonlyMap<string, SubdomainStatus>,
): SubdomainAlertToRecord[] {
  const alerts: SubdomainAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning" && r.status !== "critical") continue;
    const previous = previousStatuses.get(r.projectName) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      projectName: r.projectName,
      subdomain: r.subdomain,
      previousStatus: previous,
      newStatus: r.status,
    });
  }
  return alerts;
}

export function diffForDeploymentAlerts(
  results: DeploymentEvaluation[],
  previousStatuses: ReadonlyMap<string, DeploymentStatus>,
): DeploymentAlertToRecord[] {
  const alerts: DeploymentAlertToRecord[] = [];
  for (const r of results) {
    if (r.status !== "warning") continue;
    const previous = previousStatuses.get(r.projectName) ?? null;
    if (previous === r.status) continue;
    alerts.push({
      projectName: r.projectName,
      deploymentId: r.deploymentId,
      previousStatus: previous,
      newStatus: "warning",
    });
  }
  return alerts;
}

// issue #481 — the auto-resolve counterpart to every diffFor*Alerts above:
// an open (unacknowledged, unresolved) alert whose entity is back to
// "safe" in the run that just completed no longer belongs in the Unified
// Alerts Inbox/Overview. Deliberately checks `=== "safe"`, not `!==
// "warning"` (or `!== "critical"`) — an entity missing from `results`
// entirely, or evaluated as "not_evaluated" (a transient per-check API
// failure), must NOT auto-resolve: that would silently hide a still-open
// alert behind a data gap rather than a genuine fix (mirrors this
// codebase's established "never fabricate a clean state" rule — e.g.
// summary.ts's `hasData`). Pure — no D1 access (constitution Principle
// III); routes.ts reads the open alerts, calls this, and writes the
// resulting ids' resolved_at.
export interface DomainOpenAlert {
  id: string;
  projectName: string;
  domainName: string;
}

export interface OpenAlert {
  id: string;
  projectName: string;
}

export function resolveForDomainAlerts(
  results: DomainEvaluation[],
  openAlerts: readonly DomainOpenAlert[],
): string[] {
  const safeKeys = new Set(
    results.filter((r) => r.status === "safe").map((r) => domainKey(r.projectName, r.domainName)),
  );
  return openAlerts
    .filter((a) => safeKeys.has(domainKey(a.projectName, a.domainName)))
    .map((a) => a.id);
}

export function resolveForSubdomainAlerts(
  results: SubdomainEvaluation[],
  openAlerts: readonly OpenAlert[],
): string[] {
  const safeProjects = new Set(
    results.filter((r) => r.status === "safe").map((r) => r.projectName),
  );
  return openAlerts.filter((a) => safeProjects.has(a.projectName)).map((a) => a.id);
}

export function resolveForDeploymentAlerts(
  results: DeploymentEvaluation[],
  openAlerts: readonly OpenAlert[],
): string[] {
  const safeProjects = new Set(
    results.filter((r) => r.status === "safe").map((r) => r.projectName),
  );
  return openAlerts.filter((a) => safeProjects.has(a.projectName)).map((a) => a.id);
}
