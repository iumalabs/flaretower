import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { securityRoutes } from "../../worker/modules/security/routes.ts";

// specs/017-security-dashboard: GET /inventory also live-fetches Turnstile
// widgets (worker/modules/security/inventory.ts's listTurnstileWidgets),
// which uses the ambient global `fetch` rather than an injectable
// parameter these route-level tests can pass in. Stubbed to fail fast
// rather than making a real network call — exercises the same
// graceful-degradation path (`turnstile_widgets: null`) a real
// credential/network failure would, same precedent as
// zero-trust-routes.test.ts.
globalThis.fetch =
  (() => Promise.reject(new Error("network disabled in this unit test"))) as typeof fetch;

interface FindingRow {
  zone_id: string;
  zone_name: string;
  status: string;
  reason: string;
  run_id: string;
  evaluated_at: string;
}

function createMockD1(
  seed: {
    sslTls: FindingRow[];
    dnssec: FindingRow[];
    waf: FindingRow[];
    rateLimiting: FindingRow[];
    botFightMode?: FindingRow[];
    alwaysHttps?: FindingRow[];
    minTls?: FindingRow[];
  },
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
          if (
            /SELECT run_id, evaluated_at FROM ssl_tls_findings ORDER BY evaluated_at DESC/i.test(
              sql,
            )
          ) {
            if (seed.sslTls.length === 0) return Promise.resolve(null);
            const latest = [...seed.sslTls].sort((a, b) =>
              b.evaluated_at.localeCompare(a.evaluated_at)
            )[0];
            return Promise.resolve(
              { run_id: latest.run_id, evaluated_at: latest.evaluated_at } as unknown as T,
            );
          }
          throw new Error(`Unhandled mock D1 first() call: ${sql}`);
        },
        all<T>() {
          const runId = bound[0] as string;
          if (/FROM ssl_tls_findings WHERE run_id = \?/i.test(sql)) {
            return Promise.resolve({
              results: seed.sslTls.filter((r) => r.run_id === runId) as unknown as T[],
            });
          }
          if (/FROM dnssec_findings WHERE run_id = \?/i.test(sql)) {
            return Promise.resolve({
              results: seed.dnssec.filter((r) => r.run_id === runId) as unknown as T[],
            });
          }
          if (/FROM waf_findings WHERE run_id = \?/i.test(sql)) {
            return Promise.resolve({
              results: seed.waf.filter((r) => r.run_id === runId) as unknown as T[],
            });
          }
          if (/FROM rate_limiting_findings WHERE run_id = \?/i.test(sql)) {
            return Promise.resolve({
              results: seed.rateLimiting.filter((r) => r.run_id === runId) as unknown as T[],
            });
          }
          if (/FROM bot_fight_mode_findings WHERE run_id = \?/i.test(sql)) {
            return Promise.resolve({
              results: (seed.botFightMode ?? []).filter((r) =>
                r.run_id === runId
              ) as unknown as T[],
            });
          }
          if (/FROM always_https_findings WHERE run_id = \?/i.test(sql)) {
            return Promise.resolve({
              results: (seed.alwaysHttps ?? []).filter((r) => r.run_id === runId) as unknown as T[],
            });
          }
          if (/FROM min_tls_findings WHERE run_id = \?/i.test(sql)) {
            return Promise.resolve({
              results: (seed.minTls ?? []).filter((r) => r.run_id === runId) as unknown as T[],
            });
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
  hono.route("/", securityRoutes);
  return (path: string) =>
    hono.request(path, undefined, { DB: db, CF_ACCOUNT_ID: "acct-1", CF_API_TOKEN: "tok" });
}

function row(zoneId: string, status: string): FindingRow {
  return {
    zone_id: zoneId,
    zone_name: `${zoneId}.example.com`,
    status,
    reason: "test",
    run_id: "run-1",
    evaluated_at: "2026-08-13T00:00:00Z",
  };
}

// specs/017-security-dashboard FR-001/FR-002
Deno.test("GET /inventory - assembles one row per zone, with overall_status the worst of its checks", async () => {
  const request = app(createMockD1({
    sslTls: [row("zone-1", "safe"), row("zone-2", "safe")],
    dnssec: [row("zone-1", "safe"), row("zone-2", "critical")],
    waf: [row("zone-1", "safe"), row("zone-2", "safe")],
    rateLimiting: [row("zone-1", "safe"), row("zone-2", "safe")],
  }));

  const res = await request("/inventory");
  assertEquals(res.status, 200);
  const body = await res.json() as {
    zones: Array<{ zone_id: string; overall_status: string }>;
  };

  assertEquals(body.zones.length, 2);
  const zone1 = body.zones.find((z) => z.zone_id === "zone-1")!;
  const zone2 = body.zones.find((z) => z.zone_id === "zone-2")!;
  assertEquals(zone1.overall_status, "safe");
  assertEquals(zone2.overall_status, "critical");
});

Deno.test("GET /inventory - a warning check with no critical anywhere rolls up to warning, not safe", async () => {
  const request = app(createMockD1({
    sslTls: [row("zone-1", "safe")],
    dnssec: [row("zone-1", "safe")],
    waf: [row("zone-1", "warning")],
    rateLimiting: [row("zone-1", "safe")],
  }));

  const res = await request("/inventory");
  const body = await res.json() as { zones: Array<{ overall_status: string }> };
  assertEquals(body.zones[0].overall_status, "warning");
});

Deno.test("GET /inventory - run_id is null when the evaluation has never run", async () => {
  const request = app(createMockD1({ sslTls: [], dnssec: [], waf: [], rateLimiting: [] }));

  const res = await request("/inventory");
  const body = await res.json() as { run_id: string | null; zones: unknown[] };

  assertEquals(body.run_id, null);
  assertEquals(body.zones, []);
});

// A separate, minimal mock focused only on the alert tables'
// SELECT/UPDATE shape (POST /alerts/:kind/:id/acknowledge) — the mock
// above is purpose-built for GET /inventory's finding queries. Mirrors
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
  app.route("/", securityRoutes);
  return (path: string, init?: RequestInit) => app.request(path, init, { DB: db });
}

Deno.test("POST /alerts/:kind/:id/acknowledge - acknowledges an unacknowledged ssl_tls alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a1", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1({ ssl_tls_alerts: alerts }));

  const res = await request("/alerts/ssl_tls/a1/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

// bot_fight_mode is one of the 3 checks added by migration 0013 (specs
// 017) — confirms the newer ALERT_TABLE_BY_KIND entries work identically
// to the original 4, not just the ones present since this route's first
// version.
Deno.test("POST /alerts/:kind/:id/acknowledge - acknowledges an unacknowledged bot_fight_mode alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a2", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1({ bot_fight_mode_alerts: alerts }));

  const res = await request("/alerts/bot_fight_mode/a2/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

Deno.test("POST /alerts/:kind/:id/acknowledge - idempotent on an already-acknowledged alert", async () => {
  const alerts: AlertRow[] = [{ id: "a1", acknowledged_at: "2026-08-09T00:00:00Z" }];
  const request = appAsAdmin(createAlertMockD1({ ssl_tls_alerts: alerts }));

  const res = await request("/alerts/ssl_tls/a1/acknowledge", { method: "POST" });

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
  const request = appAsAdmin(createAlertMockD1({ ssl_tls_alerts: [] }));
  const res = await request("/alerts/ssl_tls/missing/acknowledge", { method: "POST" });
  assertEquals(res.status, 404);
});
