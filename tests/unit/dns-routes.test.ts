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
          return Promise.resolve({
            results: dnsFindings.filter((r) => r.run_id === runId) as unknown as T[],
          });
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
    zones: { zone_name: string; records: unknown[] }[];
  };

  const zoneNames = body.zones.map((z) => z.zone_name);
  assertEquals(zoneNames.includes("full.example.com"), true);
  // This is the bug T026 fixes: previously an empty zone contributed zero
  // dns_findings rows, so it was entirely absent from `zones` here rather
  // than present with `records: []`.
  assertEquals(zoneNames.includes("empty.example.com"), true);

  const emptyZone = body.zones.find((z) => z.zone_name === "empty.example.com");
  assertEquals(emptyZone?.records, []);

  const fullZone = body.zones.find((z) => z.zone_name === "full.example.com");
  assertEquals(fullZone?.records.length, 1);
});
