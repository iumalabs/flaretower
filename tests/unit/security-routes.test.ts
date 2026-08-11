import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { securityRoutes, serializeTurnstileWidgets } from "../../worker/modules/security/routes.ts";

interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

interface LatestRunRow {
  run_id: string;
  evaluated_at: string;
}

interface InventoryResponseBody {
  run_id: string | null;
  evaluated_at: string | null;
  zones: unknown[];
  turnstile_widgets: Array<{ sitekey: string; name: string; domains: string[] }> | null;
}

// A minimal fake D1 that dispatches on which table a query touches —
// enough to drive GET /inventory's two branches (no run yet / a run
// exists) without a real database, same pattern as
// tests/unit/identity-routes.test.ts.
function createMockD1(options: {
  latestRun: LatestRunRow | null;
  sslTlsRows?: unknown[];
}): D1Database {
  function statementFor(sql: string) {
    const statement = {
      bind(..._args: unknown[]) {
        return statement;
      },
      first<T>() {
        if (/FROM ssl_tls_findings ORDER BY evaluated_at DESC LIMIT 1/.test(sql)) {
          return Promise.resolve(options.latestRun as unknown as T | null);
        }
        return Promise.resolve(null as T | null);
      },
      all<T>() {
        if (/FROM ssl_tls_findings WHERE run_id/.test(sql)) {
          return Promise.resolve({ results: (options.sslTlsRows ?? []) as unknown as T[] });
        }
        // dnssec_findings, waf_findings, rate_limiting_findings — a
        // genuinely zero-zone account (or any zone not yet joined) has
        // no rows in any of these either.
        return Promise.resolve({ results: [] as unknown as T[] });
      },
      run() {
        return Promise.resolve({} as D1Result);
      },
    };
    return statement;
  }

  return {
    prepare(sql: string) {
      return statementFor(sql);
    },
  } as unknown as D1Database;
}

function appWith(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", securityRoutes);
  return (path: string) =>
    app.request(path, undefined, { DB: db, CF_ACCOUNT_ID: "acct-1", CF_API_TOKEN: "fake-token" });
}

// Stubs global fetch (listTurnstileWidgets is called with no fetchImpl
// override in routes.ts, so it always goes through globalThis.fetch) and
// restores it afterward so other tests aren't affected.
async function withStubbedFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function turnstileFailureFetch(): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify({ success: false, result: null, errors: [] }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    )) as typeof fetch;
}

function turnstileSuccessFetch(
  widgets: Array<{ sitekey: string; name: string; domains: string[] }>,
): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify({ success: true, result: widgets, errors: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )) as typeof fetch;
}

Deno.test("serializeTurnstileWidgets - null in, null out (not-evaluated preserved)", () => {
  assertEquals(serializeTurnstileWidgets(null), null);
});

Deno.test("serializeTurnstileWidgets - empty array in, empty array out (confirmed zero, not null)", () => {
  assertEquals(serializeTurnstileWidgets([]), []);
});

Deno.test("serializeTurnstileWidgets - maps sitekey, name, domains", () => {
  const result = serializeTurnstileWidgets([
    { sitekey: "0x123", name: "login", domains: ["example.com"] },
  ]);
  assertEquals(result, [{ sitekey: "0x123", name: "login", domains: ["example.com"] }]);
});

Deno.test("GET /inventory - no run yet, Turnstile fetch fails: turnstile_widgets is null, not []", async () => {
  const request = appWith(createMockD1({ latestRun: null }));

  const body = await withStubbedFetch(
    turnstileFailureFetch(),
    async () => await (await request("/inventory")).json() as InventoryResponseBody,
  );

  assertEquals(body.run_id, null);
  assertEquals(body.zones, []);
  assertEquals(body.turnstile_widgets, null);
});

Deno.test("GET /inventory - no run yet, Turnstile fetch succeeds: turnstile_widgets is the mapped array", async () => {
  const request = appWith(createMockD1({ latestRun: null }));

  const body = await withStubbedFetch(
    turnstileSuccessFetch([{ sitekey: "0x123", name: "login", domains: ["example.com"] }]),
    async () => await (await request("/inventory")).json() as InventoryResponseBody,
  );

  assertEquals(body.run_id, null);
  assertEquals(body.turnstile_widgets, [
    { sitekey: "0x123", name: "login", domains: ["example.com"] },
  ]);
});

Deno.test("GET /inventory - a completed run against a zero-zone account, Turnstile fetch fails: run_id is set, turnstile_widgets is null (not [])", async () => {
  const request = appWith(
    createMockD1({
      latestRun: { run_id: "run-1", evaluated_at: "2026-08-12T00:00:00.000Z" },
      sslTlsRows: [],
    }),
  );

  const body = await withStubbedFetch(
    turnstileFailureFetch(),
    async () => await (await request("/inventory")).json() as InventoryResponseBody,
  );

  assertEquals(body.run_id, "run-1");
  assertEquals(body.zones, []);
  assertEquals(body.turnstile_widgets, null);
});
