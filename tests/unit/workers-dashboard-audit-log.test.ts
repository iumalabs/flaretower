import { assertEquals } from "@std/assert";
import {
  fetchAccountAuditLog,
  filterWorkersRelevant,
} from "../../worker/modules/workers-dashboard/audit-log.ts";

const creds = { accountId: "acct-1", apiToken: "fake-token" };

Deno.test("fetchAccountAuditLog - parses raw entries into RecentChangeEntry", async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          result: [
            {
              when: "2026-08-07T13:42:08Z",
              action: { type: "deploy" },
              actor: { email: "wrangler" },
              interface: { type: "api" },
              resource: { type: "worker_script" },
              oldValue: { workers_dev: false },
              newValue: { workers_dev: true },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )) as typeof fetch;

  const entries = await fetchAccountAuditLog(creds, new Date("2026-08-06T00:00:00Z"), fetchImpl);
  assertEquals(entries.length, 1);
  assertEquals(entries[0].actor, "wrangler");
  assertEquals(entries[0].action, "deploy");
  assertEquals(entries[0].target, "worker_script");
  assertEquals(entries[0].resultSummary, '{"workers_dev":false} -> {"workers_dev":true}');
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
