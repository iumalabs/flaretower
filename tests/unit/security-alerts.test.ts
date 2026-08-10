import { assertEquals } from "@std/assert";
import {
  diffForDnssecAlerts,
  diffForRateLimitingAlerts,
  diffForSslTlsAlerts,
  diffForWafAlerts,
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
