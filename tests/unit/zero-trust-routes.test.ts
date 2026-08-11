import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { zeroTrustRoutes } from "../../worker/modules/zero-trust/routes.ts";

// Regression coverage for specs/003-zero-trust/tasks.md T025/T026 — see
// worker/db/migrations/0008_zero_trust_run_log.sql for the run-log table
// these tests seed directly (bypassing runZeroTrustEvaluation's Cloudflare
// API calls, which are out of scope for a routes-only test).

interface RunRow {
  run_id: string;
  evaluated_at: string;
}

interface AppFindingRow {
  app_id: string;
  app_domain: string;
  status: string;
  reason: string;
  run_id: string;
}

interface TokenFindingRow {
  token_id: string;
  token_name: string;
  expires_at: string | null;
  status: string;
  reason: string;
  run_id: string;
}

function createMockD1(
  seed: { runs: RunRow[]; appFindings: AppFindingRow[]; tokenFindings: TokenFindingRow[] },
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
          if (/FROM zt_evaluation_runs ORDER BY evaluated_at DESC LIMIT 1/i.test(sql)) {
            const latest = [...seed.runs].sort((a, b) =>
              b.evaluated_at.localeCompare(a.evaluated_at)
            )[0];
            return Promise.resolve((latest ?? null) as T | null);
          }
          throw new Error(`Unhandled mock D1 first() call: ${sql}`);
        },
        all<T>() {
          if (/FROM zt_app_findings WHERE run_id = \?/i.test(sql)) {
            const runId = bound[0] as string;
            const rows = seed.appFindings
              .filter((r) => r.run_id === runId)
              .sort((a, b) => a.app_domain.localeCompare(b.app_domain));
            return Promise.resolve({ results: rows as unknown as T[] });
          }
          if (/FROM zt_token_findings WHERE run_id = \?/i.test(sql)) {
            const runId = bound[0] as string;
            const rows = seed.tokenFindings
              .filter((r) => r.run_id === runId)
              .sort((a, b) => a.token_name.localeCompare(b.token_name));
            return Promise.resolve({ results: rows as unknown as T[] });
          }
          throw new Error(`Unhandled mock D1 all() call: ${sql}`);
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function app(db: D1Database) {
  const hono = new Hono<
    { Bindings: { DB: D1Database; CF_ACCOUNT_ID: string; CF_API_TOKEN: string } }
  >();
  hono.route("/", zeroTrustRoutes);
  return (path: string) =>
    hono.request(path, undefined, { DB: db, CF_ACCOUNT_ID: "acct-1", CF_API_TOKEN: "tok" });
}

Deno.test("GET /inventory - service token findings survive when the latest run has zero applications (T025)", async () => {
  const request = app(createMockD1({
    runs: [{ run_id: "run-1", evaluated_at: "2026-08-12T00:00:00Z" }],
    appFindings: [],
    tokenFindings: [
      {
        token_id: "tok-1",
        token_name: "ci-token",
        expires_at: null,
        status: "critical",
        reason: "expired",
        run_id: "run-1",
      },
    ],
  }));

  const res = await request("/inventory");
  assertEquals(res.status, 200);
  const body = await res.json() as {
    run_id: string | null;
    applications: unknown[];
    service_tokens: { token_id: string }[];
  };

  assertEquals(body.run_id, "run-1");
  assertEquals(body.applications, []);
  assertEquals(body.service_tokens.length, 1);
  assertEquals(body.service_tokens[0].token_id, "tok-1");
});

Deno.test("GET /inventory - run_id is null when the evaluation has never run", async () => {
  const request = app(createMockD1({ runs: [], appFindings: [], tokenFindings: [] }));

  const res = await request("/inventory");
  assertEquals(res.status, 200);
  const body = await res.json() as {
    run_id: string | null;
    evaluated_at: string | null;
    applications: unknown[];
    service_tokens: unknown[];
  };

  assertEquals(body.run_id, null);
  assertEquals(body.evaluated_at, null);
  assertEquals(body.applications, []);
  assertEquals(body.service_tokens, []);
});

Deno.test("GET /inventory - a completed run with zero apps and zero tokens is distinguishable from never having run (T026)", async () => {
  const request = app(createMockD1({
    runs: [{ run_id: "run-2", evaluated_at: "2026-08-12T01:00:00Z" }],
    appFindings: [],
    tokenFindings: [],
  }));

  const res = await request("/inventory");
  assertEquals(res.status, 200);
  const body = await res.json() as {
    run_id: string | null;
    evaluated_at: string | null;
    applications: unknown[];
    service_tokens: unknown[];
  };

  assertEquals(body.run_id, "run-2");
  assertEquals(body.evaluated_at, "2026-08-12T01:00:00Z");
  assertEquals(body.applications, []);
  assertEquals(body.service_tokens, []);
});

Deno.test("GET /inventory - picks the most recently evaluated run when multiple run rows exist", async () => {
  const request = app(createMockD1({
    runs: [
      { run_id: "run-old", evaluated_at: "2026-08-01T00:00:00Z" },
      { run_id: "run-new", evaluated_at: "2026-08-12T00:00:00Z" },
    ],
    appFindings: [
      {
        app_id: "app-1",
        app_domain: "old.example.com",
        status: "safe",
        reason: "n/a",
        run_id: "run-old",
      },
      {
        app_id: "app-2",
        app_domain: "new.example.com",
        status: "warning",
        reason: "n/a",
        run_id: "run-new",
      },
    ],
    tokenFindings: [],
  }));

  const res = await request("/inventory");
  const body = await res.json() as { run_id: string; applications: { app_domain: string }[] };

  assertEquals(body.run_id, "run-new");
  assertEquals(body.applications.length, 1);
  assertEquals(body.applications[0].app_domain, "new.example.com");
});
