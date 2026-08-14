import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { dnsRoutes, runDnsEvaluation } from "../../worker/modules/dns/routes.ts";

// A stateful in-memory D1 stand-in: INSERT statements commit straight into
// the relevant in-memory table on bind() (routes.ts always immediately
// db.batch()es what it prepares, with no interleaved reads), and the SELECT
// shapes routes.ts actually issues are pattern-matched below. This is
// deliberately narrower than a real D1 — it only needs to support what
// worker/modules/dns/routes.ts sends it.
interface FindingRecord {
  zone_name: string;
  record_name: string;
  record_type: string;
  content: string;
  proxy_capable: number;
  proxied: number | null;
  status: string;
  reason: string;
  evaluated_at: string;
  run_id: string;
  run_trigger: string;
}

function createMockD1(): D1Database {
  const dnsFindings: FindingRecord[] = [];

  function prepare(sql: string) {
    let bound: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) {
        bound = args;
        if (/INSERT INTO dns_findings/i.test(sql)) {
          const [
            ,
            zone_name,
            record_name,
            record_type,
            content,
            proxy_capable,
            proxied,
            status,
            reason,
            evaluated_at,
            run_id,
            run_trigger,
          ] = args as [
            string,
            string,
            string,
            string,
            string,
            number,
            number | null,
            string,
            string,
            string,
            string,
            string,
          ];
          dnsFindings.push({
            zone_name,
            record_name,
            record_type,
            content,
            proxy_capable,
            proxied,
            status,
            reason,
            evaluated_at,
            run_id,
            run_trigger,
          });
        }
        // dns_alerts inserts aren't relevant to this test — dropped.
        return statement;
      },
      all<T>() {
        if (/run_id = \(SELECT run_id FROM dns_findings/i.test(sql)) {
          if (dnsFindings.length === 0) return Promise.resolve({ results: [] as T[] });
          const latestRunId = [...dnsFindings].sort((a, b) =>
            b.evaluated_at.localeCompare(a.evaluated_at)
          )[0].run_id;
          return Promise.resolve({
            results: dnsFindings.filter((r) => r.run_id === latestRunId) as unknown as T[],
          });
        }
        if (/FROM dns_findings WHERE run_id = \?/i.test(sql)) {
          const runId = bound[0];
          // Real D1 honors this query's own `ORDER BY zone_name, record_name,
          // record_type` — sorted here too, since buildDnsInventoryResponse
          // (routes.ts) relies on row order to pick its default zone.
          const results = dnsFindings
            .filter((r) => r.run_id === runId)
            .sort((a, b) =>
              a.zone_name.localeCompare(b.zone_name) ||
              a.record_name.localeCompare(b.record_name) ||
              a.record_type.localeCompare(b.record_type)
            );
          return Promise.resolve({ results: results as unknown as T[] });
        }
        return Promise.resolve({ results: [] as T[] });
      },
      first<T>() {
        if (/SELECT run_id, evaluated_at FROM dns_findings/i.test(sql)) {
          if (dnsFindings.length === 0) return Promise.resolve(null);
          const latest = [...dnsFindings].sort((a, b) =>
            b.evaluated_at.localeCompare(a.evaluated_at)
          )[0];
          return Promise.resolve(
            { run_id: latest.run_id, evaluated_at: latest.evaluated_at } as unknown as T,
          );
        }
        return Promise.resolve(null);
      },
      run() {
        return Promise.resolve({} as D1Result);
      },
    };
    return statement;
  }

  return {
    prepare,
    batch(statements: unknown[]) {
      // Each statement already committed its row on bind() above — batch()
      // just needs to resolve with one result per statement.
      return Promise.resolve(statements.map(() => ({} as D1Result)));
    },
  } as unknown as D1Database;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// runDnsEvaluation calls buildDnsInventory/listDanglingInsights without an
// injected fetchImpl, so it always goes through the ambient global fetch —
// this test stubs that directly and restores it afterwards.
function withMockFetch<T>(handlers: Array<[string, () => Response]>, fn: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(url).pathname;
    for (const [suffix, handler] of handlers) {
      if (pathname.endsWith(suffix)) return Promise.resolve(handler());
    }
    return Promise.reject(new Error(`Unhandled mock fetch call: ${url}`));
  }) as typeof fetch;

  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test("GET /inventory - a zone with zero DNS records still appears, with an empty record list (T026)", async () => {
  const db = createMockD1();
  const env = { DB: db, CF_ACCOUNT_ID: "acct-1", CF_API_TOKEN: "fake-token" };

  await withMockFetch(
    [
      ["/zones", () =>
        jsonResponse({
          success: true,
          result: [
            { id: "zone-1", name: "full.example.com" },
            { id: "zone-2", name: "empty.example.com" },
          ],
          errors: [],
        })],
      ["/zones/zone-1/dns_records", () =>
        jsonResponse({
          success: true,
          result: [
            {
              name: "www.full.example.com",
              type: "A",
              content: "203.0.113.1",
              proxiable: true,
              proxied: true,
            },
          ],
          errors: [],
        })],
      ["/zones/zone-2/dns_records", () => jsonResponse({ success: true, result: [], errors: [] })],
      [
        "/security-center/insights",
        () => jsonResponse({ success: true, result: { issues: [] }, errors: [] }),
      ],
    ],
    () => runDnsEvaluation(env, "interactive"),
  );

  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route("/", dnsRoutes);
  const res = await app.request("/inventory", {}, { DB: db });

  assertEquals(res.status, 200);
  const body = await res.json() as {
    zone_summaries: { zone_name: string; record_count: number }[];
    selected_zone: string;
    records: unknown[];
  };

  const zoneNames = body.zone_summaries.map((z) => z.zone_name);
  assertEquals(zoneNames.includes("full.example.com"), true);
  // This is the bug T026 fixes: previously an empty zone contributed zero
  // dns_findings rows, so it was entirely absent here rather than present
  // with record_count: 0.
  assertEquals(zoneNames.includes("empty.example.com"), true);

  const emptySummary = body.zone_summaries.find((z) => z.zone_name === "empty.example.com");
  assertEquals(emptySummary?.record_count, 0);

  const fullSummary = body.zone_summaries.find((z) => z.zone_name === "full.example.com");
  assertEquals(fullSummary?.record_count, 1);

  // Default selection is alphabetically first ("empty.example.com" < "full...").
  assertEquals(body.selected_zone, "empty.example.com");
  assertEquals(body.records, []);
});

