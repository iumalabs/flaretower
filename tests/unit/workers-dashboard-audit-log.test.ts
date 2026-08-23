import { assertEquals } from "@std/assert";
import {
  fetchAccountAuditLog,
  filterWorkersRelevant,
} from "../../worker/modules/workers-dashboard/audit-log.ts";

const creds = { accountId: "acct-1", apiToken: "fake-token" };

function rawEntry(actor: string) {
  return {
    when: "2026-08-07T13:42:08Z",
    action: { type: "deploy" },
    actor: { email: actor },
    interface: { type: "api" },
    resource: { type: "worker_script" },
    oldValue: { workers_dev: false },
    newValue: { workers_dev: true },
  };
}

function pageResponse(entries: Array<Record<string, unknown>>) {
  return new Response(
    JSON.stringify({ result: entries }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

Deno.test("fetchAccountAuditLog - parses raw entries into RecentChangeEntry", async () => {
  const fetchImpl = (() => Promise.resolve(pageResponse([rawEntry("wrangler")]))) as typeof fetch;

  const { entries, truncated } = await fetchAccountAuditLog(
    creds,
    new Date("2026-08-06T00:00:00Z"),
    fetchImpl,
  );
  assertEquals(entries.length, 1);
  assertEquals(entries[0].actor, "wrangler");
  assertEquals(entries[0].action, "deploy");
  assertEquals(entries[0].target, "worker_script");
  assertEquals(entries[0].resultSummary, '{"workers_dev":false} -> {"workers_dev":true}');
  assertEquals(truncated, false);
});

// issue #467 — Cloudflare returns oldValue/newValue as "" (not omitted)
// for several action types (update_consumer_settings, script_deploy,
// etc.); this must fall through to null (the UI's own "—" fallback), not
// a literal '"" -> ""' string.
Deno.test('fetchAccountAuditLog - empty-string oldValue/newValue summarizes to null, not a literal \'"" -> ""\'', async () => {
  const fetchImpl = (() =>
    Promise.resolve(pageResponse([{
      when: "2026-08-07T13:42:08Z",
      action: { type: "update_consumer_settings" },
      actor: { email: "wrangler" },
      interface: { type: "api" },
      resource: { type: "worker_script" },
      oldValue: "",
      newValue: "",
    }]))) as typeof fetch;

  const { entries } = await fetchAccountAuditLog(
    creds,
    new Date("2026-08-06T00:00:00Z"),
    fetchImpl,
  );
  assertEquals(entries[0].resultSummary, null);
});

// A real diff where one side happens to be an empty string (not both)
// must still render — only "nothing on either side" counts as nothing.
Deno.test("fetchAccountAuditLog - a real diff still shows when only one side is an empty string", async () => {
  const fetchImpl = (() =>
    Promise.resolve(pageResponse([{
      when: "2026-08-07T13:42:08Z",
      action: { type: "patch_settings" },
      actor: { email: "wrangler" },
      interface: { type: "api" },
      resource: { type: "zone_settings" },
      oldValue: "",
      newValue: "flexible",
    }]))) as typeof fetch;

  const { entries } = await fetchAccountAuditLog(
    creds,
    new Date("2026-08-06T00:00:00Z"),
    fetchImpl,
  );
  assertEquals(entries[0].resultSummary, '"" -> "flexible"');
});

Deno.test("fetchAccountAuditLog - a page shorter than per_page is the last page, not truncated", async () => {
  // 3 entries on the first page, per_page is 100 — well under a full page.
  const fetchImpl =
    (() =>
      Promise.resolve(pageResponse([rawEntry("a"), rawEntry("b"), rawEntry("c")]))) as typeof fetch;

  const { entries, truncated } = await fetchAccountAuditLog(creds, new Date(), fetchImpl);
  assertEquals(entries.length, 3);
  assertEquals(truncated, false);
});

Deno.test("fetchAccountAuditLog - follows the cursor across multiple full pages", async () => {
  let calls = 0;
  const pages = [
    Array.from({ length: 100 }, (_, i) => rawEntry(`page1-${i}`)),
    Array.from({ length: 100 }, (_, i) => rawEntry(`page2-${i}`)),
    Array.from({ length: 40 }, (_, i) => rawEntry(`page3-${i}`)), // short -> last page
  ];
  const fetchImpl = ((input: RequestInfo | URL) => {
    const url = new URL(input as string);
    assertEquals(url.searchParams.get("page"), String(calls + 1));
    calls++;
    return Promise.resolve(pageResponse(pages[calls - 1]));
  }) as typeof fetch;

  const { entries, truncated } = await fetchAccountAuditLog(creds, new Date(), fetchImpl);
  assertEquals(calls, 3);
  assertEquals(entries.length, 240);
  assertEquals(entries[0].actor, "page1-0");
  assertEquals(entries[239].actor, "page3-39");
  assertEquals(truncated, false);
});

Deno.test("fetchAccountAuditLog - stops at the safe cap and reports truncated", async () => {
  // 11 full (100-entry) pages worth of "more data" available — well past the
  // 1000-entry cap — every page the same size so the loop would otherwise
  // run forever following the cursor.
  const fetchImpl = ((input: RequestInfo | URL) => {
    const url = new URL(input as string);
    const page = Number(url.searchParams.get("page"));
    return Promise.resolve(
      pageResponse(Array.from({ length: 100 }, (_, i) => rawEntry(`p${page}-${i}`))),
    );
  }) as typeof fetch;

  const { entries, truncated } = await fetchAccountAuditLog(creds, new Date(), fetchImpl);
  assertEquals(entries.length, 1000);
  assertEquals(truncated, true);
});

Deno.test("filterWorkersRelevant - keeps worker-typed resources", () => {
  const entries = [
    {
      occurredAt: "t",
      actor: "a",
      actorSource: "api",
      action: "deploy",
      target: "worker_script",
      resultSummary: null,
    },
  ];
  assertEquals(filterWorkersRelevant(entries, new Set()).length, 1);
});

Deno.test("filterWorkersRelevant - keeps Access entries referencing a known Worker hostname", () => {
  const entries = [
    {
      occurredAt: "t",
      actor: "@ilse",
      actorSource: "dashboard",
      action: "Bound route to Access application",
      target: "access.application",
      resultSummary: '"internal.acme.dev/gateway/*" -> "platform-core"',
    },
  ];
  const known = new Set(["internal.acme.dev"]);
  assertEquals(filterWorkersRelevant(entries, known).length, 1);
});

Deno.test("filterWorkersRelevant - drops unrelated entries (e.g. DNS-only)", () => {
  const entries = [
    {
      occurredAt: "t",
      actor: "a",
      actorSource: "dashboard",
      action: "Updated DNS record",
      target: "dns_record",
      resultSummary: '"1.2.3.4" -> "5.6.7.8"',
    },
  ];
  const known = new Set(["api.acme.dev"]);
  assertEquals(filterWorkersRelevant(entries, known).length, 0);
});
