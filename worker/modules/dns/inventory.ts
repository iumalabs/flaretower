// Cloudflare API client helpers for DNS. Plain fetch(), read-only —
// mirrors worker/modules/workers-access-exposure/inventory.ts's shape.
// Exact response field names pinned against Cloudflare's documented API
// shapes; final verification against a live account happens when Module 2's
// T023 (quickstart.md) runs.
import { mapWithConcurrency, withGlobalFetchSlot } from "../../concurrency.ts";
import type { DanglingInsight, DnsRecord, Zone } from "./types.ts";

export interface CloudflareDnsCredentials {
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
  creds: CloudflareDnsCredentials,
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

  // Cloudflare's API returns its {success, errors} envelope as the body
  // even on 4xx/5xx responses — read it before deciding whether to throw,
  // so the real reason (e.g. a missing-required-param 400) isn't discarded
  // down to just a bare status code (found live, 2026-08-11: DNS's
  // Security Insights call silently failed with only "HTTP 400" visible,
  // no indication of what was actually wrong with the request).
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

interface RawZone {
  id: string;
  name: string;
}

interface RawDnsRecord {
  name: string;
  type: string;
  content: string;
  proxiable: boolean;
  proxied?: boolean;
  ttl?: number;
}

// Confirmed against Cloudflare's own API reference and a real account
// (2026-08-11): an insight has no top-level `zone_name` or `description`
// field — those were this module's original, never-corrected guesses.
// `subject` (the affected record's full/FQDN name) and `resolve_text`
// (human-readable guidance) are the real fields.
interface RawInsight {
  issue_type: string;
  subject?: string;
  resolve_text?: string;
}

const DANGLING_ISSUE_TYPES = new Set([
  "dangling_dns_a",
  "dangling_dns_aaaa",
  "dangling_dns_cname",
]);

export async function listZones(
  creds: CloudflareDnsCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<RawZone[]> {
  return await cfFetch<RawZone[]>(`/zones?account.id=${creds.accountId}`, creds, fetchImpl);
}

export async function listZoneRecords(
  zoneId: string,
  creds: CloudflareDnsCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<RawDnsRecord[]> {
  return await cfFetch<RawDnsRecord[]>(`/zones/${zoneId}/dns_records`, creds, fetchImpl);
}

// null (rather than throwing) when the account-wide insights list itself
// could not be fetched — the caller treats null as "force not_evaluated
// for the dangling check everywhere" (same FR-011 pattern as Module 1's
// listAccessApplications).
export async function listDanglingInsights(
  creds: CloudflareDnsCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<DanglingInsight[] | null> {
  try {
    // Confirmed against a real account (2026-08-11): the bare
    // `/accounts/{id}/insights` path this originally used doesn't exist —
    // Cloudflare returned a routing error (7003/7000), not a permission
    // failure. The real path has a `security-center` segment, per
    // Cloudflare's own API reference.
    // The list response wraps its array as `{ issues: [...] }`, not a bare
    // array (confirmed live 2026-08-11 — the bare-array assumption threw
    // "insights.filter is not a function" the moment the routing-path bug
    // above was fixed and a real response came back).
    const { issues } = await cfFetch<{ issues: RawInsight[] }>(
      `/accounts/${creds.accountId}/security-center/insights`,
      creds,
      fetchImpl,
    );
    return issues
      .filter((i) => DANGLING_ISSUE_TYPES.has(i.issue_type))
      .map((i) => ({
        // zoneName is intentionally not sourced from the API here — no
        // reliable top-level zone-name field exists (research.md §2). The
        // match in evaluate.ts's findDanglingMatch() keys on recordName +
        // recordType instead, which is safe: DNS record names are FQDNs,
        // already zone-qualified.
        zoneName: "",
        recordName: i.subject ?? "",
        recordType: i.issue_type.replace("dangling_dns_", "").toUpperCase(),
        reason: i.resolve_text ?? `dangling ${i.issue_type} target`,
      }));
  } catch (err) {
    // Swallowed into "not_evaluated" for every record (FR-011) rather than
    // failing the whole evaluation — but still worth a log line so a real
    // permission/API problem isn't invisible to whoever's watching
    // `wrangler tail`.
    console.error(
      `listDanglingInsights failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function buildDnsInventory(
  creds: CloudflareDnsCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<Zone[]> {
  let rawZones: RawZone[];
  try {
    rawZones = await listZones(creds, fetchImpl);
  } catch (err) {
    // Could not list zones at all (missing Zone Read scope, account-wide
    // API error, outage) — same sentinel shape Module 1/2 use for a total
    // scripts/projects-list failure (buildWorkerInventory,
    // buildPagesInventory): one placeholder zone whose sole record carries
    // evaluationError, so evaluateRecord() (evaluate.ts) resolves it to
    // not_evaluated instead of the run throwing and writing zero
    // dns_findings rows at all (FR-011).
    return [{
      zoneName: "(unavailable)",
      records: [{
        zoneName: "(unavailable)",
        recordName: "(unavailable)",
        recordType: "(zone)",
        content: "",
        proxyCapable: false,
        proxied: null,
        evaluationError: `could not list zones: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      }],
    }];
  }

  // One fetch per zone — capped at 5 concurrent (worker/concurrency.ts),
  // since an account's zone count trivially exceeds the Workers runtime's
  // 6-concurrent-connection limit otherwise (confirmed live, issue #292).
  return await mapWithConcurrency(rawZones, 5, async (z): Promise<Zone> => {
    try {
      const rawRecords = await listZoneRecords(z.id, creds, fetchImpl);
      const records: DnsRecord[] = rawRecords.map((r) => ({
        zoneName: z.name,
        recordName: r.name,
        recordType: r.type,
        content: r.content,
        proxyCapable: r.proxiable,
        proxied: r.proxiable ? (r.proxied ?? false) : null,
        ttl: r.ttl,
      }));
      return { zoneName: z.name, records };
    } catch (err) {
      // Could not list this zone's records at all — one sentinel record
      // surfaces the failure (FR-011) rather than the zone silently
      // showing zero records (which would read as "confirmed empty").
      return {
        zoneName: z.name,
        records: [{
          zoneName: z.name,
          recordName: z.name,
          recordType: "(zone)",
          content: "",
          proxyCapable: false,
          proxied: null,
          evaluationError: err instanceof Error
            ? err.message
            : "unknown error listing zone records",
        }],
      };
    }
  });
}
