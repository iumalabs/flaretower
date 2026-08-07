// Cloudflare API client helpers for DNS. Plain fetch(), read-only —
// mirrors worker/modules/workers-access-exposure/inventory.ts's shape.
// Exact response field names pinned against Cloudflare's documented API
// shapes; final verification against a live account happens when Module 2's
// T023 (quickstart.md) runs.
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
}

interface RawInsight {
  issue_type: string;
  zone_name?: string;
  subject?: string;
  description?: string;
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
    const insights = await cfFetch<RawInsight[]>(
      `/accounts/${creds.accountId}/insights`,
      creds,
      fetchImpl,
    );
    return insights
      .filter((i) => DANGLING_ISSUE_TYPES.has(i.issue_type))
      .map((i) => ({
        zoneName: i.zone_name ?? "",
        recordName: i.subject ?? "",
        recordType: i.issue_type.replace("dangling_dns_", "").toUpperCase(),
        reason: i.description ?? `dangling ${i.issue_type} target`,
      }));
  } catch {
    return null;
  }
}

export async function buildDnsInventory(
  creds: CloudflareDnsCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<Zone[]> {
  const rawZones = await listZones(creds, fetchImpl);

  return await Promise.all(
    rawZones.map(async (z): Promise<Zone> => {
      try {
        const rawRecords = await listZoneRecords(z.id, creds, fetchImpl);
        const records: DnsRecord[] = rawRecords.map((r) => ({
          zoneName: z.name,
          recordName: r.name,
          recordType: r.type,
          content: r.content,
          proxyCapable: r.proxiable,
          proxied: r.proxiable ? (r.proxied ?? false) : null,
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
    }),
  );
}
