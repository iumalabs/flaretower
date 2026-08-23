// Cloudflare API client helpers. Plain fetch() against api.cloudflare.com
// (research.md §3) — read-only endpoints only, matching the constitution's
// least-privilege / read-first token scoping.
//
// Exact response field names below are pinned against Cloudflare's
// documented API shapes; final verification against a live account happens
// in T033 (quickstart.md end-to-end run), per research.md §3's own caveat.
import { mapWithConcurrency, withGlobalFetchSlot } from "../../concurrency.ts";
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
  // Gated by the invocation-wide semaphore (worker/concurrency.ts) — every
  // module's cfFetch() goes through it, so the true total in-flight
  // connection count across all of them together never exceeds the
  // Workers runtime's 6-per-invocation limit, not just this one module's
  // own fan-out.
  const res = await withGlobalFetchSlot(() =>
    fetchImpl(`${CF_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${creds.apiToken}` },
    })
  );

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
  name?: string;
  // issue #464 — Cloudflare omits `domain` for some Access application
  // types (e.g. bookmark apps), so this can genuinely be absent on a real
  // account despite the API docs implying it's always present.
  domain?: string;
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

export interface AccountSubdomainResult {
  // Confirmed absent (e.g. the account has never enabled workers.dev) —
  // distinct from `error`, which means we don't actually know.
  subdomain: string | null;
  // Set when the check itself failed (network error, 5xx, rate limit) —
  // callers must not treat this the same as a confirmed-absent subdomain
  // (FR-011: a failed check must surface as not_evaluated, never as a
  // silent "workers.dev is off" that omits every Worker's hostname).
  error: string | null;
}

export async function getAccountWorkersDevSubdomain(
  creds: CloudflareCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<AccountSubdomainResult> {
  try {
    const result = await cfFetch<{ subdomain: string }>(
      `/accounts/${creds.accountId}/workers/subdomain`,
      creds,
      fetchImpl,
    );
    return { subdomain: result.subdomain || null, error: null };
  } catch (err) {
    if (err instanceof CloudflareAPIError && err.status === 404) {
      // Never configured — a legitimate, confirmed answer, not a failure.
      return { subdomain: null, error: null };
    }
    return {
      subdomain: null,
      error: err instanceof Error
        ? err.message
        : "unknown error checking account workers.dev subdomain",
    };
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

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "unknown error";
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
    return apps.map((app) => {
      // issue #464 — an app with no domain can't cover any hostname; a
      // sentinel string (never matching a real hostname) keeps every
      // downstream consumer's `domain: string` assumption intact instead
      // of threading `| undefined` through the whole module.
      const domain = app.domain ?? "(no domain)";
      return {
        id: app.id,
        // issue #466 — falls back to the (already sentinel-safe) domain
        // when Cloudflare's API doesn't return a name for a given app —
        // never a raw UUID shown to the operator as if it were a name.
        name: app.name && app.name.length > 0 ? app.name : domain,
        domain,
        policies: (app.policies ?? []).map(summarizePolicy),
      };
    });
  } catch {
    return null;
  }
}

export async function buildWorkerInventory(
  creds: CloudflareCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<WorkerInventoryItem[]> {
  // Each top-level list call is caught independently (mirroring
  // pages/inventory.ts's buildPagesInventory and security/inventory.ts's
  // buildSecurityInventory) rather than left to Promise.all's
  // reject-on-first-failure behavior — a failure here must degrade to a
  // not_evaluated sentinel, not propagate uncaught through runEvaluation()
  // and abort the whole run with zero exposure_findings rows written
  // (FR-011).
  const [scriptsResult, domainsResult, accountSubdomainResult] = await Promise.all([
    listWorkerScripts(creds, fetchImpl).catch((err: unknown) => err as Error),
    listWorkerCustomDomains(creds, fetchImpl).catch((err: unknown) => err as Error),
    getAccountWorkersDevSubdomain(creds, fetchImpl),
  ]);

  if (scriptsResult instanceof Error) {
    // No script names at all means nothing to enumerate — same sentinel
    // shape Module 2/3 use for a total projects/zones-list failure: one
    // placeholder item whose sole hostname carries evaluationError, so
    // evaluateHostname() (evaluate.ts) resolves it to not_evaluated
    // instead of the run throwing and writing no findings at all.
    return [{
      workerName: "(unavailable)",
      hostnames: [{
        hostname: "(unavailable)",
        kind: "custom_domain",
        evaluationError: `could not list Worker scripts: ${errorMessage(scriptsResult)}`,
      }],
    }];
  }
  const scriptNames = scriptsResult;

  // A failed custom-domains list must not read as "no worker has a custom
  // domain" (a silent false-safe) — every script gets a not_evaluated
  // custom_domain placeholder instead, same principle as the existing
  // accountSubdomainError handling below for workers.dev hostnames.
  const domainsError = domainsResult instanceof Error ? errorMessage(domainsResult) : null;
  const domainsByWorker = domainsResult instanceof Error
    ? new Map<string, string[]>()
    : domainsResult;

  const { subdomain: accountSubdomain, error: accountSubdomainError } = accountSubdomainResult;

  // One fetch per script — capped at 5 concurrent (worker/concurrency.ts),
  // since an account's worker count trivially exceeds the Workers runtime's
  // 6-concurrent-connection limit otherwise (confirmed live, issue #292).
  const subdomainStatuses = await mapWithConcurrency(
    scriptNames,
    5,
    async (name) => {
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
    },
  );
  const statusByWorker = new Map(subdomainStatuses.map((s) => [s.name, s]));

  return scriptNames.map((name): WorkerInventoryItem => {
    const hostnames: WorkerHostname[] = [];

    if (domainsError) {
      hostnames.push({
        hostname: `(unknown custom domain for ${name})`,
        kind: "custom_domain",
        evaluationError: domainsError,
      });
    } else {
      for (const hostname of domainsByWorker.get(name) ?? []) {
        hostnames.push({ hostname, kind: "custom_domain" });
      }
    }

    if (accountSubdomainError) {
      // Could not even determine whether the account has workers.dev
      // enabled — must not be silently treated as "disabled" (that would
      // omit every Worker's workers.dev/preview hostname entirely).
      hostnames.push({
        hostname: `${name}.<unknown>.workers.dev`,
        kind: "workers_dev",
        evaluationError: accountSubdomainError,
      });
    } else if (accountSubdomain) {
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
      // else: workers.dev confirmed disabled for this script — correctly
      // "not reachable," no entry, not "reachable and unprotected" (spec
      // Edge Cases).
    }
    // else: account has no workers.dev subdomain at all (confirmed) — same
    // "not reachable" outcome, no entry, for every Worker.

    return { workerName: name, hostnames };
  });
}
