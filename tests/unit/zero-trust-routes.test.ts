import { assertEquals, assertThrows } from "@std/assert";
import { Hono } from "hono";
import {
  buildZeroTrustInventoryResponse,
  previousStatusReader,
  zeroTrustRoutes,
} from "../../worker/modules/zero-trust/routes.ts";
import { PaginationParamError } from "../../worker/pagination.ts";

// specs/014-access-dashboard: GET /inventory now also live-fetches Access
// Groups/Identity Providers (routes.ts's fetchAccessGroupsPanel), which use
// the ambient global `fetch` (same as every module's Cloudflare API calls)
// rather than an injectable parameter these route-level tests can pass in.
// Stubbed to fail fast rather than making a real network call during unit
// tests — exercises the same graceful-degradation path
// (`access_groups: null`, spec.md FR-008) a real credential/network
// failure would.
globalThis.fetch =
  (() => Promise.reject(new Error("network disabled in this unit test"))) as typeof fetch;

// issue #470 (same class as #465, fixed for storage first) — every
// getPrevious*Statuses/getOpen*Alerts read in runZeroTrustEvaluation only
// ever receives a D1DatabaseSession (never env.DB directly, not even as an
// available parameter), so this proves the one thing type-checking can't:
// that previousStatusReader() actually opens a "first-primary" session
// rather than, say, the default constraint or no session at all.
Deno.test("previousStatusReader - opens a first-primary D1 session, not env.DB directly", () => {
  let sessionConstraint: string | undefined;
  const fakeSession = {} as D1DatabaseSession;
  const db = {
    withSession(constraint: string) {
      sessionConstraint = constraint;
      return fakeSession;
    },
  } as unknown as D1Database;
  const env = { DB: db, CF_ACCOUNT_ID: "acct-1", CF_API_TOKEN: "fake-token" };

  const reader = previousStatusReader(env);

  assertEquals(sessionConstraint, "first-primary");
  assertEquals(reader, fakeSession);
});

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
  referenced_group_ids?: string;
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
    access_groups: unknown;
  };

  assertEquals(body.run_id, "run-1");
  assertEquals(body.applications, []);
  assertEquals(body.service_tokens.length, 1);
  assertEquals(body.service_tokens[0].token_id, "tok-1");
  // specs/014-access-dashboard FR-008 — a Groups-fetch failure (network
  // disabled in this test) never blocks the rest of the response above.
  assertEquals(body.access_groups, null);
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

Deno.test("GET /inventory - Access Groups panel: real reference counts and rule summaries when the fetch succeeds (specs/014-access-dashboard)", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/access/groups")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              result: [
                { id: "grp-1", name: "platform", include: [{ everyone: {} }] },
                { id: "grp-2", name: "unused", include: [{ everyone: {} }] },
              ],
              errors: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.includes("/access/identity_providers")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: true, result: [], errors: [] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as typeof fetch;

    const request = app(createMockD1({
      runs: [{ run_id: "run-1", evaluated_at: "2026-08-12T00:00:00Z" }],
      appFindings: [
        {
          app_id: "app-1",
          app_domain: "api.example.com",
          status: "safe",
          reason: "n/a",
          run_id: "run-1",
          referenced_group_ids: JSON.stringify(["grp-1"]),
        },
      ],
      tokenFindings: [],
    }));

    const res = await request("/inventory");
    const body = await res.json() as {
      access_groups: {
        group_id: string;
        name: string;
        referenced_by_app_count: number;
        rule_summary: string;
      }[];
    };

    const platform = body.access_groups.find((g) => g.group_id === "grp-1")!;
    const unused = body.access_groups.find((g) => g.group_id === "grp-2")!;
    assertEquals(platform.referenced_by_app_count, 1);
    assertEquals(unused.referenced_by_app_count, 0);
    assertEquals(platform.rule_summary, "everyone");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// specs/020-list-pagination — buildZeroTrustInventoryResponse() is pure
// (extracted from the route handler), so these exercise the 2-collection
// pagination/sort/critical_finding logic directly.
function appOut(overrides: Partial<{
  app_id: string;
  app_domain: string;
  status: string;
  reason: string;
  policy_count: number | null;
}> = {}) {
  return {
    app_id: "app-1",
    app_name: null,
    app_domain: "app-1.example.com",
    status: "safe",
    reason: "scoped policy",
    policy_count: 1,
    covered_hostname_count: 1,
    identity_summary: null,
    session_duration: null,
    policy_rules: [],
    ...overrides,
  };
}
function tokenOut(
  overrides: Partial<{ token_id: string; token_name: string; status: string; reason: string }> = {},
) {
  return {
    token_id: "tok-1",
    token_name: "ci-token",
    expires_at: null,
    status: "safe",
    reason: "in use",
    ...overrides,
  };
}

Deno.test("buildZeroTrustInventoryResponse - applications and service_tokens paginate independently", () => {
  const apps = Array.from(
    { length: 3 },
    (_, i) => appOut({ app_id: `a${i}`, app_domain: `a${i}.test` }),
  );
  const tokens = Array.from(
    { length: 2 },
    (_, i) => tokenOut({ token_id: `t${i}`, token_name: `t${i}` }),
  );

  const res = buildZeroTrustInventoryResponse(apps, tokens, null, "run-1", "t", {
    app: { page_size: "2" },
  });

  assertEquals(res.applications.length, 2);
  assertEquals(res.applications_pagination, { page: 1, page_size: 2, total: 3, total_pages: 2 });
  assertEquals(res.service_tokens.length, 2);
  assertEquals(res.service_tokens_pagination, { page: 1, page_size: 50, total: 2, total_pages: 1 });
});

