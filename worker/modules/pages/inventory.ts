// Cloudflare API client helpers. Plain fetch(), read-only — mirrors every
// prior module's inventory.ts shape. Exact response field names verified
// against Cloudflare's documented API shapes (research.md §1); final
// verification against a live account happens in T024 (quickstart.md).
import { mapWithConcurrency } from "../../concurrency.ts";
import type {
  AccessApplication,
  AccessPolicy,
  CustomDomain,
  PagesProjectInventoryItem,
  ProductionDeployment,
} from "./types.ts";

export interface CloudflarePagesCredentials {
  accountId: string;
  apiToken: string;
}

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareAPIError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CloudflareAPIError";
  }
}

interface CloudflareAPIResponse<T> {
  success: boolean;
  result: T;
  errors: Array<{ code: number; message: string }>;
}

async function cfFetch<T>(
  path: string,
  creds: CloudflarePagesCredentials,
  fetchImpl: typeof fetch,
): Promise<T> {
  const res = await fetchImpl(`${CF_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${creds.apiToken}` },
  });

  // Read the {success, errors} envelope before deciding whether to throw —
  // Cloudflare includes it even on 4xx/5xx, and discarding it down to a
  // bare status code hides the real reason (found live in another module,
  // 2026-08-11: a 400 with no detail turned out to be a malformed request,
  // not a permission problem).
  let body: CloudflareAPIResponse<T> | undefined;
  try {
    body = await res.json() as CloudflareAPIResponse<T>;
  } catch {
    // Non-JSON error body (rare) — fall through to the generic HTTP-status
    // error below, which still carries the real status code.
  }

  if (!res.ok || !body || !body.success) {
    const detail = body?.errors?.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new CloudflareAPIError(
      `Cloudflare API ${path} returned HTTP ${res.status}${detail ? ` (${detail})` : ""}`,
      res.status,
    );
  }
  return body.result;
}

interface RawPagesProject {
  name: string;
  subdomain: string;
  production_branch?: string;
}

interface RawCustomDomain {
  name: string;
  status: string;
}

interface RawAccessPolicy {
  decision: string;
  include?: Array<Record<string, unknown>>;
}

interface RawAccessApp {
  id: string;
  domain: string;
  policies?: RawAccessPolicy[];
}

interface RawDeployment {
  id: string;
  latest_stage: { status: string };
  created_on?: string;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "unknown error";
}

function summarizePolicy(policy: RawAccessPolicy): AccessPolicy {
  const include = policy.include ?? [];
  return {
    decision: policy.decision,
    includesEveryone: include.some((rule) => "everyone" in rule),
    hasScopedInclude: include.some((rule) => !("everyone" in rule)),
  };
}

