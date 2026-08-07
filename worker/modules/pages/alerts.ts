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
