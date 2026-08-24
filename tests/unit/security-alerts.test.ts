import { assertEquals } from "@std/assert";
import {
  diffForDnssecAlerts,
  diffForRateLimitingAlerts,
  diffForSslTlsAlerts,
  diffForWafAlerts,
  type OpenAlert,
  resolveForDnssecAlerts,
  resolveForSslTlsAlerts,
} from "../../worker/modules/security/alerts.ts";
import type {
  DnssecEvaluation,
  RateLimitingEvaluation,
  SslTlsEvaluation,
  WafEvaluation,
} from "../../worker/modules/security/types.ts";

function sslTlsResult(status: SslTlsEvaluation["status"]): SslTlsEvaluation[] {
  return [{ zoneId: "zone-1", zoneName: "example.com", status, reason: "test" }];
}

function dnssecResult(status: DnssecEvaluation["status"]): DnssecEvaluation[] {
  return [{ zoneId: "zone-1", zoneName: "example.com", status, reason: "test" }];
}

function wafResult(status: WafEvaluation["status"]): WafEvaluation[] {
  return [{ zoneId: "zone-1", zoneName: "example.com", status, reason: "test" }];
}

function rateLimitingResult(status: RateLimitingEvaluation["status"]): RateLimitingEvaluation[] {
  return [{ zoneId: "zone-1", zoneName: "example.com", status, reason: "test" }];
}

Deno.test("diffForSslTlsAlerts - first-ever critical alerts (no grace period)", () => {
  const alerts = diffForSslTlsAlerts(sslTlsResult("critical"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].newStatus, "critical");
});

Deno.test("diffForSslTlsAlerts - first-ever safe does not alert", () => {
  const alerts = diffForSslTlsAlerts(sslTlsResult("safe"), new Map());
  assertEquals(alerts.length, 0);
});

Deno.test("diffForSslTlsAlerts - unchanged critical across two runs does not repeat-alert", () => {
  const previous = new Map([["zone-1", "critical" as const]]);
  const alerts = diffForSslTlsAlerts(sslTlsResult("critical"), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForSslTlsAlerts - a transition from warning to critical alerts", () => {
  const previous = new Map([["zone-1", "warning" as const]]);
  const alerts = diffForSslTlsAlerts(sslTlsResult("critical"), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, "warning");
  assertEquals(alerts[0].newStatus, "critical");
});

Deno.test("diffForSslTlsAlerts - not_evaluated is never alert-worthy", () => {
  const alerts = diffForSslTlsAlerts(sslTlsResult("not_evaluated"), new Map());
  assertEquals(alerts.length, 0);
});

Deno.test("diffForDnssecAlerts - first-ever warning alerts (no grace period)", () => {
  const alerts = diffForDnssecAlerts(dnssecResult("warning"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, null);
});

Deno.test("diffForDnssecAlerts - unchanged warning does not repeat-alert", () => {
  const previous = new Map([["zone-1", "warning" as const]]);
  const alerts = diffForDnssecAlerts(dnssecResult("warning"), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForWafAlerts - first-ever warning alerts (no grace period)", () => {
  const alerts = diffForWafAlerts(wafResult("warning"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, null);
});

Deno.test("diffForWafAlerts - a transition from safe to warning alerts", () => {
  const previous = new Map([["zone-1", "safe" as const]]);
  const alerts = diffForWafAlerts(wafResult("warning"), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, "safe");
});

Deno.test("diffForRateLimitingAlerts - first-ever warning alerts (no grace period)", () => {
  const alerts = diffForRateLimitingAlerts(rateLimitingResult("warning"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, null);
});

Deno.test("diffForRateLimitingAlerts - unchanged warning does not repeat-alert", () => {
  const previous = new Map([["zone-1", "warning" as const]]);
  const alerts = diffForRateLimitingAlerts(rateLimitingResult("warning"), previous);
  assertEquals(alerts.length, 0);
});

// issue #481 — resolveFor*Alerts (the auto-resolve counterpart to
// diffFor*Alerts above): an open alert whose zone has recovered to "safe"
// in the run that just completed should resolve; not_evaluated/still-open
// zones, and alerts for zones outside this run, must not.
function openAlert(id: string, zoneId: string): OpenAlert {
  return { id, zoneId };
}

Deno.test("resolveForSslTlsAlerts - a zone back to safe resolves its open alert", () => {
  const resolved = resolveForSslTlsAlerts(sslTlsResult("safe"), [openAlert("a1", "zone-1")]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForSslTlsAlerts - a zone still critical does not resolve", () => {
  const resolved = resolveForSslTlsAlerts(sslTlsResult("critical"), [openAlert("a1", "zone-1")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForSslTlsAlerts - not_evaluated does not resolve (never fabricate a clean state)", () => {
  const resolved = resolveForSslTlsAlerts(sslTlsResult("not_evaluated"), [
    openAlert("a1", "zone-1"),
  ]);
  assertEquals(resolved, []);
});

Deno.test("resolveForSslTlsAlerts - a zone absent from this run's results does not resolve", () => {
  const resolved = resolveForSslTlsAlerts([], [openAlert("a1", "zone-1")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForSslTlsAlerts - only the recovered zone's alert resolves, others stay open", () => {
  const results = [
    { zoneId: "zone-1", zoneName: "one.example.com", status: "safe" as const, reason: "test" },
    {
      zoneId: "zone-2",
      zoneName: "two.example.com",
      status: "critical" as const,
      reason: "test",
    },
  ];
  const resolved = resolveForSslTlsAlerts(results, [
    openAlert("a1", "zone-1"),
    openAlert("a2", "zone-2"),
  ]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForSslTlsAlerts - no open alerts means nothing to resolve", () => {
  const resolved = resolveForSslTlsAlerts(sslTlsResult("safe"), []);
  assertEquals(resolved, []);
});

Deno.test("resolveForDnssecAlerts - a zone back to safe resolves its open alert", () => {
  const resolved = resolveForDnssecAlerts(dnssecResult("safe"), [openAlert("a1", "zone-1")]);
  assertEquals(resolved, ["a1"]);
});
