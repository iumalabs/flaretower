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

// Matches on recordName + recordType only, not zoneName — Cloudflare's
// Security Insights API doesn't reliably expose a usable zone-name field
// (inventory.ts's listDanglingInsights leaves it ""), so requiring an exact
// zoneName match would silently never match anything, turning a real
// dangling record into a false "safe". recordName is already a
// zone-qualified FQDN, so it alone is enough to identify the record
// correctly.
function findDanglingMatch(
  record: DnsRecord,
  insights: DanglingInsight[],
): DanglingInsight | undefined {
  return insights.find((i) =>
    i.recordName === record.recordName &&
    i.recordType === record.recordType
  );
}

// Known Cloudflare platform domain suffixes a record's content might point
// at — specs/013-dns-dashboard research.md §3. Presentational only, never
// a `status`/severity input.
const PLATFORM_DOMAIN_SUFFIXES = [".pages.dev", ".workers.dev"];

export function isPlatformTargetDomain(content: string): boolean {
  const value = content.toLowerCase();
  return PLATFORM_DOMAIN_SUFFIXES.some((suffix) => value.endsWith(suffix));
}

// RFC 7489 §6.3: `p=none` means "monitor only, take no enforcement
// action" — a well-defined, unambiguous "this isn't actually protecting
// anything" signal, not a judgment call this project invents
// (specs/013-dns-dashboard research.md §2). Returns null (no finding) for
// any record that isn't a `_dmarc` TXT record, or whose value can't be
// parsed as a `tag=value; ...` DMARC policy string (spec.md Edge Cases —
// never fabricate a warning from an unparseable value).
export function evaluateDmarcPolicy(record: DnsRecord): string | null {
  if (record.recordType !== "TXT" || !record.recordName.startsWith("_dmarc.")) {
    return null;
  }

  const tags = new Map(
    record.content
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eq = part.indexOf("=");
        return eq === -1 ? [part, ""] : [part.slice(0, eq).trim(), part.slice(eq + 1).trim()];
      }),
  );

  if (tags.get("p") === "none") {
    return "DMARC policy provides no enforcement (p=none)";
  }
  return null;
}

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
    ttl: record.ttl ?? null,
    isPlatformTarget: isPlatformTargetDomain(record.content),
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

  // DNS-only exposure on an origin-facing record type (User Story 3): not
  // dangling, but bypasses Cloudflare's WAF/DDoS protection and reveals the
  // origin — worth the operator's attention, distinct from both critical
  // (dangling) and safe (proxied). Record types that are inherently
  // DNS-only (MX, TXT, NS, etc.) are never flagged this way — FR-004.
  if (record.proxyCapable && !record.proxied) {
    return { ...base, status: "warning", reason: "DNS-only — bypasses Cloudflare protection" };
  }

  const dmarcReason = evaluateDmarcPolicy(record);
  if (dmarcReason) {
    return { ...base, status: "warning", reason: dmarcReason };
  }

  return {
    ...base,
    status: "safe",
    reason: record.proxyCapable ? "proxied through Cloudflare" : "not proxy-capable",
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
