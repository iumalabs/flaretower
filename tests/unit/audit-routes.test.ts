import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { auditRoutes } from "../../worker/modules/audit/routes.ts";

// specs/018-audit-dashboard: GET /log calls fetchAccountAuditLog(), which
// uses the ambient global `fetch` (ties into the same underlying Audit
// Logs API call workers-dashboard/audit-log.ts's own tests exercise) —
// stubbed per-test below rather than left to make a real network call.

function app(db: D1Database) {
  const hono = new Hono<
    { Bindings: { DB: D1Database; CF_ACCOUNT_ID: string; CF_API_TOKEN: string } }
  >();
  hono.route("/", auditRoutes);
  return (path: string) =>
    hono.request(path, undefined, { DB: db, CF_ACCOUNT_ID: "acct-1", CF_API_TOKEN: "tok" });
}

const NOOP_DB = {} as unknown as D1Database;

Deno.test("GET /log - maps real entries, since defaults to 7 days before now", async () => {
  let capturedUrl = "";
  globalThis.fetch = ((input: RequestInfo | URL) => {
    capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          result: [
            {
              when: "2026-08-13T09:04:12Z",
              actor: { email: "user@example.com" },
              interface: { type: "dashboard" },
              action: { type: "zone.settings.change" },
              resource: { type: "zone" },
              oldValue: "off",
              newValue: "on",
            },
          ],
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;

  const res = await app(NOOP_DB)("/log");
  assertEquals(res.status, 200);
  const body = await res.json() as {
    since: string;
    until: string;
    unavailable: boolean;
    entries: Array<{ occurred_at: string; actor: string; actor_source: string }>;
  };

  assertEquals(body.unavailable, false);
  assertEquals(body.entries.length, 1);
  assertEquals(body.entries[0].actor, "user@example.com");
  assertEquals(body.entries[0].actor_source, "dashboard");

  const sinceMs = new Date(body.since).getTime();
  const untilMs = new Date(body.until).getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  assertEquals(Math.round((untilMs - sinceMs) / sevenDaysMs), 1);
  assertEquals(capturedUrl.includes("since="), true);
});

Deno.test("GET /log - unavailable: true (not a thrown error) when the Cloudflare API call rejects", async () => {
  globalThis.fetch = (() => Promise.reject(new Error("network error"))) as typeof fetch;

  const res = await app(NOOP_DB)("/log");
  assertEquals(res.status, 200);
  const body = await res.json() as { unavailable: boolean; entries: unknown[] };

  assertEquals(body.unavailable, true);
  assertEquals(body.entries, []);
});

Deno.test("GET /log - unavailable: true when the Cloudflare API responds with a non-2xx status", async () => {
  globalThis.fetch =
    (() => Promise.resolve(new Response("forbidden", { status: 403 }))) as typeof fetch;

  const res = await app(NOOP_DB)("/log");
  assertEquals(res.status, 200);
  const body = await res.json() as { unavailable: boolean; entries: unknown[] };

  assertEquals(body.unavailable, true);
  assertEquals(body.entries, []);
});
