export type DnsExposureStatus = "safe" | "warning" | "critical" | "not_evaluated";

// Record types capable of being proxied through Cloudflare.
export const PROXY_CAPABLE_TYPES = ["A", "AAAA", "CNAME"] as const;
export type ProxyCapableType = typeof PROXY_CAPABLE_TYPES[number];

export interface DnsRecord {
  zoneName: string;
  recordName: string;
  recordType: string;
  content: string;
  proxyCapable: boolean;
  // null when not proxy-capable; boolean otherwise.
  proxied: boolean | null;
  // Undefined when not available (e.g. this record came from a sentinel
  // "(unavailable)" placeholder) — specs/013-dns-dashboard research.md §1.
  // 1 means "auto" (Cloudflare's own convention for a proxied record).
  ttl?: number;
  // Set by inventory.ts when it could not determine dangling-status for
  // this specific record (mirrors Module 1's WorkerHostname.evaluationError
  // — see worker/modules/workers-access-exposure/types.ts).
  evaluationError?: string;
}

export interface Zone {
  zoneName: string;
  records: DnsRecord[];
}

// A confirmed-dangling target from Cloudflare's own Security Insights scan
// (research.md §2) — matched against a record by (zoneName, recordName,
// recordType).
export interface DanglingInsight {
  zoneName: string;
  recordName: string;
  recordType: string;
  reason: string;
}

export interface DnsRecordEvaluation {
  zoneName: string;
  recordName: string;
  recordType: string;
  content: string;
  proxyCapable: boolean;
  proxied: boolean | null;
  ttl: number | null;
  // Presentational only (specs/013-dns-dashboard research.md §3) — never
  // affects `status`. True when `content` points at a known Cloudflare
  // platform domain (e.g. *.pages.dev, *.workers.dev).
  isPlatformTarget: boolean;
  status: DnsExposureStatus;
  reason: string;
}

export interface ZoneEvaluation {
  zoneName: string;
  records: DnsRecordEvaluation[];
}
