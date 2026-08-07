import { assertEquals } from "@std/assert";
import {
  evaluateCustomDomain,
  evaluateDeployment,
  evaluateSubdomainExposure,
} from "../../worker/modules/pages/evaluate.ts";
import type { PagesProjectInventoryItem } from "../../worker/modules/pages/types.ts";

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

Deno.test("evaluateSubdomainExposure - US1 stub always returns not_evaluated (US2 implements the real check)", () => {
  const result = evaluateSubdomainExposure(project());
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateDeployment - US1 stub always returns not_evaluated (US3 implements the real check)", () => {
  const result = evaluateDeployment("marketing-site", null);
  assertEquals(result.status, "not_evaluated");
});
