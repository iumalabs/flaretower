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

function findDanglingMatch(
  record: DnsRecord,
  insights: DanglingInsight[],
): DanglingInsight | undefined {
  return insights.find((i) =>
    i.zoneName === record.zoneName &&
    i.recordName === record.recordName &&
    i.recordType === record.recordType
  );
}

// DNS-only-of-note (User Story 3) extends this in its own follow-up work.
export function evaluateRecord(
  record: DnsRecord,
  danglingInsights: DanglingInsight[] | null,
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

  // Dangling-target detection only applies to record types capable of
  // pointing at an external, potentially-decommissioned resource — the
  // same set that can be proxied (A/AAAA/CNAME). A record type like MX or
  // TXT is never evaluated for dangling status.
  if (record.proxyCapable) {
    if (danglingInsights === null) {
      return {
        ...base,
        status: "not_evaluated",
        reason: "could not evaluate dangling-target status (Security Insights API error)",
      };
    }

    const match = findDanglingMatch(record, danglingInsights);
    if (match) {
      return { ...base, status: "critical", reason: match.reason };
    }
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
