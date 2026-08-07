import { assertEquals } from "@std/assert";
import {
  buildStorageInventory,
  getBucketManagedDomain,
  listAccessApplications,
  listBucketCustomDomains,
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

Deno.test("getBucketManagedDomain - returns the enabled flag", async () => {
  const fetchImpl = mockFetch([
    [
      "/domains/managed",
      () => jsonResponse({ success: true, result: { enabled: true }, errors: [] }),
    ],
  ]);

  const enabled = await getBucketManagedDomain(creds, "uploads", fetchImpl);

  assertEquals(enabled, true);
});

Deno.test("listBucketCustomDomains - maps domain and enabled", async () => {
  const fetchImpl = mockFetch([
    ["/domains/custom", () =>
      jsonResponse({
        success: true,
        result: {
          domains: [{
            domain: "assets.example.com",
            enabled: true,
            status: { ownership: "active", ssl: "active" },
          }],
        },
        errors: [],
      })],
  ]);

  const domains = await listBucketCustomDomains(creds, "uploads", fetchImpl);

  assertEquals(domains, [{ domain: "assets.example.com", enabled: true }]);
});

Deno.test("listAccessApplications - maps apps and policies, including a zero-policy app", async () => {
  const fetchImpl = mockFetch([
    ["/access/apps", () =>
      jsonResponse({
        success: true,
        result: [
          {
            id: "app-1",
            domain: "assets.example.com",
            policies: [{ decision: "allow", include: [{ everyone: {} }] }],
          },
          { id: "app-2", domain: "no-policy.example.com", policies: [] },
        ],
        errors: [],
      })],
  ]);

  const apps = await listAccessApplications(creds, fetchImpl);

  assertEquals(apps.length, 2);
  assertEquals(apps[0].policies[0].includesEveryone, true);
  assertEquals(apps[1].policies, []);
});

const EMPTY_ACCESS_APPS: [string, () => Response] = [
  "/access/apps",
  () => jsonResponse({ success: true, result: [], errors: [] }),
];
const R2_DEV_DISABLED: [string, () => Response] = [
  "/domains/managed",
  () => jsonResponse({ success: true, result: { enabled: false }, errors: [] }),
];
const NO_CUSTOM_DOMAINS: [string, () => Response] = [
  "/domains/custom",
  () => jsonResponse({ success: true, result: { domains: [] }, errors: [] }),
];

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
    R2_DEV_DISABLED,
    NO_CUSTOM_DOMAINS,
    EMPTY_ACCESS_APPS,
  ]);

  const inventory = await buildStorageInventory(creds, fetchImpl);

  assertEquals(inventory.buckets.length, 1);
  assertEquals(inventory.buckets[0].evaluationError, undefined);
  assertEquals(inventory.kvNamespaces.length, 1);
  assertEquals(inventory.d1Databases.length, 1);
  assertEquals(inventory.accessApplications, []);
});

Deno.test("buildStorageInventory - a per-bucket domain-fetch failure sets that bucket's evaluationError, other buckets unaffected", async () => {
  const fetchImpl = mockFetch([
    ["/r2/buckets", () =>
      jsonResponse({
        success: true,
        result: [{ name: "broken-bucket" }, { name: "healthy-bucket" }],
        errors: [],
      })],
    [
      "/broken-bucket/domains/managed",
      () => jsonResponse({ success: false, result: null, errors: [] }, 500),
    ],
    [
      "/healthy-bucket/domains/managed",
      () => jsonResponse({ success: true, result: { enabled: false }, errors: [] }),
    ],
    [
      "/healthy-bucket/domains/custom",
      () => jsonResponse({ success: true, result: { domains: [] }, errors: [] }),
    ],
    ["/storage/kv/namespaces", () => jsonResponse({ success: true, result: [], errors: [] })],
    ["/d1/database", () => jsonResponse({ success: true, result: [], errors: [] })],
    EMPTY_ACCESS_APPS,
  ]);

  const inventory = await buildStorageInventory(creds, fetchImpl);

  assertEquals(inventory.buckets.length, 2);
  const broken = inventory.buckets.find((b) => b.bucketName === "broken-bucket");
  const healthy = inventory.buckets.find((b) => b.bucketName === "healthy-bucket");
  assertEquals(typeof broken?.evaluationError, "string");
  assertEquals(healthy?.evaluationError, undefined);
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
    R2_DEV_DISABLED,
    NO_CUSTOM_DOMAINS,
    EMPTY_ACCESS_APPS,
  ]);

  const inventory = await buildStorageInventory(creds, fetchImpl);

  assertEquals(inventory.buckets.length, 1);
  assertEquals(inventory.buckets[0].evaluationError, undefined);
  assertEquals(inventory.kvNamespaces.length, 1);
  assertEquals(typeof inventory.kvNamespaces[0].evaluationError, "string");
  assertEquals(inventory.d1Databases.length, 1);
  assertEquals(inventory.d1Databases[0].evaluationError, undefined);
});
