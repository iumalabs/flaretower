import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import {
  exposureRoutes,
  runEvaluation,
} from "../../worker/modules/workers-access-exposure/routes.ts";

// A stateful in-memory D1 stand-in: INSERT statements commit straight into
// the relevant in-memory table on bind() (routes.ts always immediately
// db.batch()es what it prepares, with no interleaved reads), and the SELECT
// shapes routes.ts actually issues are pattern-matched below. This is
// deliberately narrower than a real D1 — it only needs to support what
// worker/modules/workers-access-exposure/routes.ts sends it. Mirrors
// tests/unit/dns-routes.test.ts's mock shape.
interface FindingRecord {
  worker_name: string;
  hostname: string;
  hostname_kind: string;
  status: string;
  reason: string;
  evaluated_at: string;
  run_id: string;
  run_trigger: string;
}

function createMockD1(): D1Database {
  const exposureFindings: FindingRecord[] = [];

  function prepare(sql: string) {
    let bound: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) {
        bound = args;
        if (/INSERT INTO exposure_findings/i.test(sql)) {
          const [
            ,
            worker_name,
            hostname,
            hostname_kind,
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
            string,
            string,
            string,
            string,
          ];
          exposureFindings.push({
            worker_name,
            hostname,
            hostname_kind,
            status,
            reason,
            evaluated_at,
            run_id,
            run_trigger,
          });
        }
        // exposure_alerts inserts aren't relevant to this test — dropped.
        return statement;
      },
      all<T>() {
        if (/run_id = \(SELECT run_id FROM exposure_findings/i.test(sql)) {
          if (exposureFindings.length === 0) return Promise.resolve({ results: [] as T[] });
          const latestRunId = [...exposureFindings].sort((a, b) =>
            b.evaluated_at.localeCompare(a.evaluated_at)
          )[0].run_id;
          return Promise.resolve({
            results: exposureFindings.filter((r) => r.run_id === latestRunId) as unknown as T[],
          });
        }
        if (/FROM exposure_findings WHERE run_id = \?/i.test(sql)) {
          const runId = bound[0];
          return Promise.resolve({
            results: exposureFindings.filter((r) => r.run_id === runId) as unknown as T[],
          });
        }
        return Promise.resolve({ results: [] as T[] });
      },
      first<T>() {
        if (/SELECT run_id, evaluated_at FROM exposure_findings/i.test(sql)) {
          if (exposureFindings.length === 0) return Promise.resolve(null);
          const latest = [...exposureFindings].sort((a, b) =>
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

// runEvaluation calls buildWorkerInventory/listAccessApplications without an
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

Deno.test("GET /inventory - a Worker with zero public hostnames still appears, with an empty hostname list (T040)", async () => {
  const db = createMockD1();
  const env = { DB: db, CF_ACCOUNT_ID: "acct-1", CF_API_TOKEN: "fake-token" };

  await withMockFetch(
    [
      ["/workers/scripts", () =>
        jsonResponse({
          success: true,
          result: [{ id: "billing-api" }, { id: "internal-only" }],
          errors: [],
        })],
      ["/workers/domains", () =>
        jsonResponse({
          success: true,
          result: [{ hostname: "billing.example.com", service: "billing-api" }],
          errors: [],
        })],
      // Account has no workers.dev subdomain configured — 404 means
      // "confirmed absent" per getAccountWorkersDevSubdomain, so neither
      // Worker gets a workers_dev/preview_url hostname. "internal-only" has
      // no custom domain either, so it ends up with zero hostnames — a
      // normal, error-free outcome.
      ["/workers/subdomain", () => jsonResponse({ success: false, result: null, errors: [] }, 404)],
      ["/access/apps", () => jsonResponse({ success: true, result: [], errors: [] })],
    ],
    () => runEvaluation(env, "interactive"),
  );

  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route("/", exposureRoutes);
  const res = await app.request("/inventory", {}, { DB: db });

  assertEquals(res.status, 200);
  const body = await res.json() as {
    workers: { worker_name: string; hostnames: unknown[] }[];
  };

  const workerNames = body.workers.map((w) => w.worker_name);
  assertEquals(workerNames.includes("billing-api"), true);
  // This is the bug T040 fixes: previously a zero-hostname Worker
  // contributed zero exposure_findings rows, so it was entirely absent
  // from `workers` here rather than present with `hostnames: []`.
  assertEquals(workerNames.includes("internal-only"), true);

  const zeroHostnameWorker = body.workers.find((w) => w.worker_name === "internal-only");
  assertEquals(zeroHostnameWorker?.hostnames, []);

  const billingWorker = body.workers.find((w) => w.worker_name === "billing-api");
  assertEquals(billingWorker?.hostnames.length, 1);
});
