export type DomainStatus = "safe" | "warning" | "not_evaluated";
export type SubdomainStatus = "safe" | "warning" | "critical" | "not_evaluated";
export type DeploymentStatus = "safe" | "warning" | "not_evaluated";

// Local re-implementation of Module 1/3's Access application shape
// (research.md §2 — duplication beats premature cross-module coupling).
export interface AccessPolicy {
  decision: string;
  includesEveryone: boolean;
  hasScopedInclude: boolean;
}

export interface AccessApplication {
  appId: string;
  appDomain: string;
  policies: AccessPolicy[];
}

export interface CustomDomain {
  domainName: string;
  // Raw Cloudflare status: "initializing" | "pending" | "active" |
  // "deactivated" | "blocked" | "error".
  status: string;
  evaluationError?: string;
}

export interface ProductionDeployment {
  deploymentId: string;
  // Raw Cloudflare latest_stage.status: "success" | "idle" | "active" |
  // "failure" | "canceled".
  status: string;
  // ISO 8601, the deployment's own `created_on` (specs/015-pages-dashboard
  // research.md §1) — undefined when not available.
  createdOn?: string;
  evaluationError?: string;
}

export interface PagesProjectInventoryItem {
  projectName: string;
  subdomain: string; // "<project_name>.pages.dev"
  // Cloudflare's own project-level field (research.md §1) — undefined when
  // not returned (never a fabricated branch name).
  productionBranch?: string;
  customDomains: CustomDomain[];
  // null = confirmed no production deployment exists yet.
  latestProductionDeployment: ProductionDeployment | null;
  // Set when this specific project's domains/deployments couldn't be
  // listed, or as a sentinel entry when the projects list itself failed
  // entirely (inventory.ts's buildPagesInventory).
  evaluationError?: string;
}

export interface DomainEvaluation {
  projectName: string;
  domainName: string;
  status: DomainStatus;
  reason: string;
}

export interface SubdomainEvaluation {
  projectName: string;
  subdomain: string;
  status: SubdomainStatus;
  reason: string;
  // Pure pass-through (specs/015-pages-dashboard research.md §1) — not an
  // input to `status`/`reason` above.
  productionBranch: string | null;
}

export interface DeploymentEvaluation {
  projectName: string;
  deploymentId: string | null;
  status: DeploymentStatus;
  reason: string;
  createdAt: string | null;
}
