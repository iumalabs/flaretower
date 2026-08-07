import { assertEquals } from "@std/assert";
import { buildWorkerInventory } from "../../worker/modules/workers-access-exposure/inventory.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Matched by pathname *suffix*, most-specific entries first, so e.g. the
// scripts-list endpoint ("/workers/scripts") doesn't shadow the per-script
// subdomain endpoint ("/workers/scripts/{name}/subdomain").
function mockFetch(
  handlers: Array<[string, () => Response]>,
): typeof fetch {
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

Deno.test("buildWorkerInventory - custom domain and workers.dev hostnames are both included", async () => {
  const fetchImpl = mockFetch([
    [
      "/scripts/billing-api/subdomain",
      () =>
        jsonResponse({
          success: true,
          result: { enabled: true, previews_enabled: false },
          errors: [],
        }),
    ],
    [
      "/workers/scripts",
      () => jsonResponse({ success: true, result: [{ id: "billing-api" }], errors: [] }),
    ],
    ["/workers/domains", () =>
      jsonResponse({
        success: true,
        result: [{ hostname: "billing.example.com", service: "billing-api" }],
        errors: [],
      })],
    [
      "/workers/subdomain",
      () => jsonResponse({ success: true, result: { subdomain: "acct" }, errors: [] }),
    ],
  ]);

  const inventory = await buildWorkerInventory(creds, fetchImpl);

  assertEquals(inventory.length, 1);
  assertEquals(inventory[0].workerName, "billing-api");
  const kinds = inventory[0].hostnames.map((h) => h.kind).sort();
  assertEquals(kinds, ["custom_domain", "workers_dev"]);
});

Deno.test("buildWorkerInventory - a failed per-script subdomain check produces evaluationError, not omission", async () => {
  const fetchImpl = mockFetch([
    [
      "/scripts/flaky-worker/subdomain",
      () => jsonResponse({ success: false, result: null, errors: [] }, 429),
    ],
    [
      "/workers/scripts",
      () => jsonResponse({ success: true, result: [{ id: "flaky-worker" }], errors: [] }),
    ],
    ["/workers/domains", () => jsonResponse({ success: true, result: [], errors: [] })],
    [
      "/workers/subdomain",
      () => jsonResponse({ success: true, result: { subdomain: "acct" }, errors: [] }),
    ],
  ]);

  const inventory = await buildWorkerInventory(creds, fetchImpl);

  assertEquals(inventory.length, 1);
  assertEquals(inventory[0].hostnames.length, 1);
  assertEquals(inventory[0].hostnames[0].kind, "workers_dev");
  assertEquals(typeof inventory[0].hostnames[0].evaluationError, "string");
});

Deno.test("buildWorkerInventory - a Worker with no reachable hostnames still appears with an empty list", async () => {
  const fetchImpl = mockFetch([
    [
      "/workers/scripts",
      () => jsonResponse({ success: true, result: [{ id: "private-worker" }], errors: [] }),
    ],
    ["/workers/domains", () => jsonResponse({ success: true, result: [], errors: [] })],
    ["/workers/subdomain", () => jsonResponse({ success: false, result: null, errors: [] }, 404)],
  ]);

  const inventory = await buildWorkerInventory(creds, fetchImpl);

  assertEquals(inventory.length, 1);
  assertEquals(inventory[0].hostnames, []);
});