// Independent fetch of the same account-wide Access applications endpoint
// Modules 1 and 3 already call (research.md §2) — this module fetches its
// own copy rather than sharing another module's fetch, keeping every
// module's scheduled evaluation independently failable (Principle III).
export async function listAccessApplications(
  creds: CloudflarePagesCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<AccessApplication[]> {
  const apps = await cfFetch<RawAccessApp[]>(
    `/accounts/${creds.accountId}/access/apps`,
    creds,
    fetchImpl,
  );
  return apps.map((app) => ({
    appId: app.id,
    appDomain: app.domain,
    policies: (app.policies ?? []).map(summarizePolicy),
  }));
}

export async function listPagesProjects(
  creds: CloudflarePagesCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<RawPagesProject[]> {
  return await cfFetch<RawPagesProject[]>(
    `/accounts/${creds.accountId}/pages/projects`,
    creds,
    fetchImpl,
  );
}

export async function listProjectDomains(
  creds: CloudflarePagesCredentials,
  projectName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CustomDomain[]> {
  const domains = await cfFetch<RawCustomDomain[]>(
    `/accounts/${creds.accountId}/pages/projects/${projectName}/domains`,
    creds,
    fetchImpl,
  );
  return domains.map((d) => ({ domainName: d.name, status: d.status }));
}

// The deployments list is server-side filtered to env=production and
// ordered newest-first (research.md §1); index 0, if present, is "the
// most recent production deployment". An empty list means no production
// deployment exists yet — a legitimate state, not an error.
export async function listProjectProductionDeployment(
  creds: CloudflarePagesCredentials,
  projectName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProductionDeployment | null> {
  const deployments = await cfFetch<RawDeployment[]>(
    `/accounts/${creds.accountId}/pages/projects/${projectName}/deployments?env=production`,
    creds,
    fetchImpl,
  );
  if (deployments.length === 0) return null;
  const latest = deployments[0];
  return {
    deploymentId: latest.id,
    status: latest.latest_stage.status,
    createdOn: latest.created_on,
  };
}

// A total failure to list projects at all surfaces as one sentinel entry
// with evaluationError set (the same resilient design Module 3's
// buildZeroTrustInventory established), so the UI shows "could not
// evaluate" rather than an empty list that would read as "confirmed
// zero" (FR-013). A per-project failure to list that project's domains
// is scoped to that project's customDomains array as a sentinel entry,
// since the project itself is already confirmed to exist.
async function fetchProjectsWithDomains(
  creds: CloudflarePagesCredentials,
  fetchImpl: typeof fetch,
): Promise<PagesProjectInventoryItem[]> {
  let rawProjects: RawPagesProject[];
  try {
    rawProjects = await listPagesProjects(creds, fetchImpl);
  } catch (err) {
    return [{
      projectName: "(unavailable)",
      subdomain: "(unavailable)",
      customDomains: [],
      latestProductionDeployment: null,
      evaluationError: `could not list Pages projects: ${errorMessage(err)}`,
    }];
  }

  // Each project already fires 2 concurrent fetches internally (domains +
  // deployment) — capped at 2 concurrent projects (worker/concurrency.ts)
  // keeps this module's own peak at 4 in-flight requests, under the
  // 6-connection Workers limit (confirmed live, issue #292).
  return await mapWithConcurrency(rawProjects, 2, async (project) => {
    const [domainsResult, deploymentResult] = await Promise.allSettled([
      listProjectDomains(creds, project.name, fetchImpl),
      listProjectProductionDeployment(creds, project.name, fetchImpl),
    ]);

    const customDomains: CustomDomain[] = domainsResult.status === "fulfilled"
      ? domainsResult.value
      : [{
        domainName: "(unavailable)",
        status: "(unavailable)",
        evaluationError: `could not list custom domains: ${errorMessage(domainsResult.reason)}`,
      }];

    const latestProductionDeployment: ProductionDeployment | null =
      deploymentResult.status === "fulfilled" ? deploymentResult.value : {
        deploymentId: "(unavailable)",
        status: "(unavailable)",
        evaluationError: `could not list deployments: ${errorMessage(deploymentResult.reason)}`,
      };

    return {
      projectName: project.name,
      subdomain: project.subdomain,
      productionBranch: project.production_branch,
      customDomains,
      latestProductionDeployment,
    };
  });
}

export interface PagesInventory {
  projects: PagesProjectInventoryItem[];
  // null = the Access applications list itself could not be fetched at
  // all (e.g. insufficient token scope, API error) — every project's
  // pages.dev exposure check must come back not_evaluated in that case,
  // never silently critical or safe (mirrors Module 1's evaluateHostname
  // convention for the same `apps === null` case).
  accessApplications: AccessApplication[] | null;
}

// Projects (+ their domains) and Access applications are fetched
// independently, so a failure in one doesn't block the other.
// fetchProjectsWithDomains never rejects (it already turns a total
// projects-list failure into a sentinel entry above); only the Access
// applications fetch can still reject here.
export async function buildPagesInventory(
  creds: CloudflarePagesCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<PagesInventory> {
  const [projects, accessApplications] = await Promise.all([
    fetchProjectsWithDomains(creds, fetchImpl),
    listAccessApplications(creds, fetchImpl).catch(() => null),
  ]);

  return { projects, accessApplications };
}
