import { assertEquals } from "@std/assert";
import {
  diffForDeploymentAlerts,
  diffForDomainAlerts,
  diffForSubdomainAlerts,
  domainKey,
  type DomainOpenAlert,
  type OpenAlert,
  resolveForDeploymentAlerts,
  resolveForDomainAlerts,
  resolveForSubdomainAlerts,
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

// issue #481 — resolveFor*Alerts (the auto-resolve counterpart to
// diffFor*Alerts above): an open alert whose entity has recovered to
// "safe" in the run that just completed should resolve; not_evaluated/
// still-open entities, and alerts for entities outside this run, must not.
function domainOpenAlert(id: string, projectName: string, domainName: string): DomainOpenAlert {
  return { id, projectName, domainName };
}

function openAlert(id: string, projectName: string): OpenAlert {
  return { id, projectName };
}

Deno.test("resolveForDomainAlerts - a domain back to safe resolves its open alert", () => {
  const resolved = resolveForDomainAlerts(
    domainResult("safe"),
    [domainOpenAlert("a1", "marketing-site", "example.com")],
  );
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForDomainAlerts - still warning does not resolve", () => {
  const resolved = resolveForDomainAlerts(
    domainResult("warning"),
    [domainOpenAlert("a1", "marketing-site", "example.com")],
  );
  assertEquals(resolved, []);
});

Deno.test("resolveForDomainAlerts - not_evaluated does not resolve (never fabricate a clean state)", () => {
  const resolved = resolveForDomainAlerts(
    domainResult("not_evaluated"),
    [domainOpenAlert("a1", "marketing-site", "example.com")],
  );
  assertEquals(resolved, []);
});

Deno.test("resolveForDomainAlerts - a domain absent from this run's results does not resolve", () => {
  const resolved = resolveForDomainAlerts([], [
    domainOpenAlert("a1", "marketing-site", "example.com"),
  ]);
  assertEquals(resolved, []);
});

Deno.test("resolveForDomainAlerts - same domain name on a different project does not resolve (distinct identity)", () => {
  const resolved = resolveForDomainAlerts(
    domainResult("safe"),
    [domainOpenAlert("a1", "other-project", "example.com")],
  );
  assertEquals(resolved, []);
});

Deno.test("resolveForDomainAlerts - only the recovered domain's alert resolves, others stay open", () => {
  const results: DomainEvaluation[] = [
    { projectName: "marketing-site", domainName: "example.com", status: "safe", reason: "test" },
    { projectName: "docs-site", domainName: "docs.example.com", status: "warning", reason: "test" },
  ];
  const resolved = resolveForDomainAlerts(results, [
    domainOpenAlert("a1", "marketing-site", "example.com"),
    domainOpenAlert("a2", "docs-site", "docs.example.com"),
  ]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForDomainAlerts - no open alerts means nothing to resolve", () => {
  const resolved = resolveForDomainAlerts(domainResult("safe"), []);
  assertEquals(resolved, []);
});

Deno.test("resolveForSubdomainAlerts - a project back to safe resolves its open alert", () => {
  const resolved = resolveForSubdomainAlerts(subdomainResult("safe"), [
    openAlert("a1", "marketing-site"),
  ]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForSubdomainAlerts - still critical does not resolve", () => {
  const resolved = resolveForSubdomainAlerts(subdomainResult("critical"), [
    openAlert("a1", "marketing-site"),
  ]);
  assertEquals(resolved, []);
});

Deno.test("resolveForSubdomainAlerts - not_evaluated does not resolve", () => {
  const resolved = resolveForSubdomainAlerts(subdomainResult("not_evaluated"), [
    openAlert("a1", "marketing-site"),
  ]);
  assertEquals(resolved, []);
});

Deno.test("resolveForSubdomainAlerts - a project absent from this run's results does not resolve", () => {
  const resolved = resolveForSubdomainAlerts([], [openAlert("a1", "marketing-site")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForSubdomainAlerts - no open alerts means nothing to resolve", () => {
  const resolved = resolveForSubdomainAlerts(subdomainResult("safe"), []);
  assertEquals(resolved, []);
});

Deno.test("resolveForDeploymentAlerts - a project back to safe resolves its open alert", () => {
  const resolved = resolveForDeploymentAlerts(deploymentResult("safe"), [
    openAlert("a1", "marketing-site"),
  ]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForDeploymentAlerts - still warning does not resolve", () => {
  const resolved = resolveForDeploymentAlerts(deploymentResult("warning"), [
    openAlert("a1", "marketing-site"),
  ]);
  assertEquals(resolved, []);
});

Deno.test("resolveForDeploymentAlerts - not_evaluated does not resolve", () => {
  const resolved = resolveForDeploymentAlerts(deploymentResult("not_evaluated"), [
    openAlert("a1", "marketing-site"),
  ]);
  assertEquals(resolved, []);
});

Deno.test("resolveForDeploymentAlerts - a project absent from this run's results does not resolve", () => {
  const resolved = resolveForDeploymentAlerts([], [openAlert("a1", "marketing-site")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForDeploymentAlerts - no open alerts means nothing to resolve", () => {
  const resolved = resolveForDeploymentAlerts(deploymentResult("safe"), []);
  assertEquals(resolved, []);
});
