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
