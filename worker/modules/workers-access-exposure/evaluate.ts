// Pure hostname -> safe/warning/critical/not_evaluated evaluation. No
// network or D1 access here (constitution Principle III) so the fetch and
// scheduled entry points share this identically.
import type {
  AccessApplicationSummary,
  AccessPolicySummary,
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

// A policy that grants access ("allow" or "bypass") to Everyone/anyone is
// effectively open regardless of any other, more restrictive policy on the
// same application — Access stops evaluating once a request matches an
// Allow or Block policy, so one open Allow policy is enough to let anyone
// in (see Cloudflare Access policy order-of-execution docs). A "deny"
// policy that happens to target Everyone is the opposite of open, so
// `includesEveryone` alone is not sufficient — decision matters too.
function isPolicyEffectivelyOpen(policy: AccessPolicySummary): boolean {
  if (policy.decision === "bypass") return true; // skips identity entirely
  return policy.decision === "allow" && policy.includesEveryone;
}

// An application with zero policies attached denies everyone by default in
// Cloudflare Access — not open in the security sense. It is still flagged
// as warning per spec User Story 3 (Acceptance Scenario 3): the absence of
// any explicit policy is itself worth surfacing to the operator rather than
// silently treated as safe, since it's most likely an incomplete setup.
function isAppOpenOrUnconfigured(app: AccessApplicationSummary): boolean {
  if (app.policies.length === 0) return true;
  return app.policies.some(isPolicyEffectivelyOpen);
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

  const openApps = covering.filter(isAppOpenOrUnconfigured);
  if (openApps.length > 0) {
    const reasons = openApps.map((a) =>
      a.policies.length === 0
        ? `${a.id} has no policies attached`
        : `${a.id} has a policy that allows Everyone`
    );
    return {
      hostname: hostname.hostname,
      kind: hostname.kind,
      status: "warning",
      reason: `covering Access application(s) do not meaningfully restrict access: ${
        reasons.join("; ")
      }`,
    };
  }

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
