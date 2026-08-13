// buildAccountSummary/serializeDashboard (routes.ts) contain the Workers
// Dashboard's only non-trivial arithmetic — day-over-day change %, error
// rate — and were previously exercised only through e2e tests that mock
// the whole /api/workers/dashboard response as pre-computed JSON, so the
// math itself had zero coverage of its own division-by-zero guards.
import { assertEquals } from "@std/assert";
import {
  buildAccountSummary,
  serializeDashboard,
} from "../../worker/modules/workers-dashboard/routes.ts";
import type {
  WorkerDashboardRow,
  WorkersDashboard,
} from "../../worker/modules/workers-dashboard/types.ts";
import type { WorkersAnalyticsResult } from "../../worker/modules/workers-dashboard/analytics.ts";

function worker(overrides: Partial<WorkerDashboardRow> = {}): WorkerDashboardRow {
  return {
    workerName: "worker-1",
    environment: "production",
    routeCount: 1,
    lastDeployAt: null,
    requests24h: null,
    errors24h: null,
    cpuP50Ms: null,
    exposureStatus: "safe",
    ...overrides,
  };
}

Deno.test("buildAccountSummary - no analytics result: all traffic fields null, deployedCount still real", () => {
  const workers = [
    worker({ workerName: "a", environment: "production" }),
    worker({ workerName: "b", environment: "preview" }),
  ];
  const summary = buildAccountSummary(workers, null);

  assertEquals(summary.deployedCount, 2);
  assertEquals(summary.deployedByEnvironment, { production: 1, preview: 1 });
  assertEquals(summary.requests24hTotal, null);
  assertEquals(summary.requests24hChangePct, null);
  assertEquals(summary.errorRatePct, null);
  assertEquals(summary.errors24hTotal, null);
  assertEquals(summary.cpuP99Ms, null);
});

Deno.test("buildAccountSummary - counts deployedByEnvironment per worker, not per hostname", () => {
  const workers = [
    worker({ workerName: "a", environment: "production" }),
    worker({ workerName: "b", environment: "production" }),
    worker({ workerName: "c", environment: "preview" }),
  ];
  const summary = buildAccountSummary(workers, null);
  assertEquals(summary.deployedByEnvironment, { production: 2, preview: 1 });
});

Deno.test("buildAccountSummary - normal case computes change% and error rate from perScript totals", () => {
  const workers = [worker()];
  const analytics: WorkersAnalyticsResult = {
    current: {
      perScript: [{ scriptName: "worker-1", requests: 200, errors: 10, cpuTimeP50Ms: 5 }],
      cpuTimeP99Ms: 12,
      truncated: false,
    },
    previous: {
      perScript: [{ scriptName: "worker-1", requests: 100, errors: 5, cpuTimeP50Ms: 4 }],
      cpuTimeP99Ms: 10,
      truncated: false,
    },
  };
  const summary = buildAccountSummary(workers, analytics);

  assertEquals(summary.requests24hTotal, 200);
  assertEquals(summary.errors24hTotal, 10);
  assertEquals(summary.requests24hChangePct, 100); // 100 -> 200 is +100%
  assertEquals(summary.errorRatePct, 5); // 10/200 = 5%
  assertEquals(summary.cpuP99Ms, 12);
});

Deno.test("buildAccountSummary - zero previous requests yields null change%, not Infinity", () => {
  const workers = [worker()];
  const analytics: WorkersAnalyticsResult = {
    current: {
      perScript: [{ scriptName: "worker-1", requests: 50, errors: 0, cpuTimeP50Ms: 1 }],
      cpuTimeP99Ms: 3,
      truncated: false,
    },
    previous: { perScript: [], cpuTimeP99Ms: null, truncated: false },
  };
  const summary = buildAccountSummary(workers, analytics);
  assertEquals(summary.requests24hChangePct, null);
});

Deno.test("buildAccountSummary - zero current requests yields null error rate, not NaN", () => {
  const workers = [worker()];
  const analytics: WorkersAnalyticsResult = {
    current: { perScript: [], cpuTimeP99Ms: null, truncated: false },
    previous: { perScript: [], cpuTimeP99Ms: null, truncated: false },
  };
  const summary = buildAccountSummary(workers, analytics);
  assertEquals(summary.requests24hTotal, 0);
  assertEquals(summary.errorRatePct, null);
});

Deno.test("serializeDashboard - maps every field to its snake_case wire shape", () => {
  const dashboard: WorkersDashboard = {
    generatedAt: "2026-08-13T00:00:00.000Z",
    summary: {
      deployedCount: 1,
      deployedByEnvironment: { production: 1, preview: 0 },
      requests24hTotal: 10,
      requests24hChangePct: 5,
      errorRatePct: 1,
      errors24hTotal: 1,
      cpuP99Ms: 7,
    },
    workers: [worker({ requests24h: 10, errors24h: 1, cpuP50Ms: 2, lastDeployAt: "2026-08-01" })],
    recentChanges: [{
      occurredAt: "2026-08-12T00:00:00.000Z",
      actor: "person@example.com",
      actorSource: "dashboard",
      action: "worker.update",
      target: "worker-1",
      resultSummary: null,
    }],
    unavailable: [{ source: "analytics", error: "boom" }],
  };

  const serialized = serializeDashboard(dashboard);

  assertEquals(serialized.generated_at, "2026-08-13T00:00:00.000Z");
  assertEquals(serialized.summary.deployed_by_environment, { production: 1, preview: 0 });
  assertEquals(serialized.summary.requests_24h_change_pct, 5);
  assertEquals(serialized.workers[0], {
    worker_name: "worker-1",
    environment: "production",
    route_count: 1,
    last_deploy_at: "2026-08-01",
    requests_24h: 10,
    errors_24h: 1,
    cpu_p50_ms: 2,
    exposure_status: "safe",
  });
  assertEquals(serialized.recent_changes[0].actor_source, "dashboard");
  assertEquals(serialized.unavailable, [{ source: "analytics", error: "boom" }]);
});
