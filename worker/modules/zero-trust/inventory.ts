// Cloudflare API client helpers. Plain fetch(), read-only — mirrors every
// prior module's inventory.ts shape. Exact response field names pinned
// against Cloudflare's documented API shapes; final verification against
// a live account happens in T022 (quickstart.md).
import { withGlobalFetchSlot } from "../../concurrency.ts";
import type {
  AccessApplication,
  AccessGroup,
  AccessPolicy,
  IdentityProvider,
  ServiceToken,
} from "./types.ts";

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

interface RawAccessPolicy {
  decision: string;
  include?: Array<Record<string, unknown>>;
  require?: Array<Record<string, unknown>>;
}

interface RawAccessApp {
  id: string;
  name?: string;
  // issue #464 — Cloudflare omits `domain` for some Access application
  // types (e.g. bookmark apps), so this can genuinely be absent on a real
  // account despite the API docs implying it's always present. zt_app_findings
  // / zt_app_alerts also declare app_domain TEXT NOT NULL (migration 0004),
  // so callers must never bind this raw value straight into D1.
  domain?: string;
  self_hosted_domains?: string[];
  session_duration?: string;
  policies?: RawAccessPolicy[];
}

interface RawServiceToken {
  id: string;
  name: string;
  expires_at?: string;
}

interface RawIdentityProvider {
  id: string;
  name: string;
}

interface RawAccessGroup {
  id: string;
  name: string;
  include?: Array<Record<string, unknown>>;
}

function summarizePolicy(policy: RawAccessPolicy): AccessPolicy {
  const include = policy.include ?? [];
  return {
    decision: policy.decision,
    includesEveryone: include.some((rule) => "everyone" in rule),
    hasScopedInclude: include.some((rule) => !("everyone" in rule)),
    include,
    require: policy.require ?? [],
  };
}

// self_hosted_domains covers a multi-hostname app (specs/014-access-dashboard
// research.md §1); a legacy app with only the singular `domain` field falls
// back to a one-element list equal to it. issue #464 — domain itself may be
// undefined (see RawAccessApp), so the fallback list uses the same sentinel
// as listAccessApplications below.
function coveredHostnames(app: RawAccessApp): string[] {
  return app.self_hosted_domains && app.self_hosted_domains.length > 0
    ? app.self_hosted_domains
    : [app.domain ?? "(no domain)"];
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
  return apps.map((app) => {
    // issue #464 — resolved once per app so appName's fallback and
    // appDomain agree, and neither can end up `undefined` when Cloudflare
    // omits `domain` (e.g. bookmark-type apps).
    const domain = app.domain ?? "(no domain)";
    return {
      appId: app.id,
      // Falls back to the domain when Cloudflare's API doesn't return a
      // name for a given app (older apps predating the `name` field) —
      // never a raw UUID shown to the operator as if it were a name.
      appName: app.name && app.name.length > 0 ? app.name : domain,
      appDomain: domain,
      policies: (app.policies ?? []).map(summarizePolicy),
      coveredHostnames: coveredHostnames(app),
      sessionDuration: app.session_duration ?? null,
    };
  });
}

// specs/014-access-dashboard research.md §2 — resolves a policy's
// login_method rule (which only carries an id) into a readable name.
export async function listIdentityProviders(
  creds: CloudflareZtCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<IdentityProvider[]> {
  const providers = await cfFetch<RawIdentityProvider[]>(
    `/accounts/${creds.accountId}/access/identity_providers`,
    creds,
    fetchImpl,
  );
  return providers.map((p) => ({ id: p.id, name: p.name }));
}

// specs/014-access-dashboard research.md §3 — live-read, not persisted
// (see routes.ts). Returns null (not throws) on total failure, matching
// every other module's "not_evaluated, never a silent confirmed-empty
// list" convention (spec.md FR-008).
export async function listAccessGroups(
  creds: CloudflareZtCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<AccessGroup[] | null> {
  try {
    const groups = await cfFetch<RawAccessGroup[]>(
      `/accounts/${creds.accountId}/access/groups`,
      creds,
      fetchImpl,
    );
    return groups.map((g) => ({ groupId: g.id, name: g.name, include: g.include ?? [] }));
  } catch (err) {
    console.error(`listAccessGroups failed: ${errorMessage(err)}`);
    return null;
  }
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
      appName: "(unavailable)",
      appDomain: "(unavailable)",
      policies: [],
      coveredHostnames: [],
      sessionDuration: null,
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
