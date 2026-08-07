// Cloudflare API client helpers. Plain fetch(), read-only — mirrors every
// prior module's inventory.ts shape. Exact response field names verified
// against Cloudflare's documented API shapes (research.md §1-§2); final
// verification against a live account happens in T024 (quickstart.md).
import type {
  AccessApplication,
  AccessPolicy,
  BucketInventoryItem,
  CustomBucketDomain,
  D1DatabaseInventoryItem,
  KvNamespaceInventoryItem,
} from "./types.ts";

export interface CloudflareStorageCredentials {
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
  creds: CloudflareStorageCredentials,
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

interface RawBucket {
  name: string;
}

interface RawKvNamespace {
  id: string;
  title: string;
}

interface RawD1Database {
  uuid: string;
  name: string;
}

interface RawManagedDomain {
  enabled: boolean;
}

interface RawCustomDomain {
  domain: string;
  enabled: boolean;
}

interface RawCustomDomainsResponse {
  domains: RawCustomDomain[];
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

export async function listR2Buckets(
  creds: CloudflareStorageCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<RawBucket[]> {
  return await cfFetch<RawBucket[]>(`/accounts/${creds.accountId}/r2/buckets`, creds, fetchImpl);
}

export async function listKvNamespaces(
  creds: CloudflareStorageCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<RawKvNamespace[]> {
  return await cfFetch<RawKvNamespace[]>(
    `/accounts/${creds.accountId}/storage/kv/namespaces`,
    creds,
    fetchImpl,
  );
}

export async function listD1Databases(
  creds: CloudflareStorageCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<RawD1Database[]> {
  return await cfFetch<RawD1Database[]>(
    `/accounts/${creds.accountId}/d1/database`,
    creds,
    fetchImpl,
  );
}

export async function getBucketManagedDomain(
  creds: CloudflareStorageCredentials,
  bucketName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const managed = await cfFetch<RawManagedDomain>(
    `/accounts/${creds.accountId}/r2/buckets/${bucketName}/domains/managed`,
    creds,
    fetchImpl,
  );
  return managed.enabled;
}

export async function listBucketCustomDomains(
  creds: CloudflareStorageCredentials,
  bucketName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CustomBucketDomain[]> {
  const custom = await cfFetch<RawCustomDomainsResponse>(
    `/accounts/${creds.accountId}/r2/buckets/${bucketName}/domains/custom`,
    creds,
    fetchImpl,
  );
  return custom.domains.map((d) => ({ domain: d.domain, enabled: d.enabled }));
}

// Independent fetch of the same account-wide Access applications endpoint
// Modules 1, 3, and 4 already call (research.md §4) — this module
// fetches its own copy rather than sharing another module's fetch,
// keeping every module's scheduled evaluation independently failable
// (Principle III).
export async function listAccessApplications(
  creds: CloudflareStorageCredentials,
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

export interface StorageInventory {
  buckets: BucketInventoryItem[];
  kvNamespaces: KvNamespaceInventoryItem[];
  d1Databases: D1DatabaseInventoryItem[];
  // null = the Access applications list itself could not be fetched at
  // all — every bucket's exposure check must come back not_evaluated in
  // that case, never silently critical or safe (mirrors Module 1's
  // evaluateHostname convention for the same `apps === null` case).
  accessApplications: AccessApplication[] | null;
}

// Fetches, per bucket, whether its r2.dev domain is enabled and its
// custom domains — a bucket-level evaluationError means either call
// failed, so the bucket's exposure can't be confidently evaluated at all
// (unlike Module 4's per-project domains/deployments, R2 exposure is one
// evaluation over both signals together, not two independent findings).
async function fetchBucketsWithDomains(
  creds: CloudflareStorageCredentials,
  fetchImpl: typeof fetch,
): Promise<BucketInventoryItem[]> {
  let rawBuckets: RawBucket[];
  try {
    rawBuckets = await listR2Buckets(creds, fetchImpl);
  } catch (err) {
    return [{
      bucketName: "(unavailable)",
      r2DevEnabled: false,
      customDomains: [],
      evaluationError: `could not list R2 buckets: ${errorMessage(err)}`,
    }];
  }

  return await Promise.all(rawBuckets.map(async (bucket) => {
    try {
      const [r2DevEnabled, customDomains] = await Promise.all([
        getBucketManagedDomain(creds, bucket.name, fetchImpl),
        listBucketCustomDomains(creds, bucket.name, fetchImpl),
      ]);
      return { bucketName: bucket.name, r2DevEnabled, customDomains };
    } catch (err) {
      return {
        bucketName: bucket.name,
        r2DevEnabled: false,
        customDomains: [],
        evaluationError: `could not determine public access configuration: ${errorMessage(err)}`,
      };
    }
  }));
}

// Unlike Modules 1-4, R2/KV/D1 are three fully independent resource
// lists — zero buckets does not imply zero namespaces or databases, so
// each total-list failure surfaces its own sentinel entry, independently
// (same resilient design Module 3's buildZeroTrustInventory established),
// so the UI shows "could not evaluate" for that one resource type rather
// than an empty list that would read as "confirmed zero" (FR-014).
export async function buildStorageInventory(
  creds: CloudflareStorageCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<StorageInventory> {
  const [buckets, accessApplications, [kvResult, d1Result]] = await Promise.all([
    fetchBucketsWithDomains(creds, fetchImpl),
    listAccessApplications(creds, fetchImpl).catch(() => null),
    Promise.allSettled([
      listKvNamespaces(creds, fetchImpl),
      listD1Databases(creds, fetchImpl),
    ]),
  ]);

  const kvNamespaces: KvNamespaceInventoryItem[] = kvResult.status === "fulfilled"
    ? kvResult.value.map((k) => ({ namespaceId: k.id, title: k.title }))
    : [{
      namespaceId: "(unavailable)",
      title: "(unavailable)",
      evaluationError: `could not list KV namespaces: ${errorMessage(kvResult.reason)}`,
    }];

  const d1Databases: D1DatabaseInventoryItem[] = d1Result.status === "fulfilled"
    ? d1Result.value.map((d) => ({ databaseUuid: d.uuid, name: d.name }))
    : [{
      databaseUuid: "(unavailable)",
      name: "(unavailable)",
      evaluationError: `could not list D1 databases: ${errorMessage(d1Result.reason)}`,
    }];

  return { buckets, kvNamespaces, d1Databases, accessApplications };
}
