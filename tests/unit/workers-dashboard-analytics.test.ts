import { assertEquals, assertRejects } from "@std/assert";
import { fetchWorkersAnalytics } from "../../worker/modules/workers-dashboard/analytics.ts";

const creds = { accountId: "acct-1", apiToken: "fake-token" };
const now = new Date("2026-08-13T12:00:00Z");

function graphqlResponse(
  groups: Array<{ scriptName: string; requests: number; errors: number; p50: number; p99: number }>,
) {
  return new Response(
    JSON.stringify({
      data: {
        viewer: {
          accounts: [{
            workersInvocationsAdaptive: groups.map((g) => ({
              dimensions: { scriptName: g.scriptName },
              sum: { requests: g.requests, errors: g.errors },
              quantiles: { cpuTimeP50: g.p50, cpuTimeP99: g.p99 },
            })),
          }],
        },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

Deno.test("fetchWorkersAnalytics - maps current and previous windows independently", async () => {
  let call = 0;
  const fetchImpl = ((_input: RequestInfo | URL, _init?: RequestInit) => {
    call++;
    // First call is the current (trailing-24h) window per fetchWorkersAnalytics's own ordering.
    // p50/p99 here are raw microseconds, as Cloudflare's GraphQL API returns them.
    if (call === 1) {
      return Promise.resolve(
        graphqlResponse([{
          scriptName: "api-gateway",
          requests: 100,
          errors: 5,
          p50: 6000,
          p99: 18000,
        }]),
      );
    }
    return Promise.resolve(
      graphqlResponse([{
        scriptName: "api-gateway",
        requests: 80,
        errors: 2,
        p50: 5000,
        p99: 15000,
      }]),
    );
  }) as typeof fetch;

  const result = await fetchWorkersAnalytics(creds, now, fetchImpl);
  // Converted to milliseconds: 6000µs -> 6ms, 18000µs -> 18ms.
  assertEquals(result.current.perScript, [
    { scriptName: "api-gateway", requests: 100, errors: 5, cpuTimeP50Ms: 6 },
  ]);
  assertEquals(result.current.cpuTimeP99Ms, 18);
  assertEquals(result.previous.perScript[0].requests, 80);
  assertEquals(call, 2);
});

Deno.test("fetchWorkersAnalytics - converts raw microsecond quantiles to milliseconds", async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      graphqlResponse([{
        scriptName: "worker-a",
        requests: 4,
        errors: 0,
        p50: 212500,
        p99: 261190,
      }]),
    )) as typeof fetch;

  const result = await fetchWorkersAnalytics(creds, now, fetchImpl);
  assertEquals(result.current.perScript[0].cpuTimeP50Ms, 212.5);
  assertEquals(result.current.cpuTimeP99Ms, 261.19);
});

Deno.test("fetchWorkersAnalytics - zero groups -> empty perScript, null P99", async () => {
  const fetchImpl = (() => Promise.resolve(graphqlResponse([]))) as typeof fetch;
  const result = await fetchWorkersAnalytics(creds, now, fetchImpl);
  assertEquals(result.current.perScript, []);
  assertEquals(result.current.cpuTimeP99Ms, null);
  assertEquals(result.current.truncated, false);
});

Deno.test("fetchWorkersAnalytics - exactly 1000 groups -> truncated", async () => {
  const groups = Array.from(
    { length: 1000 },
    (_, i) => ({ scriptName: `script-${i}`, requests: 1, errors: 0, p50: 1, p99: 1 }),
  );
  const fetchImpl = (() => Promise.resolve(graphqlResponse(groups))) as typeof fetch;
  const result = await fetchWorkersAnalytics(creds, now, fetchImpl);
  assertEquals(result.current.truncated, true);
});

Deno.test("fetchWorkersAnalytics - under 1000 groups -> not truncated", async () => {
  const groups = Array.from(
    { length: 999 },
    (_, i) => ({ scriptName: `script-${i}`, requests: 1, errors: 0, p50: 1, p99: 1 }),
  );
  const fetchImpl = (() => Promise.resolve(graphqlResponse(groups))) as typeof fetch;
  const result = await fetchWorkersAnalytics(creds, now, fetchImpl);
  assertEquals(result.current.truncated, false);
});

Deno.test("fetchWorkersAnalytics - HTTP failure throws (caller degrades, not this function)", async () => {
  const fetchImpl = (() => Promise.resolve(new Response("nope", { status: 500 }))) as typeof fetch;
  await assertRejects(() => fetchWorkersAnalytics(creds, now, fetchImpl));
});

Deno.test("fetchWorkersAnalytics - GraphQL-level error throws", async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ errors: [{ message: "bad query" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )) as typeof fetch;
  await assertRejects(() => fetchWorkersAnalytics(creds, now, fetchImpl));
});
