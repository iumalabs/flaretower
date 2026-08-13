import { assertEquals } from "@std/assert";
import {
  evaluateDmarcPolicy,
  evaluateRecord,
  isPlatformTargetDomain,
} from "../../worker/modules/dns/evaluate.ts";
import type { DanglingInsight, DnsRecord } from "../../worker/modules/dns/types.ts";

function record(overrides: Partial<DnsRecord>): DnsRecord {
  return {
    zoneName: "example.com",
    recordName: "www.example.com",
    recordType: "A",
    content: "203.0.113.1",
    proxyCapable: true,
    proxied: true,
    ...overrides,
  };
}

function insight(overrides: Partial<DanglingInsight> = {}): DanglingInsight {
  return {
    zoneName: "example.com",
    recordName: "old-blog.example.com",
    recordType: "CNAME",
    reason: "dangling CNAME target",
    ...overrides,
  };
}

Deno.test("evaluateRecord - not_evaluated when the record has an evaluationError", () => {
  const result = evaluateRecord(record({ evaluationError: "zone listing failed" }), []);
  assertEquals(result.status, "not_evaluated");
  assertEquals(result.reason, "zone listing failed");
});

Deno.test("evaluateRecord - a proxied record with no matching dangling insight is safe", () => {
  const result = evaluateRecord(record({ proxied: true }), []);
  assertEquals(result.status, "safe");
});

Deno.test("evaluateRecord - a non-proxy-capable record (MX) is safe, proxied is null, dangling check doesn't apply", () => {
  const result = evaluateRecord(
    record({ recordType: "MX", proxyCapable: false, proxied: null }),
    null, // even with insights unavailable, MX is never dangling-checked
  );
  assertEquals(result.status, "safe");
  assertEquals(result.proxied, null);
});

Deno.test("evaluateRecord - critical when a matching dangling insight exists", () => {
  const result = evaluateRecord(
    record({
      recordName: "old-blog.example.com",
      recordType: "CNAME",
      content: "old.herokuapp.com",
    }),
    [insight()],
  );
  assertEquals(result.status, "critical");
  assertEquals(result.reason, "dangling CNAME target");
});

