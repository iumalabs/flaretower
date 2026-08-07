import { assertEquals } from "@std/assert";
import { evaluateRecord } from "../../worker/modules/dns/evaluate.ts";
import type { DnsRecord } from "../../worker/modules/dns/types.ts";

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

Deno.test("evaluateRecord - not_evaluated when the record has an evaluationError", () => {
  const result = evaluateRecord(record({ evaluationError: "zone listing failed" }), null);
  assertEquals(result.status, "not_evaluated");
  assertEquals(result.reason, "zone listing failed");
});

Deno.test("evaluateRecord - a proxied record is safe (basic US1 evaluation, before US2/US3 branches)", () => {
  const result = evaluateRecord(record({ proxied: true }), null);
  assertEquals(result.status, "safe");
});

Deno.test("evaluateRecord - a non-proxy-capable record (MX) is safe, proxied is null", () => {
  const result = evaluateRecord(
    record({ recordType: "MX", proxyCapable: false, proxied: null }),
    null,
  );
  assertEquals(result.status, "safe");
  assertEquals(result.proxied, null);
});
