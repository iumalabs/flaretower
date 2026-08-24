import { assertEquals, assertThrows } from "@std/assert";
import { Hono } from "hono";
import {
  buildSecurityInventoryResponse,
  previousStatusReader,
  securityRoutes,
} from "../../worker/modules/security/routes.ts";
import { PaginationParamError } from "../../worker/pagination.ts";

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

// issue #470 (same class as #465, fixed for storage first) — every
// getPrevious*Statuses/getOpen*Alerts read in runSecurityEvaluation only
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

// specs/020-list-pagination — buildSecurityInventoryResponse() is pure
// (extracted from the route handler), so these exercise the 3-collection
// pagination/sort/critical_finding logic — and the camelCase->snake_case
// serialization fix for certificates/waf_custom_rules — directly.
function zoneOut(overrides: Partial<{
  zone_id: string;
  zone_name: string;
  overall_status: string;
  ssl_tls: { status: string; reason: string };
  dnssec: { status: string; reason: string };
}> = {}) {
  return {
    zone_id: "z1",
    zone_name: "z1.example.com",
    overall_status: "safe",
    ssl_tls: { status: "safe", reason: "strict" },
    ...overrides,
  };
}

Deno.test("buildSecurityInventoryResponse - zones paginate; certificates/waf_custom_rules stay null when the live fetch failed", () => {
  const zones = Array.from(
    { length: 3 },
    (_, i) => zoneOut({ zone_id: `z${i}`, zone_name: `z${i}.test` }),
  );
  const res = buildSecurityInventoryResponse(zones, null, null, null, "run-1", "t", {
    zone: { page_size: "2" },
  });

  assertEquals(res.zones.length, 2);
  assertEquals(res.zones_pagination, { page: 1, page_size: 2, total: 3, total_pages: 2 });
  assertEquals(res.certificates, null);
  assertEquals(res.certificates_pagination, null);
  assertEquals(res.waf_custom_rules, null);
  assertEquals(res.waf_custom_rules_pagination, null);
});

Deno.test("buildSecurityInventoryResponse - critical_finding reflects the whole zones list, not just the paginated page", () => {
  const zones = [
    zoneOut({ zone_id: "a", zone_name: "a.test", overall_status: "safe" }),
    zoneOut({
      zone_id: "z",
      zone_name: "z.test",
      overall_status: "critical",
      dnssec: { status: "critical", reason: "DNSSEC not enabled" },
    }),
  ];
  const res = buildSecurityInventoryResponse(zones, null, null, null, "run-1", "t", {
    zone: { page: "1", page_size: "1" },
  });

  assertEquals(res.zones.map((z) => z.zone_name), ["a.test"]);
  assertEquals(res.critical_finding, {
    zone_name: "z.test",
    description: "DNSSEC: DNSSEC not enabled",
  });
});

Deno.test("buildSecurityInventoryResponse - critical_finding falls back to SSL/TLS when no specific check is critical", () => {
  // overall_status critical but no individual check object marked
  // critical (shouldn't normally happen, but the fallback must not throw).
  const zones = [zoneOut({ overall_status: "critical" })];
  const res = buildSecurityInventoryResponse(zones, null, null, null, "run-1", "t", {});
  assertEquals(res.critical_finding?.description, "SSL/TLS: strict");
});

Deno.test("buildSecurityInventoryResponse - certificates/waf_custom_rules are serialized to snake_case, not passed through as-fetched camelCase", () => {
  const certificates = [
    {
      zoneId: "z1",
      zoneName: "z1.example.com",
      hosts: ["z1.example.com"],
      issuer: "Let's Encrypt",
      expiresOn: "2026-12-01T00:00:00Z",
      status: "safe" as const,
    },
  ];
  const wafRules = [
    {
      zoneId: "z1",
      zoneName: "z1.example.com",
      description: "block bad bots",
      expression: '(http.user_agent contains "bad")',
      action: "block",
      enabled: true,
      status: "safe" as const,
    },
  ];

  const res = buildSecurityInventoryResponse([], certificates, wafRules, null, "run-1", "t", {});

  assertEquals(res.certificates, [{
    zone_id: "z1",
    zone_name: "z1.example.com",
    hosts: ["z1.example.com"],
    issuer: "Let's Encrypt",
    expires_on: "2026-12-01T00:00:00Z",
    status: "safe",
  }]);
  assertEquals(res.waf_custom_rules, [{
    zone_id: "z1",
    zone_name: "z1.example.com",
    description: "block bad bots",
    expression: '(http.user_agent contains "bad")',
    action: "block",
    enabled: true,
    status: "safe",
  }]);
});

Deno.test("buildSecurityInventoryResponse - certificates and waf_custom_rules paginate independently of zones and each other", () => {
  const certificates = Array.from({ length: 3 }, (_, i) => ({
    zoneId: `z${i}`,
    zoneName: `z${i}.test`,
    hosts: [],
    issuer: "",
    expiresOn: null,
    status: "safe" as const,
  }));
  const res = buildSecurityInventoryResponse([], certificates, [], null, "run-1", "t", {
    certificate: { page_size: "1" },
  });
  assertEquals(res.certificates?.length, 1);
  assertEquals(res.certificates_pagination, { page: 1, page_size: 1, total: 3, total_pages: 3 });
  assertEquals(res.waf_custom_rules, []);
  assertEquals(res.waf_custom_rules_pagination, {
    page: 1,
    page_size: 50,
    total: 0,
    total_pages: 1,
  });
});

Deno.test("buildSecurityInventoryResponse - rejects an invalid page for any one collection", () => {
  assertThrows(
    () => buildSecurityInventoryResponse([], [], [], null, "run-1", "t", { zone: { page: "0" } }),
    PaginationParamError,
  );
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
