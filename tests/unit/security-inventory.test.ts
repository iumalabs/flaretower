import { assertEquals } from "@std/assert";
import {
  buildSecurityInventory,
  getZoneCertificatePacks,
  getZoneCustomWafRules,
  getZoneDnssecStatus,
  getZoneHasEnabledRateLimitingRule,
  getZoneHasEnabledWafRule,
  getZoneSetting,
  getZoneSslSetting,
  listTurnstileWidgets,
  listZones,
} from "../../worker/modules/security/inventory.ts";

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

Deno.test("listZones - maps zone id and name", async () => {
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
  ]);

  const zones = await listZones(creds, fetchImpl);

  assertEquals(zones, [{ id: "zone-1", name: "example.com" }]);
});

Deno.test("getZoneSslSetting - returns the raw mode value", async () => {
  const fetchImpl = mockFetch([
    [
      "/settings/ssl",
      () => jsonResponse({ success: true, result: { value: "flexible" }, errors: [] }),
    ],
  ]);

  const mode = await getZoneSslSetting(creds, "zone-1", fetchImpl);

  assertEquals(mode, "flexible");
});

// specs/017-security-dashboard research.md §3 — same generic per-setting
// endpoint as getZoneSslSetting(), parameterized by setting id.
Deno.test("getZoneSetting - returns the raw value for bot_fight_mode", async () => {
  const fetchImpl = mockFetch([
    [
      "/settings/bot_fight_mode",
      () => jsonResponse({ success: true, result: { value: "on" }, errors: [] }),
    ],
  ]);

  const value = await getZoneSetting(creds, "zone-1", "bot_fight_mode", fetchImpl);

  assertEquals(value, "on");
});

Deno.test("getZoneSetting - returns the raw value for min_tls_version", async () => {
  const fetchImpl = mockFetch([
    [
      "/settings/min_tls_version",
      () => jsonResponse({ success: true, result: { value: "1.0" }, errors: [] }),
    ],
  ]);

  const value = await getZoneSetting(creds, "zone-1", "min_tls_version", fetchImpl);

  assertEquals(value, "1.0");
});

Deno.test("getZoneDnssecStatus - returns the raw status value", async () => {
  const fetchImpl = mockFetch([
    ["/dnssec", () => jsonResponse({ success: true, result: { status: "active" }, errors: [] })],
  ]);

  const status = await getZoneDnssecStatus(creds, "zone-1", fetchImpl);

  assertEquals(status, "active");
});

Deno.test("getZoneHasEnabledWafRule - true when the entrypoint has an enabled rule", async () => {
  const fetchImpl = mockFetch([
    [
      "/http_request_firewall_managed/entrypoint",
      () => jsonResponse({ success: true, result: { rules: [{ enabled: true }] }, errors: [] }),
    ],
  ]);

  const hasRule = await getZoneHasEnabledWafRule(creds, "zone-1", fetchImpl);

  assertEquals(hasRule, true);
});

Deno.test("getZoneHasEnabledWafRule - false when the entrypoint 404s (no ruleset deployed)", async () => {
  const fetchImpl = mockFetch([
    ["/http_request_firewall_managed/entrypoint", () => new Response("not found", { status: 404 })],
  ]);

  const hasRule = await getZoneHasEnabledWafRule(creds, "zone-1", fetchImpl);

  assertEquals(hasRule, false);
});

Deno.test("getZoneHasEnabledWafRule - false when the entrypoint exists but every rule is disabled", async () => {
  const fetchImpl = mockFetch([
    [
      "/http_request_firewall_managed/entrypoint",
      () => jsonResponse({ success: true, result: { rules: [{ enabled: false }] }, errors: [] }),
    ],
  ]);

  const hasRule = await getZoneHasEnabledWafRule(creds, "zone-1", fetchImpl);

  assertEquals(hasRule, false);
});

Deno.test("getZoneHasEnabledRateLimitingRule - true when the entrypoint has an enabled rule", async () => {
  const fetchImpl = mockFetch([
    [
      "/http_ratelimit/entrypoint",
      () => jsonResponse({ success: true, result: { rules: [{ enabled: true }] }, errors: [] }),
    ],
  ]);

  const hasRule = await getZoneHasEnabledRateLimitingRule(creds, "zone-1", fetchImpl);

  assertEquals(hasRule, true);
});

// specs/017-security-dashboard research.md §5
Deno.test("getZoneCertificatePacks - flattens every pack's certificates, carrying the pack's own status", async () => {
  const fetchImpl = mockFetch([
    ["/ssl/certificate_packs", () =>
      jsonResponse({
        success: true,
        result: [
          {
            status: "active",
            certificates: [
              {
                hosts: ["example.com"],
                issuer: "Let's Encrypt",
                expires_on: "2026-10-01T00:00:00Z",
              },
            ],
          },
          {
            status: "pending_validation",
            certificates: [
              {
                hosts: ["example.com"],
                issuer: "Google Trust",
                expires_on: "2026-11-01T00:00:00Z",
              },
            ],
          },
        ],
        errors: [],
      })],
  ]);

  const certs = await getZoneCertificatePacks(creds, "zone-1", fetchImpl);

  assertEquals(certs.length, 2);
  assertEquals(certs[0].packStatus, "active");
  assertEquals(certs[1].packStatus, "pending_validation");
});