Deno.test("evaluateRecord - safe when insights exist but none match this record", () => {
  const result = evaluateRecord(
    record({ recordName: "healthy.example.com", recordType: "CNAME" }),
    [insight()], // matches a different record
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateRecord - not_evaluated (not silently safe) for a proxy-capable record when insights couldn't be fetched at all", () => {
  const result = evaluateRecord(record({ recordType: "A" }), null);
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateRecord - insight matching ignores zoneName, since the real API doesn't reliably expose one — recordName+recordType is enough (FQDNs are already zone-qualified)", () => {
  const result = evaluateRecord(
    // Same recordName+recordType as the fixture insight, but a DIFFERENT
    // zoneName than the insight carries — must still match.
    record({ zoneName: "different.com", recordName: "old-blog.example.com", recordType: "CNAME" }),
    [insight({ zoneName: "example.com" })],
  );
  assertEquals(result.status, "critical");
});

Deno.test("evaluateRecord - insight matching still requires name+type to both agree", () => {
  const result = evaluateRecord(
    record({ recordName: "old-blog.example.com", recordType: "A" }), // same name, different type
    [insight({ recordType: "CNAME" })],
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateRecord - DNS-only on an origin-facing record (A) is warning, not safe", () => {
  const result = evaluateRecord(record({ recordType: "A", proxied: false }), []);
  assertEquals(result.status, "warning");
});

Deno.test("evaluateRecord - DNS-only on CNAME is warning too", () => {
  const result = evaluateRecord(record({ recordType: "CNAME", proxied: false }), []);
  assertEquals(result.status, "warning");
});

Deno.test("evaluateRecord - a proxied record (proxied:true) is safe, not warning", () => {
  const result = evaluateRecord(record({ proxied: true }), []);
  assertEquals(result.status, "safe");
});

Deno.test("evaluateRecord - a non-proxy-capable record (TXT) is never flagged DNS-only, even though it's conceptually 'DNS-only by nature'", () => {
  const result = evaluateRecord(
    record({ recordType: "TXT", proxyCapable: false, proxied: null }),
    [],
  );
  assertEquals(result.status, "safe");
  assertEquals(result.reason, "not proxy-capable");
});

Deno.test("evaluateRecord - dangling (critical) takes priority over DNS-only (warning) when both would otherwise apply", () => {
  const result = evaluateRecord(
    record({ recordName: "old-blog.example.com", recordType: "CNAME", proxied: false }),
    [insight()],
  );
  assertEquals(result.status, "critical");
});

// specs/013-dns-dashboard/research.md §2
Deno.test("evaluateDmarcPolicy - p=none on a _dmarc TXT record is flagged", () => {
  const reason = evaluateDmarcPolicy(
    record({
      recordName: "_dmarc.example.com",
      recordType: "TXT",
      content: "v=DMARC1; p=none; rua=mailto:x@example.com",
    }),
  );
  assertEquals(reason, "DMARC policy provides no enforcement (p=none)");
});

Deno.test("evaluateDmarcPolicy - p=quarantine and p=reject are not flagged", () => {
  for (const policy of ["quarantine", "reject"]) {
    const reason = evaluateDmarcPolicy(
      record({
        recordName: "_dmarc.example.com",
        recordType: "TXT",
        content: `v=DMARC1; p=${policy}`,
      }),
    );
    assertEquals(reason, null);
  }
});

Deno.test("evaluateDmarcPolicy - an unparseable value never fabricates a warning", () => {
  const reason = evaluateDmarcPolicy(
    record({
      recordName: "_dmarc.example.com",
      recordType: "TXT",
      content: "not a dmarc string at all",
    }),
  );
  assertEquals(reason, null);
});

Deno.test("evaluateDmarcPolicy - never applies to a non-_dmarc record, even with p=none-like content", () => {
  const reason = evaluateDmarcPolicy(
    record({ recordName: "other.example.com", recordType: "TXT", content: "v=DMARC1; p=none" }),
  );
  assertEquals(reason, null);
});

Deno.test("evaluateDmarcPolicy - never applies to a non-TXT record", () => {
  const reason = evaluateDmarcPolicy(
    record({ recordName: "_dmarc.example.com", recordType: "CNAME", content: "p=none" }),
  );
  assertEquals(reason, null);
});

Deno.test("evaluateRecord - _dmarc p=none surfaces as a warning via evaluateRecord itself", () => {
  const result = evaluateRecord(
    record({
      recordName: "_dmarc.example.com",
      recordType: "TXT",
      proxyCapable: false,
      proxied: null,
      content: "v=DMARC1; p=none",
    }),
    [],
  );
  assertEquals(result.status, "warning");
  assertEquals(result.reason, "DMARC policy provides no enforcement (p=none)");
});

// specs/013-dns-dashboard/research.md §3
Deno.test("isPlatformTargetDomain - matches known Cloudflare platform suffixes", () => {
  assertEquals(isPlatformTargetDomain("acme-docs.pages.dev"), true);
  assertEquals(isPlatformTargetDomain("api-gateway.acme-labs.workers.dev"), true);
});

Deno.test("isPlatformTargetDomain - does not match unrelated content", () => {
  assertEquals(isPlatformTargetDomain("192.0.2.1"), false);
  assertEquals(isPlatformTargetDomain("api-gateway.acme-labs.workers.dev.evil.com"), false);
});

Deno.test("evaluateRecord - isPlatformTarget is presentational only, never affects status", () => {
  const result = evaluateRecord(
    record({ recordType: "CNAME", content: "acme-docs.pages.dev", proxied: true }),
    [],
  );
  assertEquals(result.isPlatformTarget, true);
  assertEquals(result.status, "safe");
});

Deno.test("evaluateRecord - ttl passes through unchanged", () => {
  const result = evaluateRecord(record({ ttl: 3600 }), []);
  assertEquals(result.ttl, 3600);
});

Deno.test("evaluateRecord - ttl is null when not present on the source record", () => {
  const result = evaluateRecord(record({}), []);
  assertEquals(result.ttl, null);
});
