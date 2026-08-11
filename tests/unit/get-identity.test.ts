import { assertEquals } from "@std/assert";
import { fetchIdentityProvider } from "../../worker/auth/get-identity.ts";

function withMockFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test("fetchIdentityProvider - returns idp.type on a successful response", async () => {
  const idp = await withMockFetch(
    () =>
      Promise.resolve(
        new Response(JSON.stringify({ idp: { id: "abc", type: "google-apps" } }), {
          status: 200,
        }),
      ),
    () => fetchIdentityProvider("https://team.cloudflareaccess.com", "jwt-value"),
  );

  assertEquals(idp, "google-apps");
});

Deno.test("fetchIdentityProvider - returns 'unknown' on a non-200 response, never throws", async () => {
  const idp = await withMockFetch(
    () => Promise.resolve(new Response("could not retrieve identity", { status: 404 })),
    () => fetchIdentityProvider("https://team.cloudflareaccess.com", "jwt-value"),
  );

  assertEquals(idp, "unknown");
});

Deno.test("fetchIdentityProvider - returns 'unknown' on a network error, never throws", async () => {
  const idp = await withMockFetch(
    () => Promise.reject(new Error("network down")),
    () => fetchIdentityProvider("https://team.cloudflareaccess.com", "jwt-value"),
  );

  assertEquals(idp, "unknown");
});

Deno.test("fetchIdentityProvider - returns 'unknown' when idp.type is missing from an otherwise-200 response", async () => {
  const idp = await withMockFetch(
    () => Promise.resolve(new Response(JSON.stringify({ id: "abc" }), { status: 200 })),
    () => fetchIdentityProvider("https://team.cloudflareaccess.com", "jwt-value"),
  );

  assertEquals(idp, "unknown");
});
