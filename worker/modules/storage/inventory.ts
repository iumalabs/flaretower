// Cloudflare API client helpers. Plain fetch(), read-only — mirrors every
// prior module's inventory.ts shape. Exact response field names verified
// against Cloudflare's documented API shapes (research.md §1-§2); final
// verification against a live account happens in T024 (quickstart.md).
import { mapWithConcurrency, withGlobalFetchSlot } from "../../concurrency.ts";
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

interface RawWorkerScript {
  id: string;
}

interface RawBinding {
  type: string;
  namespace_id?: string;
  id?: string;
  bucket_name?: string;
}

interface RawD1DatabaseDetail {
  num_tables?: number;
  file_size?: number;
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
  // Unlike every other list endpoint this module calls, R2's own `result`
  // is `{ buckets: [...] }`, not a bare array — confirmed against
  // Cloudflare's own API reference and against a real account, where the
  // bare-array assumption threw `rawBuckets.map is not a function` in
  // production (2026-08-11).
  const { buckets } = await cfFetch<{ buckets: RawBucket[] }>(
    `/accounts/${creds.accountId}/r2/buckets`,
    creds,
    fetchImpl,
  );
  return buckets;
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

// The per-database detail endpoint (distinct from the list call above)
// returns num_tables/file_size, which the list call doesn't (specs/016-
// storage-dashboard research.md §1). Returns {} on failure rather than
// throwing — a database whose detail couldn't be fetched still exists and
// should keep rendering its other columns (spec.md Edge Cases).
export async function getD1DatabaseDetail(
  creds: CloudflareStorageCredentials,
  databaseUuid: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ numTables?: number; fileSizeBytes?: number }> {
  try {
    const detail = await cfFetch<RawD1DatabaseDetail>(
      `/accounts/${creds.accountId}/d1/database/${databaseUuid}`,
      creds,
      fetchImpl,
    );
    return { numTables: detail.num_tables, fileSizeBytes: detail.file_size };
  } catch {
    return {};
  }
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

export async function listWorkerScripts(
  creds: CloudflareStorageCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const scripts = await cfFetch<RawWorkerScript[]>(
    `/accounts/${creds.accountId}/workers/scripts`,
    creds,
    fetchImpl,
  );
  return scripts.map((s) => s.id);
}

export async function listScriptBindings(
  creds: CloudflareStorageCredentials,
  scriptName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RawBinding[]> {
  return await cfFetch<RawBinding[]>(
    `/accounts/${creds.accountId}/workers/scripts/${scriptName}/bindings`,
    creds,
    fetchImpl,
  );
}

export interface BindingReferences {
  kvNamespaceIds: Set<string>;
  d1DatabaseIds: Set<string>;
  // specs/016-storage-dashboard research.md §2 — additive alongside the
  // Sets above (which stay exactly as they are, so the existing
  // safe/warning usage decision in evaluate.ts is untouched): the actual
  // Worker script name(s) that reference each resource, for display only.
  // R2 buckets are keyed by name (r2_bucket bindings have no id, only
  // bucket_name) — buckets were never scanned for "unused" before this,
  // and still aren't; this map exists purely to populate "Bound to".
  kvNamespaceBoundTo: Map<string, string[]>;
  d1DatabaseBoundTo: Map<string, string[]>;
  r2BucketBoundTo: Map<string, string[]>;
  // false if the script list itself failed, or if any individual
  // script's bindings could not be fetched — a namespace/database not
  // found in the sets above can only be confidently called "unused" when
  // this is true (research.md §3's partial-failure rule).
  allBindingsConfirmed: boolean;
}

// Deduped per resource — a script binding the same resource under two
// different binding names (e.g. DB and DB_LEGACY both pointing at the
// same D1 database) must still count as one Worker in "Bound to", not
// one entry per binding.
function addBinding(map: Map<string, string[]>, key: string, workerName: string): void {
  const existing = map.get(key);
  if (existing) {
    if (!existing.includes(workerName)) existing.push(workerName);
  } else {
    map.set(key, [workerName]);
  }
}

// Scans every deployed Worker's bindings to build the set of KV
// namespace ids and D1 database ids actually referenced by some Worker —
// the only way to determine "unused" for a resource type with no direct
// exposure signal, since Cloudflare exposes no reverse index (research.md
// §3). Independent fetch of the same account-wide Worker scripts list
// Module 1 already calls, per the "duplication beats coupling" precedent.
async function buildBindingReferences(
  creds: CloudflareStorageCredentials,
  fetchImpl: typeof fetch,
): Promise<BindingReferences> {
  let scriptNames: string[];
  try {
    scriptNames = await listWorkerScripts(creds, fetchImpl);
  } catch {
    return {
      kvNamespaceIds: new Set(),
      d1DatabaseIds: new Set(),
      kvNamespaceBoundTo: new Map(),
      d1DatabaseBoundTo: new Map(),
      r2BucketBoundTo: new Map(),
      allBindingsConfirmed: false,
    };
  }

  const kvNamespaceIds = new Set<string>();
  const d1DatabaseIds = new Set<string>();
  const kvNamespaceBoundTo = new Map<string, string[]>();
  const d1DatabaseBoundTo = new Map<string, string[]>();
  const r2BucketBoundTo = new Map<string, string[]>();
  let allBindingsConfirmed = true;

  // One fetch per script — capped at 5 concurrent (worker/concurrency.ts),
  // since an account's worker count trivially exceeds the Workers runtime's
  // 6-concurrent-connection limit otherwise (confirmed live, issue #292).
  // mapWithConcurrency doesn't isolate per-item rejections the way
  // Promise.allSettled did, so this catches per script itself.
  const results = await mapWithConcurrency(
    scriptNames,
    5,
    async (name) => {
      try {
        return {
          ok: true as const,
          name,
          bindings: await listScriptBindings(creds, name, fetchImpl),
        };
      } catch {
        return { ok: false as const, name, bindings: [] };
      }
    },
  );
  for (const result of results) {
    if (!result.ok) {
      allBindingsConfirmed = false;
      continue;
    }
    for (const binding of result.bindings) {
      if (binding.type === "kv_namespace" && binding.namespace_id) {
        kvNamespaceIds.add(binding.namespace_id);
        addBinding(kvNamespaceBoundTo, binding.namespace_id, result.name);
      }
      if (binding.type === "d1" && binding.id) {
        d1DatabaseIds.add(binding.id);
        addBinding(d1DatabaseBoundTo, binding.id, result.name);
      }
      if (binding.type === "r2_bucket" && binding.bucket_name) {
        addBinding(r2BucketBoundTo, binding.bucket_name, result.name);
      }
    }
  }

  return {
    kvNamespaceIds,
    d1DatabaseIds,
    kvNamespaceBoundTo,
    d1DatabaseBoundTo,
    r2BucketBoundTo,
    allBindingsConfirmed,
  };
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
  bindingReferences: BindingReferences;
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

  // Each bucket already fires 2 concurrent fetches internally (managed +
  // custom domains) — capped at 2 concurrent buckets (worker/concurrency.ts)
  // keeps this module's own peak at 4 in-flight requests, under the
  // 6-connection Workers limit (confirmed live, issue #292).
  return await mapWithConcurrency(rawBuckets, 2, async (bucket) => {
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
  });
}

// One small extra fetch per already-discovered D1 database (specs/016-
// storage-dashboard research.md §1) — capped at 2 concurrent, same
// modest cap as fetchBucketsWithDomains. A per-database detail failure
// only leaves that database's numTables/fileSizeBytes undefined; it does
// NOT surface as an evaluationError, since the database itself is
// already confirmed to exist from the list call (spec.md Edge Cases).
async function fetchD1DatabasesWithDetail(
  creds: CloudflareStorageCredentials,
  rawDatabases: RawD1Database[],
  fetchImpl: typeof fetch,
): Promise<D1DatabaseInventoryItem[]> {
  return await mapWithConcurrency(rawDatabases, 2, async (d) => {
    const detail = await getD1DatabaseDetail(creds, d.uuid, fetchImpl);
    return { databaseUuid: d.uuid, name: d.name, ...detail };
  });
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
  // fetchBucketsWithDomains and buildBindingReferences each ramp up their
  // own internal fan-out (documented peaks of 4 and 5 respectively, both
  // already capped individually against issue #292) — running them in the
  // same Promise.all lets those two ramps overlap, peaking at 4 + 5 = 9
  // simultaneous connections by themselves, before listAccessApplications
  // or the KV/D1 list calls are even counted. Sequenced here so at most
  // one of the two heavy fan-outs is ever ramping up at a time; the two
  // lightweight flat-list calls (1 + 2 connections, no ramp-up of their
  // own) stay alongside the first phase since they resolve quickly and
  // don't meaningfully add to the sustained peak.
  const [buckets, accessApplications, [kvResult, d1Result]] = await Promise.all([
    fetchBucketsWithDomains(creds, fetchImpl),
    listAccessApplications(creds, fetchImpl).catch(() => null),
    Promise.allSettled([
      listKvNamespaces(creds, fetchImpl),
      listD1Databases(creds, fetchImpl),
    ]),
  ]);
  const bindingReferences = await buildBindingReferences(creds, fetchImpl);

  const kvNamespaces: KvNamespaceInventoryItem[] = kvResult.status === "fulfilled"
    ? kvResult.value.map((k) => ({ namespaceId: k.id, title: k.title }))
    : [{
      namespaceId: "(unavailable)",
      title: "(unavailable)",
      evaluationError: `could not list KV namespaces: ${errorMessage(kvResult.reason)}`,
    }];

  const d1Databases: D1DatabaseInventoryItem[] = d1Result.status === "fulfilled"
    ? await fetchD1DatabasesWithDetail(creds, d1Result.value, fetchImpl)
    : [{
      databaseUuid: "(unavailable)",
      name: "(unavailable)",
      evaluationError: `could not list D1 databases: ${errorMessage(d1Result.reason)}`,
    }];

  return { buckets, kvNamespaces, d1Databases, accessApplications, bindingReferences };
}
