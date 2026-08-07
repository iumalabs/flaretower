// Cloudflare API client helpers. Plain fetch(), read-only — mirrors every
// prior module's inventory.ts shape. Exact response field names verified
// against Cloudflare's documented API shapes (research.md §1-§2); final
// verification against a live account happens in T024 (quickstart.md).
import type {
  BucketInventoryItem,
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

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "unknown error";
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

export interface StorageInventory {
  buckets: BucketInventoryItem[];
  kvNamespaces: KvNamespaceInventoryItem[];
  d1Databases: D1DatabaseInventoryItem[];
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
  const [bucketsResult, kvResult, d1Result] = await Promise.allSettled([
    listR2Buckets(creds, fetchImpl),
    listKvNamespaces(creds, fetchImpl),
    listD1Databases(creds, fetchImpl),
  ]);

  const buckets: BucketInventoryItem[] = bucketsResult.status === "fulfilled"
    ? bucketsResult.value.map((b) => ({
      bucketName: b.name,
      r2DevEnabled: false,
      customDomains: [],
    }))
    : [{
      bucketName: "(unavailable)",
      r2DevEnabled: false,
      customDomains: [],
      evaluationError: `could not list R2 buckets: ${errorMessage(bucketsResult.reason)}`,
    }];

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

  return { buckets, kvNamespaces, d1Databases };
}