Deno.test("buildZeroTrustInventoryResponse - critical_finding: an open application wins over a critical token", () => {
  const apps = [
    appOut({ status: "critical", app_domain: "open.example.com", reason: "no policy" }),
  ];
  const tokens = [tokenOut({ status: "critical", reason: "unused" })];

  const res = buildZeroTrustInventoryResponse(apps, tokens, null, "run-1", "t", {});
  assertEquals(res.critical_finding, {
    kind: "application",
    title: "An Access application has no effective policy",
    target: "open.example.com",
    description: "no policy",
  });
});

Deno.test("buildZeroTrustInventoryResponse - critical_finding falls back to a token, then null", () => {
  const safeApp = [appOut()];
  const criticalToken = [
    tokenOut({ status: "critical", token_name: "stale-token", reason: "unused" }),
  ];
  const res1 = buildZeroTrustInventoryResponse(safeApp, criticalToken, null, "run-1", "t", {});
  assertEquals(res1.critical_finding, {
    kind: "service_token",
    title: "A service token needs attention",
    target: "stale-token",
    description: "unused",
  });

  const res2 = buildZeroTrustInventoryResponse([], [], null, "run-1", "t", {});
  assertEquals(res2.critical_finding, null);
});

Deno.test("buildZeroTrustInventoryResponse - critical_finding reflects the whole list, not just the paginated page", () => {
  const apps = [
    appOut({ app_id: "a-safe", app_domain: "a-safe.test" }),
    appOut({
      app_id: "z-open",
      app_domain: "z-open.test",
      status: "critical",
      reason: "no policy",
    }),
  ];
  const res = buildZeroTrustInventoryResponse(apps, [], null, "run-1", "t", {
    app: { page: "1", page_size: "1" },
  });
  assertEquals(res.applications.map((a) => a.app_domain), ["a-safe.test"]);
  assertEquals(res.critical_finding?.target, "z-open.test");
});

Deno.test("buildZeroTrustInventoryResponse - rejects an invalid sort_key for either collection", () => {
  assertThrows(
    () =>
      buildZeroTrustInventoryResponse([], [tokenOut()], null, "run-1", "t", {
        token: { sort_key: "nope" },
      }),
    PaginationParamError,
  );
});

// A separate, minimal mock focused only on the alert tables'
// SELECT/UPDATE shape (POST /alerts/:kind/:id/acknowledge) — the mocks
// above are purpose-built for GET /inventory's finding queries. Mirrors
// tests/unit/routes.test.ts's (workers-access-exposure) equivalent
// addition and tests/unit/audit-inbox.test.ts's fixed mock: bind()'s arg
// order differs between the SELECT (.bind(id)) and the UPDATE
// (.bind(acknowledgedAt, id)).
interface AlertRow {
  id: string;
  acknowledged_at: string | null;
}

function createAlertMockD1(alertsByTable: Record<string, AlertRow[]>): D1Database {
  return {
    prepare(sql: string) {
      const table = sql.match(/FROM\s+(\w+)|UPDATE\s+(\w+)/i);
      const tableName = table?.[1] ?? table?.[2] ?? "";
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
          return statement;
        },
        first<T>() {
          const id = bound[0] as string;
          const row = (alertsByTable[tableName] ?? []).find((a) => a.id === id);
          return Promise.resolve((row ?? null) as T | null);
        },
        run() {
          const [acknowledgedAt, id] = bound as [string, string];
          const row = (alertsByTable[tableName] ?? []).find((a) => a.id === id);
          if (row) row.acknowledged_at = acknowledgedAt;
          return Promise.resolve({} as D1Result);
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function appAsAdmin(db: D1Database) {
  const app = new Hono<
    { Bindings: { DB: D1Database }; Variables: { identity: { role: "admin" | "member" } } }
  >();
  app.use("*", async (c, next) => {
    c.set("identity", { role: "admin" });
    await next();
  });
  app.route("/", zeroTrustRoutes);
  return (path: string, init?: RequestInit) => app.request(path, init, { DB: db });
}

Deno.test("POST /alerts/:kind/:id/acknowledge - acknowledges an unacknowledged application alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a1", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1({ zt_app_alerts: alerts }));

  const res = await request("/alerts/application/a1/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

Deno.test("POST /alerts/:kind/:id/acknowledge - acknowledges an unacknowledged service_token alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a2", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1({ zt_token_alerts: alerts }));

  const res = await request("/alerts/service_token/a2/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

Deno.test("POST /alerts/:kind/:id/acknowledge - idempotent on an already-acknowledged alert", async () => {
  const alerts: AlertRow[] = [{ id: "a1", acknowledged_at: "2026-08-09T00:00:00Z" }];
  const request = appAsAdmin(createAlertMockD1({ zt_app_alerts: alerts }));

  const res = await request("/alerts/application/a1/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { acknowledged_at: string };
  assertEquals(body.acknowledged_at, "2026-08-09T00:00:00Z");
});

Deno.test("POST /alerts/:kind/:id/acknowledge - 404 on an unknown kind", async () => {
  const request = appAsAdmin(createAlertMockD1({}));
  const res = await request("/alerts/not-a-kind/a1/acknowledge", { method: "POST" });
  assertEquals(res.status, 404);
});

Deno.test("POST /alerts/:kind/:id/acknowledge - 404 on an unknown id", async () => {
  const request = appAsAdmin(createAlertMockD1({ zt_app_alerts: [] }));
  const res = await request("/alerts/application/missing/acknowledge", { method: "POST" });
  assertEquals(res.status, 404);
});
