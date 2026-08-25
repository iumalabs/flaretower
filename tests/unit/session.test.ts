import { assertEquals } from "@std/assert";
import { fetchSession } from "../../app/lib/session.ts";

function mockFetch(response: Response | (() => Promise<Response>)) {
  globalThis.fetch =
    (() => typeof response === "function" ? response() : Promise.resolve(response)) as typeof fetch;
}

Deno.test("fetchSession - a 200 response resolves to the identity", async () => {
  mockFetch(
    new Response(JSON.stringify({ email: "operator@example.com", role: "member" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const identity = await fetchSession();
  assertEquals(identity, { email: "operator@example.com", role: "member" });
});

// issue #488-adjacent caution: this feature's own quickstart.md notes local
// dev may not route /api/* through the real Worker at all — fetchSession()
// must treat that the same as a real 403, not throw.
Deno.test("fetchSession - a 403 (accessAuth's fail-closed response) resolves to null", async () => {
  mockFetch(new Response("Forbidden", { status: 403 }));

  const identity = await fetchSession();
  assertEquals(identity, null);
});

Deno.test("fetchSession - a malformed (non-JSON) 200 body resolves to null, not a thrown error", async () => {
  mockFetch(new Response("<html>not json</html>", { status: 200 }));

  const identity = await fetchSession();
  assertEquals(identity, null);
});

Deno.test("fetchSession - a 200 body missing the expected shape resolves to null", async () => {
  mockFetch(
    new Response(JSON.stringify({ email: "operator@example.com" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const identity = await fetchSession();
  assertEquals(identity, null);
});

Deno.test("fetchSession - a network error resolves to null, not a thrown/rejected promise", async () => {
  mockFetch(() => Promise.reject(new Error("network down")));

  const identity = await fetchSession();
  assertEquals(identity, null);
});
