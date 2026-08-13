import { assertEquals } from "@std/assert";
import { diffForAppAlerts, diffForTokenAlerts } from "../../worker/modules/zero-trust/alerts.ts";
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
