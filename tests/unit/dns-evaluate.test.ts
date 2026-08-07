import { assertEquals } from "@std/assert";
import { evaluateRecord } from "../../worker/modules/dns/evaluate.ts";
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

Deno.test("evaluateRecord - insight matching requires zone+name+type to all agree", () => {
  const result = evaluateRecord(
    record({ zoneName: "different.com", recordName: "old-blog.example.com", recordType: "CNAME" }),
    [insight()], // insight is for zoneName "example.com"
  );
  assertEquals(result.status, "safe");
});
