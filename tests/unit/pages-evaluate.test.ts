import { assertEquals } from "@std/assert";
import {
  evaluateCustomDomain,
  evaluateDeployment,
  evaluateSubdomainExposure,
} from "../../worker/modules/pages/evaluate.ts";
import type {
  AccessApplication,
  PagesProjectInventoryItem,
} from "../../worker/modules/pages/types.ts";

Deno.test("evaluateCustomDomain - safe when the domain is active", () => {
  const result = evaluateCustomDomain("marketing-site", {
    domainName: "example.com",
    status: "active",
  });
  assertEquals(result.status, "safe");
});

Deno.test("evaluateCustomDomain - warning when the domain is not active", () => {
  const result = evaluateCustomDomain("marketing-site", {
    domainName: "example.com",
    status: "pending",
  });
  assertEquals(result.status, "warning");
});

Deno.test("evaluateCustomDomain - warning for every non-active status, e.g. error", () => {
  const result = evaluateCustomDomain("marketing-site", {
    domainName: "example.com",
    status: "error",
  });
  assertEquals(result.status, "warning");
});

Deno.test("evaluateCustomDomain - not_evaluated when the domain has an evaluationError", () => {
  const result = evaluateCustomDomain("marketing-site", {
    domainName: "example.com",
    status: "active",
    evaluationError: "could not list custom domains",
  });
  assertEquals(result.status, "not_evaluated");
});

function project(overrides: Partial<PagesProjectInventoryItem> = {}): PagesProjectInventoryItem {
  return {
    projectName: "marketing-site",
    subdomain: "marketing-site.pages.dev",
    customDomains: [],
    latestProductionDeployment: null,
    ...overrides,
  };
}

function scopedApp(appId: string, appDomain: string): AccessApplication {
  return {
    appId,
    appDomain,
    policies: [{ decision: "allow", includesEveryone: false, hasScopedInclude: true }],
  };
}

function everyoneApp(appId: string, appDomain: string): AccessApplication {
  return {
    appId,
    appDomain,
    policies: [{ decision: "allow", includesEveryone: true, hasScopedInclude: false }],
  };
}

Deno.test("evaluateSubdomainExposure - critical when no Access application covers the pages.dev subdomain", () => {
  const result = evaluateSubdomainExposure(
    project(),
    [scopedApp("app-1", "other.pages.dev")],
  );
  assertEquals(result.status, "critical");
});

Deno.test("evaluateSubdomainExposure - safe when covered by a scoped-policy application", () => {
  const result = evaluateSubdomainExposure(
    project(),
    [scopedApp("app-1", "marketing-site.pages.dev")],
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateSubdomainExposure - warning when covered by an Allow-Everyone application", () => {
  const result = evaluateSubdomainExposure(
    project(),
    [everyoneApp("app-1", "marketing-site.pages.dev")],
  );
  assertEquals(result.status, "warning");
});

Deno.test("evaluateSubdomainExposure - warning when the covering application has zero policies", () => {
  const result = evaluateSubdomainExposure(
    project(),
    [{ appId: "app-1", appDomain: "marketing-site.pages.dev", policies: [] }],
  );
  assertEquals(result.status, "warning");
});

Deno.test("evaluateSubdomainExposure - not_evaluated when the Access applications list could not be fetched at all", () => {
  const result = evaluateSubdomainExposure(project(), null);
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateSubdomainExposure - a deny-Everyone policy is not 'open' (decision matters, not just includesEveryone)", () => {
  const result = evaluateSubdomainExposure(
    project(),
    [{
      appId: "app-1",
      appDomain: "marketing-site.pages.dev",
      policies: [{ decision: "deny", includesEveryone: true, hasScopedInclude: false }],
    }],
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateDeployment - US1 stub always returns not_evaluated (US3 implements the real check)", () => {
  const result = evaluateDeployment("marketing-site", null);
  assertEquals(result.status, "not_evaluated");
});
