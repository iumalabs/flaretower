import { assertEquals } from "@std/assert";
import {
  buildZeroTrustInventory,
  listAccessApplications,
  listServiceTokens,
} from "../../worker/modules/zero-trust/inventory.ts";

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

Deno.test("listAccessApplications - maps apps and policies, including a zero-policy app", async () => {
  const fetchImpl = mockFetch([
    ["/access/apps", () =>
      jsonResponse({
        success: true,
        result: [
          {
            id: "app-1",
            domain: "internal.example.com",
            policies: [{
              decision: "allow",
              include: [{ email_domain: { domain: "example.com" } }],
            }],
          },
          { id: "app-2", domain: "no-policy.example.com", policies: [] },
        ],
        errors: [],
      })],
  ]);

  const apps = await listAccessApplications(creds, fetchImpl);

  assertEquals(apps.length, 2);
  assertEquals(apps[0].policies.length, 1);
  assertEquals(apps[0].policies[0].hasScopedInclude, true);
  assertEquals(apps[1].policies, []);
});

Deno.test("listServiceTokens - maps tokens, including one with no expires_at", async () => {
  const fetchImpl = mockFetch([
    ["/access/service_tokens", () =>
      jsonResponse({
        success: true,
        result: [
          { id: "tok-1", name: "ci-token", expires_at: "2026-09-01T00:00:00Z" },
          { id: "tok-2", name: "no-expiry-token" },
        ],
        errors: [],
      })],
  ]);

  const tokens = await listServiceTokens(creds, fetchImpl);

  assertEquals(tokens.length, 2);
  assertEquals(tokens[0].expiresAt, "2026-09-01T00:00:00Z");
  assertEquals(tokens[1].expiresAt, null);
});

Deno.test("buildZeroTrustInventory - a total failure to list applications surfaces a sentinel entry, not an empty (confirmed-safe-looking) list", async () => {
  const fetchImpl = mockFetch([
    ["/access/apps", () => jsonResponse({ success: false, result: null, errors: [] }, 403)],
    ["/access/service_tokens", () => jsonResponse({ success: true, result: [], errors: [] })],
  ]);

  const inventory = await buildZeroTrustInventory(creds, fetchImpl);

  assertEquals(inventory.applications.length, 1);
  assertEquals(typeof inventory.applications[0].evaluationError, "string");
  assertEquals(inventory.serviceTokens, []);
});

Deno.test("buildZeroTrustInventory - applications and service tokens fail independently", async () => {
  const fetchImpl = mockFetch([
    [
      "/access/apps",
      () =>
        jsonResponse({
          success: true,
          result: [{ id: "app-1", domain: "a.example.com", policies: [] }],
          errors: [],
        }),
    ],
    [
      "/access/service_tokens",
      () => jsonResponse({ success: false, result: null, errors: [] }, 500),
    ],
  ]);

  const inventory = await buildZeroTrustInventory(creds, fetchImpl);

  assertEquals(inventory.applications.length, 1);
  assertEquals(inventory.applications[0].evaluationError, undefined);
  assertEquals(inventory.serviceTokens.length, 1);
  assertEquals(typeof inventory.serviceTokens[0].evaluationError, "string");
});
