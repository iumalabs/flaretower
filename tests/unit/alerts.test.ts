import { assertEquals } from "@std/assert";
import { diffForAlerts } from "../../worker/modules/workers-access-exposure/alerts.ts";
import type { WorkerEvaluation } from "../../worker/modules/workers-access-exposure/types.ts";

function results(
  hostname: string,
  status: WorkerEvaluation["hostnames"][number]["status"],
): WorkerEvaluation[] {
  return [
    {
      workerName: "billing-api",
      hostnames: [{ hostname, kind: "workers_dev", status, reason: "test", coveringAppIds: [] }],
    },
  ];
}

Deno.test("diffForAlerts - a hostname's first-ever evaluation alerts if critical (no grace period)", () => {
  const alerts = diffForAlerts(results("billing-api.acct.workers.dev", "critical"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, null);
  assertEquals(alerts[0].newStatus, "critical");
});

Deno.test("diffForAlerts - a hostname's first-ever evaluation alerts if warning (no grace period)", () => {
  const alerts = diffForAlerts(results("status.example.com", "warning"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].newStatus, "warning");
});

Deno.test("diffForAlerts - a hostname's first-ever evaluation does NOT alert if safe", () => {
  const alerts = diffForAlerts(results("billing.example.com", "safe"), new Map());
  assertEquals(alerts.length, 0);
});

Deno.test("diffForAlerts - unchanged critical across two runs does not repeat-alert", () => {
  const previous = new Map([["billing-api.acct.workers.dev", "critical" as const]]);
  const alerts = diffForAlerts(results("billing-api.acct.workers.dev", "critical"), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForAlerts - a transition from safe to critical alerts", () => {
  const previous = new Map([["billing-api.acct.workers.dev", "safe" as const]]);
  const alerts = diffForAlerts(results("billing-api.acct.workers.dev", "critical"), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, "safe");
  assertEquals(alerts[0].newStatus, "critical");
});

Deno.test("diffForAlerts - a transition from critical back to safe produces no alert (only warning/critical are alert-worthy)", () => {
  const previous = new Map([["billing-api.acct.workers.dev", "critical" as const]]);
  const alerts = diffForAlerts(results("billing-api.acct.workers.dev", "safe"), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForAlerts - a regression (safe -> critical -> safe -> critical again) alerts on the second critical too", () => {
  // Simulates: previous run's recorded status was "safe" (it had recovered
  // since the last critical), current run is critical again.
  const previous = new Map([["billing-api.acct.workers.dev", "safe" as const]]);
  const alerts = diffForAlerts(results("billing-api.acct.workers.dev", "critical"), previous);
  assertEquals(alerts.length, 1);
});

Deno.test("diffForAlerts - not_evaluated is never alert-worthy", () => {
  const alerts = diffForAlerts(results("flaky.acct.workers.dev", "not_evaluated"), new Map());
  assertEquals(alerts.length, 0);
});
