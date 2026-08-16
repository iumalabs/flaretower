import { assertEquals } from "@std/assert";
import {
  buildWorkerDetail,
  WORKER_NOT_FOUND,
} from "../../worker/modules/workers-dashboard/detail.ts";

interface FindingRecord {
  worker_name: string;
  hostname: string;
  hostname_kind: string;
  status: string;
  reason: string;
  evaluated_at: string;
  run_id: string;
  covering_app_ids?: string; // JSON array, matches migration 0014's column
}

interface ZtAppFindingRecord {
  app_id: string;
  app_name: string | null;
  app_domain: string;
  policy_rules_json: string | null;
  evaluated_at: string;
}

// Minimal read-only fake D1 — seeded directly with rows (no INSERT
// simulation needed, unlike tests/unit/routes.test.ts's mock, since
// buildWorkerDetail() only reads). Mirrors that same regex-dispatch shape.
// `ztAppFail: true` simulates the policy join query itself throwing
// (T016's unavailable-source case) rather than just returning zero rows.
function createMockD1(
  rows: FindingRecord[],
  ztAppRows: ZtAppFindingRecord[] = [],
  ztAppFail = false,
): D1Database {
  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
          return statement;
        },
        first<T>() {
          if (/SELECT run_id FROM exposure_findings ORDER BY evaluated_at DESC/i.test(sql)) {
            if (rows.length === 0) return Promise.resolve(null);
            const latest = [...rows].sort((a, b) =>
              b.evaluated_at.localeCompare(a.evaluated_at)
            )[0];
            return Promise.resolve({ run_id: latest.run_id } as unknown as T);
          }
          return Promise.resolve(null);
        },
        all<T>() {
          if (/FROM exposure_findings WHERE run_id = \? AND worker_name = \?/i.test(sql)) {
            const [runId, workerName] = bound as [string, string];
            return Promise.resolve({
              results: rows.filter((r) =>
                r.run_id === runId && r.worker_name === workerName
              ) as unknown as T[],
            });
          }
          if (/FROM zt_app_findings/i.test(sql)) {
            if (ztAppFail) return Promise.reject(new Error("mock zt_app_findings failure"));
            const requestedIds = new Set(bound as string[]);
            return Promise.resolve({
              results: ztAppRows.filter((r) => requestedIds.has(r.app_id)) as unknown as T[],
            });
          }
          return Promise.resolve({ results: [] as T[] });
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

const env = (
  rows: FindingRecord[],
  ztAppRows: ZtAppFindingRecord[] = [],
  ztAppFail = false,
) => ({
  DB: createMockD1(rows, ztAppRows, ztAppFail),
  CF_ACCOUNT_ID: "acct-1",
  CF_API_TOKEN: "fake-token",
});

// buildWorkerDetail() calls fetchAccountAuditLog() (Phase 5/US3), which
// goes through the ambient global fetch with no injected fetchImpl (same as
// runEvaluation() in tests/unit/routes.test.ts) — stubbed here and restored
// after, defaulting to an empty audit log unless a test needs otherwise.
async function withAuditLog<T>(
  rawEntries: unknown[],
  fn: () => Promise<T>,
  auditLogFails = false,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch =
    (() =>
      auditLogFails ? Promise.resolve(new Response("", { status: 500 })) : Promise.resolve(
        new Response(JSON.stringify({ result: rawEntries }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("buildWorkerDetail - returns every route with its own status, reason, environment, and Cloudflare URL", async () => {
  const rows: FindingRecord[] = [
    {
      worker_name: "api-gateway",
      hostname: "api.acme.dev",
      hostname_kind: "custom_domain",
      status: "safe",
      reason: "covered by Access application(s): app-1",
      evaluated_at: "2026-08-16T00:00:00Z",
      run_id: "run-1",
    },
    {
      worker_name: "api-gateway",
      hostname: "api-gateway.acme-labs.workers.dev",
      hostname_kind: "workers_dev",
      status: "critical",
      reason: "no Access application covers this hostname",
      evaluated_at: "2026-08-16T00:00:00Z",
      run_id: "run-1",
    },
  ];

  const result = await withAuditLog([], () => buildWorkerDetail(env(rows), "api-gateway"));
  if (result === WORKER_NOT_FOUND) throw new Error("expected a result, got WORKER_NOT_FOUND");

  assertEquals(result.workerName, "api-gateway");
  assertEquals(result.environment, "production");
  assertEquals(result.routes.length, 2);
  assertEquals(result.routes[0].status, "safe");
  assertEquals(result.routes[1].status, "critical");
  assertEquals(
    result.cloudflareUrl,
    "https://dash.cloudflare.com/acct-1/workers/services/view/api-gateway/production",
  );
  assertEquals(result.unavailable, []);
});

Deno.test("buildWorkerDetail - a Worker with only the no-hostnames marker returns an empty routes array, not WORKER_NOT_FOUND", async () => {
  const rows: FindingRecord[] = [
    {
      worker_name: "queue-worker",
      hostname: "(no public hostnames)",
      hostname_kind: "custom_domain",
      status: "safe",
      reason:
        "Worker has no public hostnames (no custom domain, workers.dev disabled, no Preview URL)",
      evaluated_at: "2026-08-16T00:00:00Z",
      run_id: "run-1",
    },
  ];

  const result = await withAuditLog([], () => buildWorkerDetail(env(rows), "queue-worker"));
  if (result === WORKER_NOT_FOUND) throw new Error("expected a result, got WORKER_NOT_FOUND");
  assertEquals(result.routes, []);
});

Deno.test("buildWorkerDetail - a Worker absent from the latest run returns WORKER_NOT_FOUND", async () => {
  const rows: FindingRecord[] = [
    {
      worker_name: "some-other-worker",
      hostname: "other.acme.dev",
      hostname_kind: "custom_domain",
      status: "safe",
      reason: "covered by Access application(s): app-1",
      evaluated_at: "2026-08-16T00:00:00Z",
      run_id: "run-1",
    },
  ];

  const result = await withAuditLog([], () => buildWorkerDetail(env(rows), "api-gateway"));
  assertEquals(result, WORKER_NOT_FOUND);
});

Deno.test("buildWorkerDetail - no evaluation run has ever happened returns WORKER_NOT_FOUND", async () => {
  const result = await withAuditLog([], () => buildWorkerDetail(env([]), "api-gateway"));
  assertEquals(result, WORKER_NOT_FOUND);
});

// specs/023-worker-detail-page Phase 4 (US2) — policy join

Deno.test("buildWorkerDetail - a route covered by an Access application gets its plain-language policy", async () => {
  const rows: FindingRecord[] = [
    {
      worker_name: "api-gateway",
      hostname: "api.acme.dev",
      hostname_kind: "custom_domain",
      status: "safe",
      reason: "covered by Access application(s): app-1",
      evaluated_at: "2026-08-16T00:00:00Z",
      run_id: "run-1",
      covering_app_ids: JSON.stringify(["app-1"]),
    },
  ];
  const ztAppRows: ZtAppFindingRecord[] = [
    {
      app_id: "app-1",
      app_name: "gateway-admin",
      app_domain: "api.acme.dev",
      policy_rules_json: JSON.stringify([[{ verb: "ALLOW", label: "emails ending in @acme.dev" }]]),
      evaluated_at: "2026-08-16T00:00:00Z",
    },
  ];

  const result = await withAuditLog(
    [],
    () => buildWorkerDetail(env(rows, ztAppRows), "api-gateway"),
  );
  if (result === WORKER_NOT_FOUND) throw new Error("expected a result, got WORKER_NOT_FOUND");

  assertEquals(result.routes[0].policy, {
    appId: "app-1",
    appName: "gateway-admin",
    appDomain: "api.acme.dev",
    policyRules: [[{ verb: "ALLOW", label: "emails ending in @acme.dev" }]],
  });
  assertEquals(result.unavailable, []);
});

Deno.test("buildWorkerDetail - a critical (uncovered) route has a null policy, not an unavailable source", async () => {
  const rows: FindingRecord[] = [
    {
      worker_name: "api-gateway",
      hostname: "api-gateway.acme-labs.workers.dev",
      hostname_kind: "workers_dev",
      status: "critical",
      reason: "no Access application covers this hostname",
      evaluated_at: "2026-08-16T00:00:00Z",
      run_id: "run-1",
      covering_app_ids: JSON.stringify([]),
    },
  ];

  const result = await withAuditLog([], () => buildWorkerDetail(env(rows), "api-gateway"));
  if (result === WORKER_NOT_FOUND) throw new Error("expected a result, got WORKER_NOT_FOUND");

  assertEquals(result.routes[0].policy, null);
  assertEquals(result.unavailable, []);
});

Deno.test("buildWorkerDetail - a covering app_id absent from the latest Zero Trust run degrades to a null policy, not an error", async () => {
  const rows: FindingRecord[] = [
    {
      worker_name: "api-gateway",
      hostname: "api.acme.dev",
      hostname_kind: "custom_domain",
      status: "safe",
      reason: "covered by Access application(s): app-stale",
      evaluated_at: "2026-08-16T00:00:00Z",
      run_id: "run-1",
      covering_app_ids: JSON.stringify(["app-stale"]),
    },
  ];
  // Zero Trust's own latest run doesn't have this app_id — evaluation runs
  // for the two modules aren't atomic with each other (data-model.md).
  const result = await withAuditLog([], () => buildWorkerDetail(env(rows, []), "api-gateway"));
  if (result === WORKER_NOT_FOUND) throw new Error("expected a result, got WORKER_NOT_FOUND");

  assertEquals(result.routes[0].policy, null);
  assertEquals(result.unavailable, []);
});

Deno.test("buildWorkerDetail - a failed policy join reports an unavailable source, routes still render with their own reason text", async () => {
  const rows: FindingRecord[] = [
    {
      worker_name: "api-gateway",
      hostname: "api.acme.dev",
      hostname_kind: "custom_domain",
      status: "safe",
      reason: "covered by Access application(s): app-1",
      evaluated_at: "2026-08-16T00:00:00Z",
      run_id: "run-1",
      covering_app_ids: JSON.stringify(["app-1"]),
    },
  ];

  const result = await withAuditLog(
    [],
    () => buildWorkerDetail(env(rows, [], true), "api-gateway"),
  );
  if (result === WORKER_NOT_FOUND) throw new Error("expected a result, got WORKER_NOT_FOUND");

  assertEquals(result.routes[0].policy, null);
  assertEquals(result.routes[0].reason, "covered by Access application(s): app-1");
  assertEquals(result.unavailable, [
    { source: "policy", error: "could not read Access application policies" },
  ]);
});

// specs/023-worker-detail-page Phase 5 (US3) — recent changes

Deno.test("buildWorkerDetail - recent changes are scoped to this Worker's own hostnames, not another Worker's", async () => {
  const rows: FindingRecord[] = [
    {
      worker_name: "api-gateway",
      hostname: "api.acme.dev",
      hostname_kind: "custom_domain",
      status: "safe",
      reason: "covered by Access application(s): app-1",
      evaluated_at: "2026-08-16T00:00:00Z",
      run_id: "run-1",
    },
  ];
  const rawEntries = [
    {
      when: "2026-08-15T12:00:00Z",
      action: { type: "policy_update" },
      actor: { email: "ilse@acme.dev" },
      interface: { type: "dashboard" },
      resource: { type: "access" },
      oldValue: { domain: "other-worker.acme.dev" },
      newValue: { domain: "other-worker.acme.dev" },
    },
    {
      when: "2026-08-15T13:00:00Z",
      action: { type: "policy_update" },
      actor: { email: "ilse@acme.dev" },
      interface: { type: "dashboard" },
      resource: { type: "access" },
      oldValue: { domain: "api.acme.dev" },
      newValue: { domain: "api.acme.dev" },
    },
  ];

  const result = await withAuditLog(
    rawEntries,
    () => buildWorkerDetail(env(rows), "api-gateway"),
  );
  if (result === WORKER_NOT_FOUND) throw new Error("expected a result, got WORKER_NOT_FOUND");

  assertEquals(result.recentChanges.length, 1);
  assertEquals(result.recentChanges[0].occurredAt, "2026-08-15T13:00:00Z");
  assertEquals(result.unavailable, []);
});

Deno.test("buildWorkerDetail - a Worker with no recent changes returns an empty array, not an unavailable source", async () => {
  const rows: FindingRecord[] = [
    {
      worker_name: "api-gateway",
      hostname: "api.acme.dev",
      hostname_kind: "custom_domain",
      status: "safe",
      reason: "covered by Access application(s): app-1",
      evaluated_at: "2026-08-16T00:00:00Z",
      run_id: "run-1",
    },
  ];

  const result = await withAuditLog([], () => buildWorkerDetail(env(rows), "api-gateway"));
  if (result === WORKER_NOT_FOUND) throw new Error("expected a result, got WORKER_NOT_FOUND");

  assertEquals(result.recentChanges, []);
  assertEquals(result.unavailable, []);
});

Deno.test("buildWorkerDetail - an audit log fetch failure surfaces as an unavailable source, not an error", async () => {
  const rows: FindingRecord[] = [
    {
      worker_name: "api-gateway",
      hostname: "api.acme.dev",
      hostname_kind: "custom_domain",
      status: "safe",
      reason: "covered by Access application(s): app-1",
      evaluated_at: "2026-08-16T00:00:00Z",
      run_id: "run-1",
    },
  ];

  const result = await withAuditLog(
    [],
    () => buildWorkerDetail(env(rows), "api-gateway"),
    true,
  );
  if (result === WORKER_NOT_FOUND) throw new Error("expected a result, got WORKER_NOT_FOUND");

  assertEquals(result.recentChanges, []);
  assertEquals(result.unavailable.length, 1);
  assertEquals(result.unavailable[0].source, "recent_changes");
});
