// Cloudflare API client helpers. Plain fetch(), read-only — mirrors every
// prior module's inventory.ts shape. Exact response field names pinned
// against Cloudflare's documented API shapes; final verification against
// a live account happens in T022 (quickstart.md).
import type { AccessApplication, AccessPolicy, ServiceToken } from "./types.ts";

export interface CloudflareZtCredentials {
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
  creds: CloudflareZtCredentials,
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

interface RawAccessPolicy {
  decision: string;
  include?: Array<Record<string, unknown>>;
}

interface RawAccessApp {
  id: string;
  domain: string;
  policies?: RawAccessPolicy[];
}

interface RawServiceToken {
  id: string;
  name: string;
  expires_at?: string;
}

function summarizePolicy(policy: RawAccessPolicy): AccessPolicy {
  const include = policy.include ?? [];
  return {
    decision: policy.decision,
    includesEveryone: include.some((rule) => "everyone" in rule),
    hasScopedInclude: include.some((rule) => !("everyone" in rule)),
  };
}

export async function listAccessApplications(
  creds: CloudflareZtCredentials,
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

export async function listServiceTokens(
  creds: CloudflareZtCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceToken[]> {
  const tokens = await cfFetch<RawServiceToken[]>(
    `/accounts/${creds.accountId}/access/service_tokens`,
    creds,
    fetchImpl,
  );
  return tokens.map((t) => ({
    tokenId: t.id,
    tokenName: t.name,
    expiresAt: t.expires_at ?? null,
  }));
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "unknown error";
}

export interface ZeroTrustInventory {
  applications: AccessApplication[];
  serviceTokens: ServiceToken[];
}

// A total failure to list applications (or service tokens) at all — not a
// per-item failure — surfaces as one sentinel entry with evaluationError
// set, so the UI shows "could not evaluate" rather than an empty list
// that would read as "confirmed zero" (FR-013).
export async function buildZeroTrustInventory(
  creds: CloudflareZtCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<ZeroTrustInventory> {
  const [appsResult, tokensResult] = await Promise.allSettled([
    listAccessApplications(creds, fetchImpl),
    listServiceTokens(creds, fetchImpl),
  ]);

  const applications: AccessApplication[] = appsResult.status === "fulfilled"
    ? appsResult.value
    : [{
      appId: "(unavailable)",
      appDomain: "(unavailable)",
      policies: [],
      evaluationError: `could not list Access applications: ${errorMessage(appsResult.reason)}`,
    }];

  const serviceTokens: ServiceToken[] = tokensResult.status === "fulfilled"
    ? tokensResult.value
    : [{
      tokenId: "(unavailable)",
      tokenName: "(unavailable)",
      expiresAt: null,
      evaluationError: `could not list service tokens: ${errorMessage(tokensResult.reason)}`,
    }];

  return { applications, serviceTokens };
}