// specs/017-security-dashboard research.md §6
Deno.test("getZoneCustomWafRules - maps description/expression/action/enabled", async () => {
  const fetchImpl = mockFetch([
    ["/rulesets/phases/http_request_firewall_custom/entrypoint", () =>
      jsonResponse({
        success: true,
        result: {
          rules: [
            {
              description: "block-admin-paths",
              expression: 'http.request.uri.path contains "/admin"',
              action: "block",
              enabled: true,
            },
          ],
        },
        errors: [],
      })],
  ]);

  const rules = await getZoneCustomWafRules(creds, "zone-1", fetchImpl);

  assertEquals(rules, [{
    description: "block-admin-paths",
    expression: 'http.request.uri.path contains "/admin"',
    action: "block",
    enabled: true,
  }]);
});

Deno.test("getZoneCustomWafRules - a 404 (no custom ruleset deployed) yields zero rules, not an error", async () => {
  const fetchImpl = mockFetch([
    [
      "/rulesets/phases/http_request_firewall_custom/entrypoint",
      () => new Response(null, { status: 404 }),
    ],
  ]);

  const rules = await getZoneCustomWafRules(creds, "zone-1", fetchImpl);

  assertEquals(rules, []);
});

Deno.test("listTurnstileWidgets - maps sitekey, name, domains", async () => {
  const fetchImpl = mockFetch([
    ["/challenges/widgets", () =>
      jsonResponse({
        success: true,
        result: [{ sitekey: "0x123", name: "login", domains: ["example.com"] }],
        errors: [],
      })],
  ]);

  const widgets = await listTurnstileWidgets(creds, fetchImpl);

  assertEquals(widgets, [{ sitekey: "0x123", name: "login", domains: ["example.com"] }]);
});

Deno.test("buildSecurityInventory - every zone's four checks and every Turnstile widget are enumerated, none omitted", async () => {
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
    [
      "/settings/ssl",
      () => jsonResponse({ success: true, result: { value: "strict" }, errors: [] }),
    ],
    ["/dnssec", () => jsonResponse({ success: true, result: { status: "active" }, errors: [] })],
    ["/http_request_firewall_managed/entrypoint", () => new Response("not found", { status: 404 })],
    ["/http_ratelimit/entrypoint", () => new Response("not found", { status: 404 })],
    [
      "/challenges/widgets",
      () =>
        jsonResponse({
          success: true,
          result: [{ sitekey: "0x123", name: "login", domains: [] }],
          errors: [],
        }),
    ],
  ]);

  const inventory = await buildSecurityInventory(creds, fetchImpl);

  assertEquals(inventory.zones.length, 1);
  assertEquals(inventory.zones[0].sslTls.mode, "strict");
  assertEquals(inventory.zones[0].dnssec.status, "active");
  assertEquals(inventory.zones[0].waf.hasEnabledRule, false);
  assertEquals(inventory.zones[0].rateLimiting.hasEnabledRule, false);
  assertEquals(inventory.turnstileWidgets?.length, 1);
});

Deno.test("buildSecurityInventory - a total failure to list zones surfaces a sentinel entry, not an empty (confirmed-zero) list", async () => {
  const fetchImpl = mockFetch([
    ["/zones", () => jsonResponse({ success: false, result: null, errors: [] }, 403)],
    ["/challenges/widgets", () => jsonResponse({ success: true, result: [], errors: [] })],
  ]);

  const inventory = await buildSecurityInventory(creds, fetchImpl);

  assertEquals(inventory.zones.length, 1);
  assertEquals(typeof inventory.zones[0].evaluationError, "string");
});

Deno.test("buildSecurityInventory - a per-check fetch failure is scoped to that check, the other three unaffected", async () => {
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
    ["/settings/ssl", () => jsonResponse({ success: false, result: null, errors: [] }, 500)],
    ["/dnssec", () => jsonResponse({ success: true, result: { status: "active" }, errors: [] })],
    ["/http_request_firewall_managed/entrypoint", () => new Response("not found", { status: 404 })],
    ["/http_ratelimit/entrypoint", () => new Response("not found", { status: 404 })],
    ["/challenges/widgets", () => jsonResponse({ success: true, result: [], errors: [] })],
  ]);

  const inventory = await buildSecurityInventory(creds, fetchImpl);

  assertEquals(typeof inventory.zones[0].sslTls.evaluationError, "string");
  assertEquals(inventory.zones[0].dnssec.evaluationError, undefined);
  assertEquals(inventory.zones[0].dnssec.status, "active");
});

Deno.test("buildSecurityInventory - a total failure to list Turnstile widgets yields null, not an empty (confirmed-zero) list", async () => {
  const fetchImpl = mockFetch([
    ["/zones", () => jsonResponse({ success: true, result: [], errors: [] })],
    ["/challenges/widgets", () => jsonResponse({ success: false, result: null, errors: [] }, 500)],
  ]);

  const inventory = await buildSecurityInventory(creds, fetchImpl);

  assertEquals(inventory.turnstileWidgets, null);
});
