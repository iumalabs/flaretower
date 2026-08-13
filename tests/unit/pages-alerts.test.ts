import { assertEquals } from "@std/assert";
import {
  diffForDeploymentAlerts,
  diffForDomainAlerts,
  diffForSubdomainAlerts,
  domainKey,
} from "../../worker/modules/pages/alerts.ts";
import type {
  DeploymentEvaluation,
  DomainEvaluation,
  SubdomainEvaluation,
} from "../../worker/modules/pages/types.ts";

function domainResult(status: DomainEvaluation["status"]): DomainEvaluation[] {
  return [{ projectName: "marketing-site", domainName: "example.com", status, reason: "test" }];
}

function subdomainResult(status: SubdomainEvaluation["status"]): SubdomainEvaluation[] {
  return [{
    projectName: "marketing-site",
    subdomain: "marketing-site.pages.dev",
    status,
    reason: "test",
    productionBranch: "main",
  }];
}

function deploymentResult(status: DeploymentEvaluation["status"]): DeploymentEvaluation[] {
  return [{
    projectName: "marketing-site",
    deploymentId: "dep-1",
    status,
    reason: "test",
    createdAt: "2026-08-13T00:00:00Z",
  }];
}

Deno.test("diffForDomainAlerts - first-ever warning alerts (no grace period)", () => {
  const alerts = diffForDomainAlerts(domainResult("warning"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, null);
});

Deno.test("diffForDomainAlerts - first-ever safe does not alert", () => {
  const alerts = diffForDomainAlerts(domainResult("safe"), new Map());
  assertEquals(alerts.length, 0);
});

Deno.test("diffForDomainAlerts - unchanged warning across two runs does not repeat-alert", () => {
  const previous = new Map([[domainKey("marketing-site", "example.com"), "warning" as const]]);
  const alerts = diffForDomainAlerts(domainResult("warning"), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForDomainAlerts - a transition from safe to warning alerts", () => {
  const previous = new Map([[domainKey("marketing-site", "example.com"), "safe" as const]]);
  const alerts = diffForDomainAlerts(domainResult("warning"), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, "safe");
});

Deno.test("diffForDomainAlerts - same domain name on a different project is a distinct identity", () => {
  const previous = new Map([[domainKey("other-project", "example.com"), "warning" as const]]);
  const alerts = diffForDomainAlerts(domainResult("warning"), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, null);
});

Deno.test("diffForSubdomainAlerts - first-ever critical alerts (no grace period)", () => {
  const alerts = diffForSubdomainAlerts(subdomainResult("critical"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].newStatus, "critical");
});

Deno.test("diffForSubdomainAlerts - unchanged critical does not repeat-alert", () => {
  const previous = new Map([["marketing-site", "critical" as const]]);
  const alerts = diffForSubdomainAlerts(subdomainResult("critical"), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForSubdomainAlerts - a transition from warning to critical alerts", () => {
  const previous = new Map([["marketing-site", "warning" as const]]);
  const alerts = diffForSubdomainAlerts(subdomainResult("critical"), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, "warning");
  assertEquals(alerts[0].newStatus, "critical");
});

Deno.test("diffForSubdomainAlerts - not_evaluated is never alert-worthy", () => {
  const alerts = diffForSubdomainAlerts(subdomainResult("not_evaluated"), new Map());
  assertEquals(alerts.length, 0);
});

Deno.test("diffForDeploymentAlerts - first-ever warning alerts (no grace period)", () => {
  const alerts = diffForDeploymentAlerts(deploymentResult("warning"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, null);
});

Deno.test("diffForDeploymentAlerts - unchanged warning across two runs does not repeat-alert", () => {
  const previous = new Map([["marketing-site", "warning" as const]]);
  const alerts = diffForDeploymentAlerts(deploymentResult("warning"), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForDeploymentAlerts - a transition from safe to warning alerts", () => {
  const previous = new Map([["marketing-site", "safe" as const]]);
  const alerts = diffForDeploymentAlerts(deploymentResult("warning"), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, "safe");
});

Deno.test("diffForDomainAlerts, diffForSubdomainAlerts, diffForDeploymentAlerts operate on independent identity spaces", () => {
  const previous = new Map([["marketing-site", "warning" as const]]);
  // A subdomain/deployment previous-status map entry keyed "marketing-site"
  // must not be mistaken for a domain-alert match keyed by domainKey(...).
  const domainAlerts = diffForDomainAlerts(domainResult("warning"), previous);
  assertEquals(domainAlerts.length, 1);
  assertEquals(domainAlerts[0].previousStatus, null);
});
