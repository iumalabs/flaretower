// Pure evaluation logic. No network or D1 access here (constitution
// Principle III) so the fetch and scheduled entry points share this
// identically.
import type {
  AccessApplication,
  AccessPolicy,
  CustomDomain,
  DeploymentEvaluation,
  DomainAccessEvaluation,
  DomainEvaluation,
  PagesProjectInventoryItem,
  ProductionDeployment,
  SubdomainEvaluation,
} from "./types.ts";

export function evaluateCustomDomain(
  projectName: string,
  domain: CustomDomain,
): DomainEvaluation {
  if (domain.evaluationError) {
    return {
      projectName,
      domainName: domain.domainName,
      status: "not_evaluated",
      reason: domain.evaluationError,
    };
  }

  if (domain.status === "active") {
    return {
      projectName,
      domainName: domain.domainName,
      status: "safe",
      reason: "domain is active",
    };
  }

  return {
    projectName,
    domainName: domain.domainName,
    status: "warning",
    reason: `domain is not active (status: ${domain.status})`,
  };
}

// Local re-implementation of Module 1/3's hostname-coverage and
// policy-openness decision logic (research.md §2 — duplication beats
// premature cross-module coupling), applied to each project's pages.dev
// subdomain instead of a Worker hostname or an account-wide app scope.

// Access app "domain" may include a path (e.g. "example.com/admin*") —
// only the host part determines coverage here.
function hostnameCoveredByAppDomain(hostname: string, appDomain: string): boolean {
  const host = hostname.toLowerCase();
  const domainHost = appDomain.toLowerCase().split("/")[0];

  if (domainHost.startsWith("*.")) {
    const suffix = domainHost.slice(1); // ".example.com"
    return host.endsWith(suffix) && host !== suffix.slice(1);
  }
  return host === domainHost;
}

function findCoveringApps(hostname: string, apps: AccessApplication[]): AccessApplication[] {
  return apps.filter((app) => hostnameCoveredByAppDomain(hostname, app.appDomain));
}

// A policy that grants access ("allow" or "bypass") to Everyone is
// effectively open regardless of any other, more restrictive policy on
// the same application. A "deny" policy that happens to target Everyone
// is the opposite of open, so `includesEveryone` alone is not sufficient.
function isPolicyEffectivelyOpen(policy: AccessPolicy): boolean {
  if (policy.decision === "bypass") return true;
  return policy.decision === "allow" && policy.includesEveryone;
}

// An application with zero policies attached denies everyone by default
// in Cloudflare Access — not open in the security sense — but is still
// flagged warning per spec User Story 2, Acceptance Scenario 2: the
// absence of any explicit policy is itself worth surfacing, most likely
// an incomplete setup.
function isAppOpenOrUnconfigured(app: AccessApplication): boolean {
  if (app.policies.length === 0) return true;
  return app.policies.some(isPolicyEffectivelyOpen);
}

export function evaluateSubdomainExposure(
  project: PagesProjectInventoryItem,
  apps: AccessApplication[] | null,
): SubdomainEvaluation {
  // A project-level evaluationError means the project itself is a
  // sentinel entry (e.g. the whole projects list failed to fetch) — its
  // subdomain is a placeholder, not a real hostname to evaluate.
  // Pure pass-through (specs/015-pages-dashboard research.md §1) — not an
  // input to any branch below.
  const productionBranch = project.productionBranch ?? null;

  if (project.evaluationError) {
    return {
      projectName: project.projectName,
      subdomain: project.subdomain,
      status: "not_evaluated",
      reason: project.evaluationError,
      productionBranch,
    };
  }

  if (apps === null) {
    return {
      projectName: project.projectName,
      subdomain: project.subdomain,
      status: "not_evaluated",
      reason: "could not evaluate Access coverage (Access applications API error)",
      productionBranch,
    };
  }

  const covering = findCoveringApps(project.subdomain, apps);

  if (covering.length === 0) {
    return {
      projectName: project.projectName,
      subdomain: project.subdomain,
      status: "critical",
      reason: "no Access application covers this hostname",
      productionBranch,
    };
  }

  const openApps = covering.filter(isAppOpenOrUnconfigured);
  if (openApps.length > 0) {
    const reasons = openApps.map((a) =>
      a.policies.length === 0
        ? `${a.appName} has no policies attached`
        : `${a.appName} has a policy that allows Everyone`
    );
    return {
      projectName: project.projectName,
      subdomain: project.subdomain,
      status: "warning",
      reason: `covering Access application(s) do not meaningfully restrict access: ${
        reasons.join("; ")
      }`,
      productionBranch,
    };
  }

  return {
    projectName: project.projectName,
    subdomain: project.subdomain,
    status: "safe",
    reason: `covered by Access application(s): ${covering.map((a) => a.appName).join(", ")}`,
    productionBranch,
  };
}

