// Cloudflare API client helpers. Plain fetch(), read-only — mirrors every
// prior module's inventory.ts shape. Exact response field names verified
// against Cloudflare's documented API shapes (research.md §1); final
// verification against a live account happens in T024 (quickstart.md).
import type {
  AccessApplication,
  AccessPolicy,
  CustomDomain,
  PagesProjectInventoryItem,
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

  if (!res.ok) {
    throw new CloudflareAPIError(`Cloudflare API ${path} returned HTTP ${res.status}`, res.status);
  }

  const body = await res.json() as CloudflareAPIResponse<T>;
  if (!body.success) {
    const detail = body.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new CloudflareAPIError(`Cloudflare API ${path} reported failure (${detail})`, res.status);
  }
  return body.result;
}

interface RawPagesProject {
  name: string;
  subdomain: string;
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

  return await Promise.all(rawProjects.map(async (project) => {
    let customDomains: CustomDomain[];
    try {
      customDomains = await listProjectDomains(creds, project.name, fetchImpl);
    } catch (err) {
      customDomains = [{
        domainName: "(unavailable)",
        status: "(unavailable)",
        evaluationError: `could not list custom domains: ${errorMessage(err)}`,
      }];
    }

    return {
      projectName: project.name,
      subdomain: project.subdomain,
      customDomains,
      latestProductionDeployment: null,
    };
  }));
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
