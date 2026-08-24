import { assertEquals } from "@std/assert";
import {
  diffForAlerts,
  type OpenAlert,
  resolveForAlerts,
} from "../../worker/modules/workers-access-exposure/alerts.ts";
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

// issue #481 — resolveForAlerts (the auto-resolve counterpart to
// diffForAlerts above): an open alert whose hostname has recovered to
// "safe" in the run that just completed should resolve; not_evaluated/
// still-open hostnames, and hostnames outside this run, must not.
function openAlert(id: string, hostname: string): OpenAlert {
  return { id, hostname };
}

Deno.test("resolveForAlerts - a hostname back to safe resolves its open alert", () => {
  const resolved = resolveForAlerts(
    results("billing-api.acct.workers.dev", "safe"),
    [openAlert("a1", "billing-api.acct.workers.dev")],
  );
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForAlerts - a hostname still critical does not resolve", () => {
  const resolved = resolveForAlerts(
    results("billing-api.acct.workers.dev", "critical"),
    [openAlert("a1", "billing-api.acct.workers.dev")],
  );
  assertEquals(resolved, []);
});

Deno.test("resolveForAlerts - not_evaluated does not resolve (never fabricate a clean state)", () => {
  const resolved = resolveForAlerts(
    results("billing-api.acct.workers.dev", "not_evaluated"),
    [openAlert("a1", "billing-api.acct.workers.dev")],
  );
  assertEquals(resolved, []);
});

Deno.test("resolveForAlerts - a hostname absent from this run's results does not resolve", () => {
  const resolved = resolveForAlerts([], [openAlert("a1", "billing-api.acct.workers.dev")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForAlerts - only the recovered hostname's alert resolves, others stay open", () => {
  const multiWorker: WorkerEvaluation[] = [
    {
      workerName: "billing-api",
      hostnames: [
        {
          hostname: "billing-api.acct.workers.dev",
          kind: "workers_dev",
          status: "safe",
          reason: "test",
          coveringAppIds: [],
        },
      ],
    },
    {
      workerName: "status-page",
      hostnames: [
        {
          hostname: "status.example.com",
          kind: "custom_domain",
          status: "critical",
          reason: "test",
          coveringAppIds: [],
        },
      ],
    },
  ];
  const resolved = resolveForAlerts(multiWorker, [
    openAlert("a1", "billing-api.acct.workers.dev"),
    openAlert("a2", "status.example.com"),
  ]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForAlerts - no open alerts means nothing to resolve", () => {
  const resolved = resolveForAlerts(results("billing-api.acct.workers.dev", "safe"), []);
  assertEquals(resolved, []);
});
