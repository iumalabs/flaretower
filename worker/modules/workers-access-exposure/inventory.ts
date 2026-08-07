// Cloudflare API client helpers. Plain fetch() against api.cloudflare.com
// (research.md §3) — read-only endpoints only, matching the constitution's
// least-privilege / read-first token scoping.
//
// Exact response field names below are pinned against Cloudflare's
// documented API shapes; final verification against a live account happens
// in T033 (quickstart.md end-to-end run), per research.md §3's own caveat.
import type { AccessApplicationSummary, WorkerHostname, WorkerInventoryItem } from "./types.ts";

export interface CloudflareCredentials {
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
  creds: CloudflareCredentials,
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

interface RawWorkerScript {
  id: string;
}

interface RawWorkerDomain {
  hostname: string;
  service: string;
}

interface RawSubdomainSettings {
  enabled: boolean;
  previews_enabled?: boolean;
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

export async function listWorkerScripts(
  creds: CloudflareCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const scripts = await cfFetch<RawWorkerScript[]>(
    `/accounts/${creds.accountId}/workers/scripts`,
    creds,
    fetchImpl,
  );
  return scripts.map((s) => s.id);
}

export async function listWorkerCustomDomains(
  creds: CloudflareCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string[]>> {
  const domains = await cfFetch<RawWorkerDomain[]>(
    `/accounts/${creds.accountId}/workers/domains`,
    creds,
    fetchImpl,
  );
  const byWorker = new Map<string, string[]>();
  for (const d of domains) {
    const list = byWorker.get(d.service) ?? [];
    list.push(d.hostname);
    byWorker.set(d.service, list);
  }
  return byWorker;
}

// null means the account has no workers.dev subdomain configured at all —
// distinct from a script individually disabling it.
export async function getAccountWorkersDevSubdomain(
  creds: CloudflareCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const result = await cfFetch<{ subdomain: string }>(
      `/accounts/${creds.accountId}/workers/subdomain`,
      creds,
      fetchImpl,
    );
    return result.subdomain || null;
  } catch {
    return null;
  }
}

export async function getScriptSubdomainStatus(
  workerName: string,
  creds: CloudflareCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<RawSubdomainSettings> {
  return await cfFetch<RawSubdomainSettings>(
    `/accounts/${creds.accountId}/workers/scripts/${workerName}/subdomain`,
    creds,
    fetchImpl,
  );
}

function summarizePolicy(policy: RawAccessPolicy) {
  const include = policy.include ?? [];
  return {
    decision: policy.decision,
    includesEveryone: include.some((rule) => "everyone" in rule),
    hasScopedInclude: include.some((rule) => !("everyone" in rule)),
  };
}

// Returns null (rather than throwing) when the Access applications list
// itself could not be fetched — the caller (evaluate.ts, via
// evaluateInventory's `apps` parameter) treats null as "force
// not_evaluated everywhere," which is the correct FR-011 behavior for a
// failure this broad, rather than a per-hostname evaluationError.
export async function listAccessApplications(
  creds: CloudflareCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<AccessApplicationSummary[] | null> {
  try {
    const apps = await cfFetch<RawAccessApp[]>(
      `/accounts/${creds.accountId}/access/apps`,
      creds,
      fetchImpl,
    );
    return apps.map((app) => ({
      id: app.id,
      domain: app.domain,
      policies: (app.policies ?? []).map(summarizePolicy),
    }));
  } catch {
    return null;
  }
}

export async function buildWorkerInventory(
  creds: CloudflareCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<WorkerInventoryItem[]> {
  const [scriptNames, domainsByWorker, accountSubdomain] = await Promise.all([
    listWorkerScripts(creds, fetchImpl),
    listWorkerCustomDomains(creds, fetchImpl),
    getAccountWorkersDevSubdomain(creds, fetchImpl),
  ]);

  const subdomainStatuses = await Promise.all(
    scriptNames.map(async (name) => {
      if (!accountSubdomain) return { name, status: null, error: null as string | null };
      try {
        const status = await getScriptSubdomainStatus(name, creds, fetchImpl);
        return { name, status, error: null as string | null };
      } catch (err) {
        return {
          name,
          status: null,
          error: err instanceof Error
            ? err.message
            : "unknown error checking workers.dev/preview status",
        };
      }
    }),
  );
  const statusByWorker = new Map(subdomainStatuses.map((s) => [s.name, s]));

  return scriptNames.map((name): WorkerInventoryItem => {
    const hostnames: WorkerHostname[] = [];

    for (const hostname of domainsByWorker.get(name) ?? []) {
      hostnames.push({ hostname, kind: "custom_domain" });
    }

    if (accountSubdomain) {
      const entry = statusByWorker.get(name);
      if (entry?.error) {
        hostnames.push({
          hostname: `${name}.${accountSubdomain}.workers.dev`,
          kind: "workers_dev",
          evaluationError: entry.error,
        });
      } else if (entry?.status?.enabled) {
        hostnames.push({
          hostname: `${name}.${accountSubdomain}.workers.dev`,
          kind: "workers_dev",
        });
        if (entry.status.previews_enabled) {
          // Preview URLs are per-version, not one stable hostname — reported
          // against the workers.dev-style pattern since no single version
          // is canonically "the" preview (see research.md §6, quickstart.md).
          hostnames.push({
            hostname: `<version>-${name}.${accountSubdomain}.workers.dev`,
            kind: "preview_url",
          });
        }
      }
    }

    return { workerName: name, hostnames };
  });
}
