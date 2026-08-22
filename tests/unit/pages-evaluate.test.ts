import { assertEquals } from "@std/assert";
import {
  evaluateCustomDomain,
  evaluateDeployment,
  evaluateDeployments,
  evaluateDomainAccess,
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

Deno.test("evaluateSubdomainExposure - not_evaluated when the project itself is a sentinel entry (projects list failed entirely), takes priority over apps", () => {
  const result = evaluateSubdomainExposure(
    project({ evaluationError: "could not list Pages projects: network error" }),
    [scopedApp("app-1", "marketing-site.pages.dev")],
  );
  assertEquals(result.status, "not_evaluated");
});

// issue #457
Deno.test("evaluateDomainAccess - not_evaluated (never critical) when no Access application covers the domain", () => {
  const result = evaluateDomainAccess(
    "marketing-site",
    { domainName: "example.com", status: "active" },
    [scopedApp("app-1", "other.example.com")],
  );
  assertEquals(result.status, "not_evaluated");
  assertEquals(result.coveringAppId, null);
});

Deno.test("evaluateDomainAccess - safe with the covering app's id when covered by a scoped-policy application", () => {
  const result = evaluateDomainAccess(
    "marketing-site",
    { domainName: "example.com", status: "active" },
    [scopedApp("app-1", "example.com")],
  );
  assertEquals(result.status, "safe");
  assertEquals(result.coveringAppId, "app-1");
});

Deno.test("evaluateDomainAccess - warning when covered by an Allow-Everyone application", () => {
  const result = evaluateDomainAccess(
    "marketing-site",
    { domainName: "example.com", status: "active" },
    [everyoneApp("app-1", "example.com")],
  );
  assertEquals(result.status, "warning");
  assertEquals(result.coveringAppId, null);
});

Deno.test("evaluateDomainAccess - warning when the covering application has zero policies", () => {
  const result = evaluateDomainAccess(
    "marketing-site",
    { domainName: "example.com", status: "active" },
    [{ appId: "app-1", appDomain: "example.com", policies: [] }],
  );
  assertEquals(result.status, "warning");
});

Deno.test("evaluateDomainAccess - not_evaluated when the Access applications list could not be fetched at all", () => {
  const result = evaluateDomainAccess(
    "marketing-site",
    { domainName: "example.com", status: "active" },
    null,
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateDomainAccess - not_evaluated when the domain itself has an evaluationError, takes priority over apps", () => {
  const result = evaluateDomainAccess(
    "marketing-site",
    {
      domainName: "example.com",
      status: "active",
      evaluationError: "could not list custom domains",
    },
    [scopedApp("app-1", "example.com")],
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateDeployments - not_evaluated for a sentinel project, not a false 'no production deployment' warning", () => {
  const results = evaluateDeployments([
    project({ evaluationError: "could not list Pages projects: network error" }),
  ]);
  assertEquals(results[0].status, "not_evaluated");
});

Deno.test("evaluateDeployment - warning when no production deployment exists yet", () => {
  const result = evaluateDeployment("marketing-site", null);
  assertEquals(result.status, "warning");
  assertEquals(result.reason, "no production deployment exists yet");
});

Deno.test("evaluateDeployment - safe when the latest production deployment succeeded", () => {
  const result = evaluateDeployment("marketing-site", { deploymentId: "dep-1", status: "success" });
  assertEquals(result.status, "safe");
});

Deno.test("evaluateDeployment - warning when the latest production deployment failed", () => {
  const result = evaluateDeployment("marketing-site", { deploymentId: "dep-1", status: "failure" });
  assertEquals(result.status, "warning");
});

Deno.test("evaluateDeployment - warning for any other non-success terminal status, e.g. canceled", () => {
  const result = evaluateDeployment("marketing-site", {
    deploymentId: "dep-1",
    status: "canceled",
  });
  assertEquals(result.status, "warning");
});

Deno.test("evaluateDeployment - not_evaluated when the deployment has an evaluationError", () => {
  const result = evaluateDeployment("marketing-site", {
    deploymentId: "(unavailable)",
    status: "(unavailable)",
    evaluationError: "could not list deployments",
  });
  assertEquals(result.status, "not_evaluated");
});
