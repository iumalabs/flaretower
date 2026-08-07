import { assertEquals } from "@std/assert";
import {
  buildStorageInventory,
  listD1Databases,
  listKvNamespaces,
  listR2Buckets,
} from "../../worker/modules/storage/inventory.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(handlers: Array<[string, () => Response]>): typeof fetch {
  return ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(url).pathname;
    for (const [suffix, handler] of handlers) {
      if (pathname.endsWith(suffix)) return Promise.resolve(handler());
    }
    return Promise.reject(new Error(`Unhandled mock fetch call: ${url}`));
  }) as typeof fetch;
}

const creds = { accountId: "acct-1", apiToken: "fake-token" };

Deno.test("listR2Buckets - maps bucket names", async () => {
  const fetchImpl = mockFetch([
    [
      "/r2/buckets",
      () =>
        jsonResponse({
          success: true,
          result: [{ name: "uploads" }, { name: "backups" }],
          errors: [],
        }),
    ],
  ]);

  const buckets = await listR2Buckets(creds, fetchImpl);

  assertEquals(buckets.length, 2);
  assertEquals(buckets[0].name, "uploads");
});

Deno.test("listKvNamespaces - maps id and title", async () => {
  const fetchImpl = mockFetch([
    [
      "/storage/kv/namespaces",
      () =>
        jsonResponse({ success: true, result: [{ id: "kv-1", title: "SESSIONS" }], errors: [] }),
    ],
  ]);

  const namespaces = await listKvNamespaces(creds, fetchImpl);

  assertEquals(namespaces, [{ id: "kv-1", title: "SESSIONS" }]);
});

Deno.test("listD1Databases - maps uuid and name", async () => {
  const fetchImpl = mockFetch([
    [
      "/d1/database",
      () =>
        jsonResponse({ success: true, result: [{ uuid: "db-1", name: "flaretower" }], errors: [] }),
    ],
  ]);

  const databases = await listD1Databases(creds, fetchImpl);

  assertEquals(databases, [{ uuid: "db-1", name: "flaretower" }]);
});

Deno.test("buildStorageInventory - every bucket, namespace, and database is enumerated, none omitted", async () => {
  const fetchImpl = mockFetch([
    [
      "/r2/buckets",
      () => jsonResponse({ success: true, result: [{ name: "uploads" }], errors: [] }),
    ],
    [
      "/storage/kv/namespaces",
      () =>
        jsonResponse({ success: true, result: [{ id: "kv-1", title: "SESSIONS" }], errors: [] }),
    ],
    [
      "/d1/database",
      () =>
        jsonResponse({ success: true, result: [{ uuid: "db-1", name: "flaretower" }], errors: [] }),
    ],
  ]);

  const inventory = await buildStorageInventory(creds, fetchImpl);

  assertEquals(inventory.buckets.length, 1);
  assertEquals(inventory.kvNamespaces.length, 1);
  assertEquals(inventory.d1Databases.length, 1);
});

Deno.test("buildStorageInventory - a total failure to list buckets surfaces a sentinel entry, not an empty (confirmed-zero) list", async () => {
  const fetchImpl = mockFetch([
    ["/r2/buckets", () => jsonResponse({ success: false, result: null, errors: [] }, 403)],
    ["/storage/kv/namespaces", () => jsonResponse({ success: true, result: [], errors: [] })],
    ["/d1/database", () => jsonResponse({ success: true, result: [], errors: [] })],
  ]);

  const inventory = await buildStorageInventory(creds, fetchImpl);

  assertEquals(inventory.buckets.length, 1);
  assertEquals(typeof inventory.buckets[0].evaluationError, "string");
  assertEquals(inventory.kvNamespaces, []);
  assertEquals(inventory.d1Databases, []);
});

Deno.test("buildStorageInventory - buckets, namespaces, and databases fail independently", async () => {
  const fetchImpl = mockFetch([
    [
      "/r2/buckets",
      () => jsonResponse({ success: true, result: [{ name: "uploads" }], errors: [] }),
    ],
    [
      "/storage/kv/namespaces",
      () => jsonResponse({ success: false, result: null, errors: [] }, 500),
    ],
    [
      "/d1/database",
      () =>
        jsonResponse({ success: true, result: [{ uuid: "db-1", name: "flaretower" }], errors: [] }),
    ],
  ]);

  const inventory = await buildStorageInventory(creds, fetchImpl);

  assertEquals(inventory.buckets.length, 1);
  assertEquals(inventory.buckets[0].evaluationError, undefined);
  assertEquals(inventory.kvNamespaces.length, 1);
  assertEquals(typeof inventory.kvNamespaces[0].evaluationError, "string");
  assertEquals(inventory.d1Databases.length, 1);
  assertEquals(inventory.d1Databases[0].evaluationError, undefined);
});
