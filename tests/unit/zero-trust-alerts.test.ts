import { assertEquals } from "@std/assert";
import {
  diffForAppAlerts,
  diffForTokenAlerts,
  type OpenAppAlert,
  type OpenTokenAlert,
  resolveForAppAlerts,
  resolveForTokenAlerts,
} from "../../worker/modules/zero-trust/alerts.ts";
import type { AppEvaluation, TokenEvaluation } from "../../worker/modules/zero-trust/types.ts";

function appResult(status: AppEvaluation["status"]): AppEvaluation[] {
  return [{
    appId: "app-1",
    appName: "test-app",
    appDomain: "example.com",
    status,
    reason: "test",
    policyCount: 0,
    coveredHostnameCount: 1,
    identitySummary: "— none —",
    sessionDuration: null,
    policyRules: [],
    referencedGroupIds: [],
  }];
}

function tokenResult(status: TokenEvaluation["status"]): TokenEvaluation[] {
  return [{ tokenId: "tok-1", tokenName: "test-token", expiresAt: null, status, reason: "test" }];
}

Deno.test("diffForAppAlerts - first-ever warning alerts (no grace period)", () => {
  const alerts = diffForAppAlerts(appResult("warning"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, null);
});

Deno.test("diffForAppAlerts - first-ever safe does not alert", () => {
  const alerts = diffForAppAlerts(appResult("safe"), new Map());
  assertEquals(alerts.length, 0);
});

Deno.test("diffForAppAlerts - unchanged warning across two runs does not repeat-alert", () => {
  const previous = new Map([["app-1", "warning" as const]]);
  const alerts = diffForAppAlerts(appResult("warning"), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForAppAlerts - a transition from safe to warning alerts", () => {
  const previous = new Map([["app-1", "safe" as const]]);
  const alerts = diffForAppAlerts(appResult("warning"), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, "safe");
});

Deno.test("diffForTokenAlerts - first-ever critical alerts (no grace period)", () => {
  const alerts = diffForTokenAlerts(tokenResult("critical"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].newStatus, "critical");
});

Deno.test("diffForTokenAlerts - unchanged critical does not repeat-alert", () => {
  const previous = new Map([["tok-1", "critical" as const]]);
  const alerts = diffForTokenAlerts(tokenResult("critical"), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForTokenAlerts - a transition from warning to critical (token got closer to/past expiry) alerts", () => {
  const previous = new Map([["tok-1", "warning" as const]]);
  const alerts = diffForTokenAlerts(tokenResult("critical"), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, "warning");
  assertEquals(alerts[0].newStatus, "critical");
});

Deno.test("diffForTokenAlerts - not_evaluated is never alert-worthy", () => {
  const alerts = diffForTokenAlerts(tokenResult("not_evaluated"), new Map());
  assertEquals(alerts.length, 0);
});

Deno.test("diffForAppAlerts and diffForTokenAlerts operate on independent identity spaces (app-1 vs tok-1 don't collide)", () => {
  const appAlerts = diffForAppAlerts(
    appResult("warning"),
    new Map([["tok-1", "warning" as const]]),
  );
  // The previous-status map has an entry keyed "tok-1", not "app-1" — must
  // not be mistaken for a match.
  assertEquals(appAlerts.length, 1);
  assertEquals(appAlerts[0].previousStatus, null);
});

// issue #481 — resolveForAppAlerts/resolveForTokenAlerts (the auto-resolve
// counterpart to diffForAppAlerts/diffForTokenAlerts above): an open alert
// whose app/token has recovered to "safe" in the run that just completed
// should resolve; not_evaluated/still-open entities, and alerts for
// entities outside this run, must not.
function openAppAlert(id: string, appId: string): OpenAppAlert {
  return { id, appId };
}

function openTokenAlert(id: string, tokenId: string): OpenTokenAlert {
  return { id, tokenId };
}

Deno.test("resolveForAppAlerts - an app back to safe resolves its open alert", () => {
  const resolved = resolveForAppAlerts(appResult("safe"), [openAppAlert("a1", "app-1")]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForAppAlerts - an app still in warning does not resolve", () => {
  const resolved = resolveForAppAlerts(appResult("warning"), [openAppAlert("a1", "app-1")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForAppAlerts - not_evaluated does not resolve (never fabricate a clean state)", () => {
  const resolved = resolveForAppAlerts(appResult("not_evaluated"), [openAppAlert("a1", "app-1")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForAppAlerts - an app absent from this run's results does not resolve", () => {
  const resolved = resolveForAppAlerts([], [openAppAlert("a1", "app-1")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForAppAlerts - only the recovered app's alert resolves, others stay open", () => {
  const results: AppEvaluation[] = [
    {
      appId: "app-1",
      appName: "one",
      appDomain: "one.example.com",
      status: "safe",
      reason: "test",
      policyCount: 0,
      coveredHostnameCount: 1,
      identitySummary: "— none —",
      sessionDuration: null,
      policyRules: [],
      referencedGroupIds: [],
    },
    {
      appId: "app-2",
      appName: "two",
      appDomain: "two.example.com",
      status: "warning",
      reason: "test",
      policyCount: 0,
      coveredHostnameCount: 1,
      identitySummary: "— none —",
      sessionDuration: null,
      policyRules: [],
      referencedGroupIds: [],
    },
  ];
  const resolved = resolveForAppAlerts(results, [
    openAppAlert("a1", "app-1"),
    openAppAlert("a2", "app-2"),
  ]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForAppAlerts - no open alerts means nothing to resolve", () => {
  const resolved = resolveForAppAlerts(appResult("safe"), []);
  assertEquals(resolved, []);
});

Deno.test("resolveForTokenAlerts - a token back to safe resolves its open alert", () => {
  const resolved = resolveForTokenAlerts(tokenResult("safe"), [openTokenAlert("t1", "tok-1")]);
  assertEquals(resolved, ["t1"]);
});

Deno.test("resolveForTokenAlerts - a token still critical does not resolve", () => {
  const resolved = resolveForTokenAlerts(tokenResult("critical"), [openTokenAlert("t1", "tok-1")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForTokenAlerts - not_evaluated does not resolve (never fabricate a clean state)", () => {
  const resolved = resolveForTokenAlerts(tokenResult("not_evaluated"), [
    openTokenAlert("t1", "tok-1"),
  ]);
  assertEquals(resolved, []);
});

Deno.test("resolveForTokenAlerts - a token absent from this run's results does not resolve", () => {
  const resolved = resolveForTokenAlerts([], [openTokenAlert("t1", "tok-1")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForTokenAlerts - only the recovered token's alert resolves, others stay open", () => {
  const results: TokenEvaluation[] = [
    { tokenId: "tok-1", tokenName: "one", expiresAt: null, status: "safe", reason: "test" },
    { tokenId: "tok-2", tokenName: "two", expiresAt: null, status: "critical", reason: "test" },
  ];
  const resolved = resolveForTokenAlerts(results, [
    openTokenAlert("t1", "tok-1"),
    openTokenAlert("t2", "tok-2"),
  ]);
  assertEquals(resolved, ["t1"]);
});

Deno.test("resolveForTokenAlerts - no open alerts means nothing to resolve", () => {
  const resolved = resolveForTokenAlerts(tokenResult("safe"), []);
  assertEquals(resolved, []);
});