// issue #457 — Access-policy coverage of a production custom domain,
// reusing the same coverage/openness helpers as evaluateSubdomainExposure
// above but deliberately never "critical" (see DomainAccessEvaluation's
// own doc comment for why): a production domain being publicly reachable
// isn't inherently a gap the way an unprotected pages.dev subdomain is.
export function evaluateDomainAccess(
  projectName: string,
  domain: CustomDomain,
  apps: AccessApplication[] | null,
): DomainAccessEvaluation {
  if (domain.evaluationError) {
    return {
      projectName,
      domainName: domain.domainName,
      status: "not_evaluated",
      reason: domain.evaluationError,
      coveringAppId: null,
      coveringAppName: null,
    };
  }

  if (apps === null) {
    return {
      projectName,
      domainName: domain.domainName,
      status: "not_evaluated",
      reason: "could not evaluate Access coverage (Access applications API error)",
      coveringAppId: null,
      coveringAppName: null,
    };
  }

  const covering = findCoveringApps(domain.domainName, apps);

  if (covering.length === 0) {
    return {
      projectName,
      domainName: domain.domainName,
      status: "not_evaluated",
      reason: "no Access application covers this domain",
      coveringAppId: null,
      coveringAppName: null,
    };
  }

  const openApps = covering.filter(isAppOpenOrUnconfigured);
  if (openApps.length > 0) {
    const reasons = openApps.map((a) =>
      a.policies.length === 0
        ? `${a.appName} has no policies attached`
        : `${a.appName} has a policy that allows Everyone`
    );
    return {
      projectName,
      domainName: domain.domainName,
      status: "warning",
      reason: `covering Access application(s) do not meaningfully restrict access: ${
        reasons.join("; ")
      }`,
      coveringAppId: null,
      coveringAppName: null,
    };
  }

  return {
    projectName,
    domainName: domain.domainName,
    status: "safe",
    reason: `covered by Access application(s): ${covering.map((a) => a.appName).join(", ")}`,
    coveringAppId: covering[0].appId,
    coveringAppName: covering[0].appName,
  };
}

export function evaluateDeployment(
  projectName: string,
  deployment: ProductionDeployment | null,
): DeploymentEvaluation {
  if (deployment === null) {
    return {
      projectName,
      deploymentId: null,
      status: "warning",
      reason: "no production deployment exists yet",
      createdAt: null,
    };
  }

  const createdAt = deployment.createdOn ?? null;

  if (deployment.evaluationError) {
    return {
      projectName,
      deploymentId: deployment.deploymentId,
      status: "not_evaluated",
      reason: deployment.evaluationError,
      createdAt,
    };
  }

  if (deployment.status === "success") {
    return {
      projectName,
      deploymentId: deployment.deploymentId,
      status: "safe",
      reason: "latest production deployment succeeded",
      createdAt,
    };
  }

  return {
    projectName,
    deploymentId: deployment.deploymentId,
    status: "warning",
    reason: `latest production deployment did not succeed (status: ${deployment.status})`,
    createdAt,
  };
}

export function evaluateCustomDomains(
  inventory: PagesProjectInventoryItem[],
): DomainEvaluation[] {
  return inventory.flatMap((project) =>
    project.customDomains.map((domain) => evaluateCustomDomain(project.projectName, domain))
  );
}

export function evaluateSubdomainExposures(
  inventory: PagesProjectInventoryItem[],
  apps: AccessApplication[] | null,
): SubdomainEvaluation[] {
  return inventory.map((project) => evaluateSubdomainExposure(project, apps));
}

export function evaluateDomainAccesses(
  inventory: PagesProjectInventoryItem[],
  apps: AccessApplication[] | null,
): DomainAccessEvaluation[] {
  return inventory.flatMap((project) =>
    project.customDomains.map((domain) => evaluateDomainAccess(project.projectName, domain, apps))
  );
}

export function evaluateDeployments(
  inventory: PagesProjectInventoryItem[],
): DeploymentEvaluation[] {
  return inventory.map((project) => {
    // Same sentinel-entry guard as evaluateSubdomainExposure: a
    // project-level evaluationError means there's no real project here to
    // check deployment health for.
    if (project.evaluationError) {
      return {
        projectName: project.projectName,
        deploymentId: null,
        status: "not_evaluated",
        reason: project.evaluationError,
        createdAt: null,
      };
    }
    return evaluateDeployment(project.projectName, project.latestProductionDeployment);
  });
}
