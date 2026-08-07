// Pure hostname -> safe/warning/critical/not_evaluated evaluation. No
// network or D1 access here (constitution Principle III) so the fetch and
// scheduled entry points share this identically.
import type {
  AccessApplicationSummary,
  HostnameEvaluation,
  WorkerEvaluation,
  WorkerHostname,
  WorkerInventoryItem,
} from "./types.ts";

// Access app "domain" may include a path (e.g. "example.com/admin*") — only
// the host part determines coverage here; a path-scoped Access app still
// means the hostname isn't wide open, which is what this check answers.
export function hostnameCoveredByAppDomain(hostname: string, appDomain: string): boolean {
  const host = hostname.toLowerCase();
  const domainHost = appDomain.toLowerCase().split("/")[0];

  if (domainHost.startsWith("*.")) {
    const suffix = domainHost.slice(1); // ".example.com"
    return host.endsWith(suffix) && host !== suffix.slice(1);
  }
  return host === domainHost;
}

function findCoveringApps(
  hostname: string,
  apps: AccessApplicationSummary[],
): AccessApplicationSummary[] {
  return apps.filter((app) => hostnameCoveredByAppDomain(hostname, app.domain));
}

// `apps === null` means the Access applications list itself could not be
// fetched (e.g. insufficient token scope, API error) — every hostname must
// come back not_evaluated in that case, never silently critical or safe,
// since we have no basis to claim either (FR-011).
export function evaluateHostname(
  hostname: WorkerHostname,
  apps: AccessApplicationSummary[] | null,
): HostnameEvaluation {
  if (hostname.evaluationError) {
    return {
      hostname: hostname.hostname,
      kind: hostname.kind,
      status: "not_evaluated",
      reason: hostname.evaluationError,
    };
  }

  if (apps === null) {
    return {
      hostname: hostname.hostname,
      kind: hostname.kind,
      status: "not_evaluated",
      reason: "could not evaluate Access coverage (Access applications API error)",
    };
  }

  const covering = findCoveringApps(hostname.hostname, apps);

  if (covering.length === 0) {
    return {
      hostname: hostname.hostname,
      kind: hostname.kind,
      status: "critical",
      reason: "no Access application covers this hostname",
    };
  }

  // Policy-openness evaluation (warning vs. safe) lands in T025 (US3) —
  // until then, any covered hostname is provisionally safe.
  return {
    hostname: hostname.hostname,
    kind: hostname.kind,
    status: "safe",
    reason: `covered by Access application(s): ${covering.map((a) => a.id).join(", ")}`,
  };
}

export function evaluateWorker(
  worker: WorkerInventoryItem,
  apps: AccessApplicationSummary[] | null,
): WorkerEvaluation {
  return {
    workerName: worker.workerName,
    // Each hostname is evaluated independently — a covered custom domain
    // and an uncovered workers.dev URL on the same Worker must not share
    // or influence each other's status (spec User Story 2, edge cases).
    hostnames: worker.hostnames.map((h) => evaluateHostname(h, apps)),
  };
}

export function evaluateInventory(
  inventory: WorkerInventoryItem[],
  apps: AccessApplicationSummary[] | null,
): WorkerEvaluation[] {
  return inventory.map((worker) => evaluateWorker(worker, apps));
}
