import { assertEquals, assertRejects } from "@std/assert";
import { getWorkerLastDeployTimes } from "../../worker/modules/workers-dashboard/inventory.ts";

const creds = { accountId: "acct-1", apiToken: "fake-token" };

Deno.test("getWorkerLastDeployTimes - maps script id to modified_on", async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [
            { id: "worker-a", modified_on: "2026-08-01T00:00:00Z" },
            { id: "worker-b" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )) as typeof fetch;

  const times = await getWorkerLastDeployTimes(creds, fetchImpl);
  assertEquals(times.get("worker-a"), "2026-08-01T00:00:00Z");
  assertEquals(times.get("worker-b"), null);
});

Deno.test("getWorkerLastDeployTimes - HTTP failure throws", async () => {
  const fetchImpl = (() => Promise.resolve(new Response("", { status: 500 }))) as typeof fetch;

  await assertRejects(() => getWorkerLastDeployTimes(creds, fetchImpl));
});

Deno.test("getWorkerLastDeployTimes - success:false throws", async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ success: false, result: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )) as typeof fetch;

  await assertRejects(() => getWorkerLastDeployTimes(creds, fetchImpl));
});
