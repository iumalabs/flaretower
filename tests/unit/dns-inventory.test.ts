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
            ttl: 1,
          },
          {
            name: "example.com",
            type: "MX",
            content: "10 mail.example.com",
            proxiable: false,
            ttl: 3600,
          },
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
  // specs/013-dns-dashboard/research.md §1 — ttl is already in this same
  // response, just newly captured.
  assertEquals(aRecord?.ttl, 1);
  const mxRecord = zones[0].records.find((r) => r.recordType === "MX");
  assertEquals(mxRecord?.proxyCapable, false);
  assertEquals(mxRecord?.proxied, null);
  assertEquals(mxRecord?.ttl, 3600);
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

Deno.test("buildDnsInventory - a total zone-list failure degrades to a sentinel not_evaluated zone, not an uncaught throw (T028)", async () => {
  const fetchImpl = mockFetch([
    [
      "/zones",
      () =>
        jsonResponse(
          {
            success: false,
            result: null,
            errors: [{ code: 9109, message: "Invalid access token" }],
          },
          403,
        ),
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
        result: {
          issues: [
            {
              issue_type: "dangling_dns_cname",
              subject: "old-blog.example.com",
              resolve_text: "target no longer exists",
            },
            {
              issue_type: "missing_dmarc_record", // unrelated insight type — must be filtered out
              subject: "example.com",
            },
          ],
        },
        errors: [],
      })],
  ]);

  const insights = await listDanglingInsights(creds, fetchImpl);

  assertEquals(insights?.length, 1);
  assertEquals(insights?.[0].recordName, "old-blog.example.com");
  assertEquals(insights?.[0].recordType, "CNAME");
  assertEquals(insights?.[0].reason, "target no longer exists");
});

Deno.test("listDanglingInsights - returns null (not throws, not empty array) when the insights API itself fails", async () => {
  const fetchImpl = mockFetch([
    ["/insights", () => jsonResponse({ success: false, result: null, errors: [] }, 403)],
  ]);

  const insights = await listDanglingInsights(creds, fetchImpl);

  assertEquals(insights, null);
});
