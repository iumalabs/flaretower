// Pure record -> safe/warning/critical/not_evaluated evaluation. No network
// or D1 access here (constitution Principle III), mirrors
// worker/modules/workers-access-exposure/evaluate.ts's shape.
import type {
  DanglingInsight,
  DnsRecord,
  DnsRecordEvaluation,
  Zone,
  ZoneEvaluation,
} from "./types.ts";

// Basic evaluation for User Story 1: passes through proxied status,
// returns not_evaluated when the record carries an evaluationError.
// Dangling-target detection (User Story 2) and DNS-only-of-note (User
// Story 3) extend this in their own phases — see git history for the
// incremental extension, same as Module 1's evaluate.ts.
export function evaluateRecord(
  record: DnsRecord,
  _danglingInsights: DanglingInsight[] | null,
): DnsRecordEvaluation {
  const base = {
    zoneName: record.zoneName,
    recordName: record.recordName,
    recordType: record.recordType,
    content: record.content,
    proxyCapable: record.proxyCapable,
    proxied: record.proxied,
  };

  if (record.evaluationError) {
    return { ...base, status: "not_evaluated", reason: record.evaluationError };
  }

  return {
    ...base,
    status: "safe",
    reason: record.proxyCapable
      ? (record.proxied ? "proxied through Cloudflare" : "DNS-only")
      : "not proxy-capable",
  };
}

export function evaluateZone(
  zone: Zone,
  danglingInsights: DanglingInsight[] | null,
): ZoneEvaluation {
  return {
    zoneName: zone.zoneName,
    records: zone.records.map((r) => evaluateRecord(r, danglingInsights)),
  };
}

export function evaluateDnsInventory(
  zones: Zone[],
  danglingInsights: DanglingInsight[] | null,
): ZoneEvaluation[] {
  return zones.map((z) => evaluateZone(z, danglingInsights));
}
