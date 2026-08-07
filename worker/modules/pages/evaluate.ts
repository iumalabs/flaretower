// Pure evaluation logic. No network or D1 access here (constitution
// Principle III) so the fetch and scheduled entry points share this
// identically.
import type {
  CustomDomain,
  DeploymentEvaluation,
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

// US2 replaces this stub with the real pages.dev hostname-coverage and
// policy-openness check (research.md §2).
export function evaluateSubdomainExposure(
  project: PagesProjectInventoryItem,
): SubdomainEvaluation {
  return {
    projectName: project.projectName,
    subdomain: project.subdomain,
    status: "not_evaluated",
    reason: "pages.dev exposure evaluation not yet implemented",
  };
}

// US3 replaces this stub with the real deployment-health check.
export function evaluateDeployment(
  projectName: string,
  _deployment: ProductionDeployment | null,
): DeploymentEvaluation {
  return {
    projectName,
    deploymentId: null,
    status: "not_evaluated",
    reason: "deployment health evaluation not yet implemented",
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
): SubdomainEvaluation[] {
  return inventory.map((project) => evaluateSubdomainExposure(project));
}

export function evaluateDeployments(
  inventory: PagesProjectInventoryItem[],
): DeploymentEvaluation[] {
  return inventory.map((project) =>
    evaluateDeployment(project.projectName, project.latestProductionDeployment)
  );
}
