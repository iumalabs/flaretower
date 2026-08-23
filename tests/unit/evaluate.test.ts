import { assertEquals } from "@std/assert";
import {
  evaluateHostname,
  evaluateWorker,
  hostnameCoveredByAppDomain,
} from "../../worker/modules/workers-access-exposure/evaluate.ts";
import type { AccessApplicationSummary } from "../../worker/modules/workers-access-exposure/types.ts";

function scopedApp(id: string, domain: string, name: string = id): AccessApplicationSummary {
  return {
    id,
    name,
    domain,
    policies: [{ decision: "allow", includesEveryone: false, hasScopedInclude: true }],
  };
}

function everyoneApp(id: string, domain: string, name: string = id): AccessApplicationSummary {
  return {
    id,
    name,
    domain,
    policies: [{ decision: "allow", includesEveryone: true, hasScopedInclude: false }],
  };
}

function policylessApp(id: string, domain: string, name: string = id): AccessApplicationSummary {
  return { id, name, domain, policies: [] };
}

Deno.test("hostnameCoveredByAppDomain - exact match", () => {
  assertEquals(hostnameCoveredByAppDomain("billing.example.com", "billing.example.com"), true);
  assertEquals(hostnameCoveredByAppDomain("billing.example.com", "other.example.com"), false);
});

Deno.test("hostnameCoveredByAppDomain - path-scoped app still covers the host", () => {
  assertEquals(hostnameCoveredByAppDomain("api.example.com", "api.example.com/admin*"), true);
});

Deno.test("hostnameCoveredByAppDomain - wildcard subdomain", () => {
  assertEquals(hostnameCoveredByAppDomain("foo.example.com", "*.example.com"), true);
  // The apex itself is not covered by a *.example.com wildcard.
  assertEquals(hostnameCoveredByAppDomain("example.com", "*.example.com"), false);
  assertEquals(hostnameCoveredByAppDomain("foo.other.com", "*.example.com"), false);
});

Deno.test("hostnameCoveredByAppDomain - case insensitive", () => {
  assertEquals(hostnameCoveredByAppDomain("Billing.Example.com", "billing.example.com"), true);
});

Deno.test("evaluateHostname - critical when no app covers it", () => {
  const result = evaluateHostname(
    { hostname: "open.example.com", kind: "workers_dev" },
    [scopedApp("app-1", "other.example.com")],
  );
  assertEquals(result.status, "critical");
  // specs/023-worker-detail-page — nothing covers this hostname, so there's
  // nothing to list.
  assertEquals(result.coveringAppIds, []);
});

Deno.test("evaluateHostname - safe when a covering app exists", () => {
  const result = evaluateHostname(
    { hostname: "billing.example.com", kind: "custom_domain" },
    [scopedApp("app-1", "billing.example.com")],
  );
  assertEquals(result.status, "safe");
  assertEquals(result.coveringAppIds, ["app-1"]);
});

Deno.test("evaluateHostname - not_evaluated when apps could not be fetched at all", () => {
  const result = evaluateHostname({ hostname: "billing.example.com", kind: "custom_domain" }, null);
  assertEquals(result.status, "not_evaluated");
  assertEquals(result.coveringAppIds, []);
});

Deno.test("evaluateHostname - not_evaluated when the hostname itself has an evaluationError", () => {
  const result = evaluateHostname(
    {
      hostname: "worker.acct.workers.dev",
      kind: "workers_dev",
      evaluationError: "insufficient token scope",
    },
    [scopedApp("app-1", "worker.acct.workers.dev")],
  );
  // The per-hostname error takes priority even if an app would otherwise cover it —
  // we couldn't actually confirm coverage, so we must not claim safe.
  assertEquals(result.status, "not_evaluated");
  assertEquals(result.reason, "insufficient token scope");
  assertEquals(result.coveringAppIds, []);
});

Deno.test("evaluateHostname - warning when the covering app allows Everyone", () => {
  const result = evaluateHostname(
    { hostname: "status.example.com", kind: "custom_domain" },
    [everyoneApp("app-1", "status.example.com")],
  );
  assertEquals(result.status, "warning");
  // specs/023-worker-detail-page — a permissive covering app is still a
  // covering app; the Worker detail page needs its id to show the (weak)
  // policy in plain language, not just that the status is "warning".
  assertEquals(result.coveringAppIds, ["app-1"]);
});

Deno.test("evaluateHostname - warning when the covering app has zero policies", () => {
  const result = evaluateHostname(
    { hostname: "status.example.com", kind: "custom_domain" },
    [policylessApp("app-1", "status.example.com")],
  );
  assertEquals(result.status, "warning");
  assertEquals(result.coveringAppIds, ["app-1"]);
});

Deno.test("evaluateHostname - safe when the covering app's policy is scoped (not Everyone)", () => {
  const result = evaluateHostname(
    { hostname: "billing.example.com", kind: "custom_domain" },
    [scopedApp("app-1", "billing.example.com")],
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateHostname - a deny-Everyone policy is not 'open' (decision matters, not just includesEveryone)", () => {
  const denyEveryone: AccessApplicationSummary = {
    id: "app-1",
    name: "app-1",
    domain: "billing.example.com",
    policies: [{ decision: "deny", includesEveryone: true, hasScopedInclude: false }],
  };
  const result = evaluateHostname({ hostname: "billing.example.com", kind: "custom_domain" }, [
    denyEveryone,
  ]);
  assertEquals(result.status, "safe");
});

Deno.test("evaluateHostname - bypass policies are treated as open regardless of includes", () => {
  const bypassApp: AccessApplicationSummary = {
    id: "app-1",
    name: "app-1",
    domain: "billing.example.com",
    policies: [{ decision: "bypass", includesEveryone: false, hasScopedInclude: true }],
  };
  const result = evaluateHostname({ hostname: "billing.example.com", kind: "custom_domain" }, [
    bypassApp,
  ]);
  assertEquals(result.status, "warning");
});

// issue #466 — the reason text must read as a human-readable name, never
// the app's raw Cloudflare UUID.
Deno.test("evaluateHostname - reason text uses the covering app's name, not its raw id", () => {
  const result = evaluateHostname(
    { hostname: "billing.example.com", kind: "custom_domain" },
    [scopedApp("7f8ccc38-6277-4694-85ca-5f6ddac498ff", "billing.example.com", "gateway-admin")],
  );
  assertEquals(result.status, "safe");
  assertEquals(result.reason, "covered by Access application(s): gateway-admin");

  const open = evaluateHostname(
    { hostname: "status.example.com", kind: "custom_domain" },
    [everyoneApp("7f8ccc38-6277-4694-85ca-5f6ddac498ff", "status.example.com", "gateway-admin")],
  );
  assertEquals(
    open.reason,
    "covering Access application(s) do not meaningfully restrict access: " +
      "gateway-admin has a policy that allows Everyone",
  );
});

Deno.test("evaluateWorker - hostnames on the same Worker are evaluated independently", () => {
  const result = evaluateWorker(
    {
      workerName: "billing-api",
      hostnames: [
        { hostname: "billing.example.com", kind: "custom_domain" },
        { hostname: "billing-api.acct.workers.dev", kind: "workers_dev" },
      ],
    },
    [scopedApp("app-1", "billing.example.com")],
  );

  const customDomain = result.hostnames.find((h) => h.kind === "custom_domain");
  const workersDev = result.hostnames.find((h) => h.kind === "workers_dev");

  assertEquals(customDomain?.status, "safe");
  assertEquals(workersDev?.status, "critical");
});