Deno.test("GET /inventory - the zone query param selects which zone's records are returned/paginated", async () => {
  const db = createMockD1();
  const env = { DB: db, CF_ACCOUNT_ID: "acct-1", CF_API_TOKEN: "fake-token" };

  await withMockFetch(
    [
      ["/zones", () =>
        jsonResponse({
          success: true,
          result: [{ id: "zone-1", name: "full.example.com" }],
          errors: [],
        })],
      ["/zones/zone-1/dns_records", () =>
        jsonResponse({
          success: true,
          result: [
            {
              name: "a.full.example.com",
              type: "A",
              content: "1.1.1.1",
              proxiable: true,
              proxied: true,
            },
            {
              name: "b.full.example.com",
              type: "A",
              content: "2.2.2.2",
              proxiable: true,
              proxied: false,
            },
          ],
          errors: [],
        })],
      [
        "/security-center/insights",
        () => jsonResponse({ success: true, result: { issues: [] }, errors: [] }),
      ],
    ],
    () => runDnsEvaluation(env, "interactive"),
  );

  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route("/", dnsRoutes);
  const res = await app.request("/inventory?zone=full.example.com&sort_key=name&page_size=1", {}, {
    DB: db,
  });

  assertEquals(res.status, 200);
  const body = await res.json() as {
    total_records: number;
    selected_zone: string;
    records: Array<{ record_name: string }>;
    records_pagination: { page: number; page_size: number; total: number; total_pages: number };
  };

  assertEquals(body.total_records, 2);
  assertEquals(body.selected_zone, "full.example.com");
  assertEquals(body.records.length, 1);
  assertEquals(body.records[0].record_name, "a.full.example.com");
  assertEquals(body.records_pagination, { page: 1, page_size: 1, total: 2, total_pages: 2 });
});

Deno.test("GET /inventory - an invalid page_size returns 400, not a silent fallback", async () => {
  const db = createMockD1();
  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route("/", dnsRoutes);
  const res = await app.request("/inventory?page_size=0", {}, { DB: db });
  assertEquals(res.status, 400);
});

// A separate, minimal mock focused only on dns_alerts' SELECT/UPDATE shape
// (POST /alerts/:id/acknowledge) — the mock above is purpose-built for
// GET /inventory's dns_findings queries. Mirrors tests/unit/routes.test.ts's
// (workers-access-exposure) equivalent addition and
// tests/unit/audit-inbox.test.ts's fixed mock: bind()'s arg order differs
// between the SELECT (.bind(id)) and the UPDATE (.bind(acknowledgedAt, id)).
interface AlertRow {
  id: string;
  acknowledged_at: string | null;
}

function createAlertMockD1(alerts: AlertRow[]): D1Database {
  return {
    prepare(_sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
          return statement;
        },
        first<T>() {
          const id = bound[0] as string;
          const row = alerts.find((a) => a.id === id);
          return Promise.resolve((row ?? null) as T | null);
        },
        run() {
          const [acknowledgedAt, id] = bound as [string, string];
          const row = alerts.find((a) => a.id === id);
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
  app.route("/", dnsRoutes);
  return (path: string, init?: RequestInit) => app.request(path, init, { DB: db });
}

Deno.test("POST /alerts/:id/acknowledge - acknowledges an unacknowledged alert and persists it", async () => {
  const alerts: AlertRow[] = [{ id: "a1", acknowledged_at: null }];
  const request = appAsAdmin(createAlertMockD1(alerts));

  const res = await request("/alerts/a1/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; acknowledged_at: string };
  assertEquals(body.id, "a1");
  assertEquals(alerts[0].acknowledged_at, body.acknowledged_at);
});

Deno.test("POST /alerts/:id/acknowledge - idempotent on an already-acknowledged alert", async () => {
  const alerts: AlertRow[] = [{ id: "a1", acknowledged_at: "2026-08-09T00:00:00Z" }];
  const request = appAsAdmin(createAlertMockD1(alerts));

  const res = await request("/alerts/a1/acknowledge", { method: "POST" });

  assertEquals(res.status, 200);
  const body = await res.json() as { acknowledged_at: string };
  assertEquals(body.acknowledged_at, "2026-08-09T00:00:00Z");
});

Deno.test("POST /alerts/:id/acknowledge - 404 on an unknown id", async () => {
  const request = appAsAdmin(createAlertMockD1([]));
  const res = await request("/alerts/missing/acknowledge", { method: "POST" });
  assertEquals(res.status, 404);
});
