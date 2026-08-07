import { assertEquals } from "@std/assert";
import {
  evaluateHostname,
  evaluateWorker,
  hostnameCoveredByAppDomain,
} from "../../worker/modules/workers-access-exposure/evaluate.ts";
import type { AccessApplicationSummary } from "../../worker/modules/workers-access-exposure/types.ts";

function scopedApp(id: string, domain: string): AccessApplicationSummary {
  return {
    id,
    domain,
    policies: [{ decision: "allow", includesEveryone: false, hasScopedInclude: true }],
  };
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
});

Deno.test("evaluateHostname - safe when a covering app exists", () => {
  const result = evaluateHostname(
    { hostname: "billing.example.com", kind: "custom_domain" },
    [scopedApp("app-1", "billing.example.com")],
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateHostname - not_evaluated when apps could not be fetched at all", () => {
  const result = evaluateHostname({ hostname: "billing.example.com", kind: "custom_domain" }, null);
  assertEquals(result.status, "not_evaluated");
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
