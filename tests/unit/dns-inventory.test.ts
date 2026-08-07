import { assertEquals } from "@std/assert";
import { buildDnsInventory, listDanglingInsights } from "../../worker/modules/dns/inventory.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(handlers: Array<[string, () => Response]>): typeof fetch {
  return ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(url).pathname;
    for (const [suffix, handler] of handlers) {
      if (pathname.endsWith(suffix)) return Promise.resolve(handler());
    }
    return Promise.reject(new Error(`Unhandled mock fetch call: ${url}`));
  }) as typeof fetch;
}

const creds = { accountId: "acct-1", apiToken: "fake-token" };

Deno.test("buildDnsInventory - zones and their records are enumerated and grouped", async () => {
  const fetchImpl = mockFetch([
    ["/zones", () =>
      jsonResponse({
        success: true,
        result: [{ id: "zone-1", name: "example.com" }],
        errors: [],
      })],
    ["/zones/zone-1/dns_records", () =>
      jsonResponse({
        success: true,
        result: [
          {
            name: "www.example.com",
            type: "A",
            content: "203.0.113.1",
            proxiable: true,
            proxied: true,
          },
          { name: "example.com", type: "MX", content: "10 mail.example.com", proxiable: false },
        ],
        errors: [],
      })],
  ]);

  const zones = await buildDnsInventory(creds, fetchImpl);

  assertEquals(zones.length, 1);
  assertEquals(zones[0].zoneName, "example.com");
  assertEquals(zones[0].records.length, 2);
  const aRecord = zones[0].records.find((r) => r.recordType === "A");
  assertEquals(aRecord?.proxyCapable, true);
  assertEquals(aRecord?.proxied, true);
  const mxRecord = zones[0].records.find((r) => r.recordType === "MX");
  assertEquals(mxRecord?.proxyCapable, false);
  assertEquals(mxRecord?.proxied, null);
});

Deno.test("buildDnsInventory - a zone with zero records still appears", async () => {
  const fetchImpl = mockFetch([
    [
      "/zones",
      () =>
        jsonResponse({ success: true, result: [{ id: "zone-1", name: "empty.com" }], errors: [] }),
    ],
    ["/zones/zone-1/dns_records", () => jsonResponse({ success: true, result: [], errors: [] })],
  ]);

  const zones = await buildDnsInventory(creds, fetchImpl);

  assertEquals(zones.length, 1);
  assertEquals(zones[0].records, []);
});

Deno.test("buildDnsInventory - a zone whose records can't be listed surfaces a sentinel not_evaluated record, not omission", async () => {
  const fetchImpl = mockFetch([
    [
      "/zones",
      () =>
        jsonResponse({ success: true, result: [{ id: "zone-1", name: "flaky.com" }], errors: [] }),
    ],
    [
      "/zones/zone-1/dns_records",
      () => jsonResponse({ success: false, result: null, errors: [] }, 429),
    ],
  ]);

  const zones = await buildDnsInventory(creds, fetchImpl);

  assertEquals(zones.length, 1);
  assertEquals(zones[0].records.length, 1);
  assertEquals(typeof zones[0].records[0].evaluationError, "string");
});

Deno.test("buildDnsInventory - two zones with the same-name-different-type records both appear as distinct entries", async () => {
  const fetchImpl = mockFetch([
    [
      "/zones",
      () =>
        jsonResponse({
          success: true,
          result: [{ id: "zone-1", name: "example.com" }],
          errors: [],
        }),
    ],
    ["/zones/zone-1/dns_records", () =>
      jsonResponse({
        success: true,
        result: [
          {
            name: "example.com",
            type: "A",
            content: "203.0.113.1",
            proxiable: true,
            proxied: false,
          },
          {
            name: "example.com",
            type: "A",
            content: "203.0.113.2",
            proxiable: true,
            proxied: false,
          },
        ],
        errors: [],
      })],
  ]);

  const zones = await buildDnsInventory(creds, fetchImpl);

  assertEquals(zones[0].records.length, 2);
});

Deno.test("listDanglingInsights - filters to only dangling A/AAAA/CNAME issue types, maps fields", async () => {
  const fetchImpl = mockFetch([
    ["/insights", () =>
      jsonResponse({
        success: true,
        result: [
          {
            issue_type: "dangling_dns_cname",
            zone_name: "example.com",
            subject: "old-blog.example.com",
            description: "target no longer exists",
          },
          {
            issue_type: "missing_dmarc_record", // unrelated insight type — must be filtered out
            zone_name: "example.com",
            subject: "example.com",
          },
        ],
        errors: [],
      })],
  ]);

  const insights = await listDanglingInsights(creds, fetchImpl);

  assertEquals(insights?.length, 1);
  assertEquals(insights?.[0].zoneName, "example.com");
  assertEquals(insights?.[0].recordName, "old-blog.example.com");
  assertEquals(insights?.[0].recordType, "CNAME");
});

Deno.test("listDanglingInsights - returns null (not throws, not empty array) when the insights API itself fails", async () => {
  const fetchImpl = mockFetch([
    ["/insights", () => jsonResponse({ success: false, result: null, errors: [] }, 403)],
  ]);

  const insights = await listDanglingInsights(creds, fetchImpl);

  assertEquals(insights, null);
});
