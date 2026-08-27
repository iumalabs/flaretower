import { assertEquals } from "@std/assert";
import {
  buildZeroTrustInventory,
  listAccessApplications,
  listAccessGroups,
  listAccessLists,
  listIdentityProviders,
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

// specs/014-access-dashboard research.md §1
Deno.test("listAccessApplications - captures session_duration and self_hosted_domains", async () => {
  const fetchImpl = mockFetch([
    ["/access/apps", () =>
      jsonResponse({
        success: true,
        result: [
          {
            id: "app-1",
            domain: "api.example.com",
            self_hosted_domains: ["api.example.com", "api-internal.example.com"],
            session_duration: "24h",
            policies: [],
          },
          { id: "app-2", domain: "legacy.example.com", policies: [] },
        ],
        errors: [],
      })],
  ]);

  const apps = await listAccessApplications(creds, fetchImpl);

  assertEquals(apps[0].coveredHostnames, ["api.example.com", "api-internal.example.com"]);
  assertEquals(apps[0].sessionDuration, "24h");
  // Legacy single-domain app falls back to a one-element list.
  assertEquals(apps[1].coveredHostnames, ["legacy.example.com"]);
  assertEquals(apps[1].sessionDuration, null);
});

// issue #464 — Cloudflare omits `domain` for some Access application types
// (e.g. bookmark apps); this must not throw (TypeError on `.toLowerCase()`
// downstream, or D1_TYPE_ERROR binding `undefined` in routes.ts) and must
// never surface as a literal `undefined` in appDomain, appName, or
// coveredHostnames.
Deno.test("listAccessApplications - an app with no domain field falls back to a sentinel string, never undefined", async () => {
  const fetchImpl = mockFetch([
    ["/access/apps", () =>
      jsonResponse({
        success: true,
        result: [{ id: "app-1", policies: [] }],
        errors: [],
      })],
  ]);

  const apps = await listAccessApplications(creds, fetchImpl);

  assertEquals(apps.length, 1);
  assertEquals(apps[0].appDomain, "(no domain)");
  assertEquals(apps[0].appName, "(no domain)");
  assertEquals(apps[0].coveredHostnames, ["(no domain)"]);
});

Deno.test("listAccessApplications - captures the app's real name; falls back to domain when absent", async () => {
  const fetchImpl = mockFetch([
    ["/access/apps", () =>
      jsonResponse({
        success: true,
        result: [
          { id: "app-1", name: "gateway-admin", domain: "api.example.com", policies: [] },
          { id: "app-2", domain: "no-name.example.com", policies: [] },
        ],
        errors: [],
      })],
  ]);

  const apps = await listAccessApplications(creds, fetchImpl);

  assertEquals(apps[0].appName, "gateway-admin");
  assertEquals(apps[1].appName, "no-name.example.com");
});

Deno.test("listAccessApplications - policies carry their raw include/require rule arrays", async () => {
  const fetchImpl = mockFetch([
    ["/access/apps", () =>
      jsonResponse({
        success: true,
        result: [{
          id: "app-1",
          domain: "api.example.com",
          policies: [{
            decision: "allow",
            include: [{ email_domain: { domain: "example.com" } }],
            require: [{ login_method: { id: "idp-1" } }],
          }],
        }],
        errors: [],
      })],
  ]);

  const apps = await listAccessApplications(creds, fetchImpl);

  assertEquals(apps[0].policies[0].include, [{ email_domain: { domain: "example.com" } }]);
  assertEquals(apps[0].policies[0].require, [{ login_method: { id: "idp-1" } }]);
});

// specs/014-access-dashboard research.md §2
Deno.test("listIdentityProviders - maps id/name", async () => {
  const fetchImpl = mockFetch([
    ["/access/identity_providers", () =>
      jsonResponse({
        success: true,
        result: [{ id: "idp-1", name: "Okta" }],
        errors: [],
      })],
  ]);

  const providers = await listIdentityProviders(creds, fetchImpl);
  assertEquals(providers, [{ id: "idp-1", name: "Okta" }]);
});

// issue #530 — resolves an email_list/ip_list rule's id to its real name,
// same purpose as listIdentityProviders/listAccessGroups above.
Deno.test("listAccessLists - maps id/name, one endpoint for both email and IP lists", async () => {
  const fetchImpl = mockFetch([
    ["/gateway/lists", () =>
      jsonResponse({
        success: true,
        result: [{ id: "list-1", name: "Privileged Emails Rule" }],
        errors: [],
      })],
  ]);

  const lists = await listAccessLists(creds, fetchImpl);
  assertEquals(lists, [{ listId: "list-1", name: "Privileged Emails Rule" }]);
});

// specs/014-access-dashboard research.md §3
Deno.test("listAccessGroups - maps groups including their raw include rules", async () => {
  const fetchImpl = mockFetch([
    ["/access/groups", () =>
      jsonResponse({
        success: true,
        result: [{ id: "grp-1", name: "platform", include: [{ login_method: { id: "idp-1" } }] }],
        errors: [],
      })],
  ]);

  const groups = await listAccessGroups(creds, fetchImpl);
  assertEquals(groups, [{
    groupId: "grp-1",
    name: "platform",
    include: [{ login_method: { id: "idp-1" } }],
  }]);
});

Deno.test("listAccessGroups - a total failure returns null, not an empty (confirmed-zero) list", async () => {
  const fetchImpl = mockFetch([
    ["/access/groups", () => jsonResponse({ success: false, result: null, errors: [] }, 403)],
  ]);

  const groups = await listAccessGroups(creds, fetchImpl);
  assertEquals(groups, null);
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
