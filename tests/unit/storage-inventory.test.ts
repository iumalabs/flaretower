import { assertEquals } from "@std/assert";
import {
  buildStorageInventory,
  getBucketManagedDomain,
  getD1DatabaseDetail,
  listAccessApplications,
  listBucketCustomDomains,
  listD1Databases,
  listKvNamespaces,
  listR2Buckets,
  listScriptBindings,
  listWorkerScripts,
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
          result: { buckets: [{ name: "uploads" }, { name: "backups" }] },
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

// specs/016-storage-dashboard research.md §1
Deno.test("getD1DatabaseDetail - maps num_tables and file_size", async () => {
  const fetchImpl = mockFetch([
    ["/d1/database/db-1", () =>
      jsonResponse({
        success: true,
        result: { uuid: "db-1", name: "flaretower", num_tables: 12, file_size: 840000 },
        errors: [],
      })],
  ]);

  const detail = await getD1DatabaseDetail(creds, "db-1", fetchImpl);

  assertEquals(detail, { numTables: 12, fileSizeBytes: 840000 });
});

Deno.test("getD1DatabaseDetail - a failed fetch yields an empty object, not a thrown error", async () => {
  const fetchImpl = mockFetch([
    ["/d1/database/db-1", () => jsonResponse({ success: false, result: null, errors: [] }, 500)],
  ]);

  const detail = await getD1DatabaseDetail(creds, "db-1", fetchImpl);

  assertEquals(detail, {});
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

// issue #464 — Cloudflare omits `domain` for some Access application types
// (e.g. bookmark apps); this must not throw and must never surface as a
// literal `undefined`.
Deno.test("listAccessApplications - an app with no domain field falls back to a sentinel string, never undefined", async () => {
  const fetchImpl = mockFetch([
    ["/access/apps", () =>
      jsonResponse({
        success: true,
        result: [{ id: "app-1", policies: [] }],
        errors: [],
      })],
  ]);

  const apps = await listAccessApplications(creds, fetchImpl);

  assertEquals(apps.length, 1);
  assertEquals(apps[0].appDomain, "(no domain)");
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
const NO_WORKER_SCRIPTS: [string, () => Response] = [
  "/workers/scripts",
  () => jsonResponse({ success: true, result: [], errors: [] }),
];

Deno.test("buildStorageInventory - every bucket, namespace, and database is enumerated, none omitted", async () => {
  const fetchImpl = mockFetch([
    [
      "/r2/buckets",
      () => jsonResponse({ success: true, result: { buckets: [{ name: "uploads" }] }, errors: [] }),
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
    NO_WORKER_SCRIPTS,
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
        result: { buckets: [{ name: "broken-bucket" }, { name: "healthy-bucket" }] },
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
    NO_WORKER_SCRIPTS,
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
    NO_WORKER_SCRIPTS,
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
      () => jsonResponse({ success: true, result: { buckets: [{ name: "uploads" }] }, errors: [] }),
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
    NO_WORKER_SCRIPTS,
  ]);

  const inventory = await buildStorageInventory(creds, fetchImpl);

  assertEquals(inventory.buckets.length, 1);
  assertEquals(inventory.buckets[0].evaluationError, undefined);
  assertEquals(inventory.kvNamespaces.length, 1);
  assertEquals(typeof inventory.kvNamespaces[0].evaluationError, "string");
  assertEquals(inventory.d1Databases.length, 1);
  assertEquals(inventory.d1Databases[0].evaluationError, undefined);
});

Deno.test("listWorkerScripts - maps script names", async () => {
  const fetchImpl = mockFetch([
    [
      "/workers/scripts",
      () =>
        jsonResponse({
          success: true,
          result: [{ id: "my-worker" }, { id: "other-worker" }],
          errors: [],
        }),
    ],
  ]);

  const scripts = await listWorkerScripts(creds, fetchImpl);

  assertEquals(scripts, ["my-worker", "other-worker"]);
});

Deno.test("listScriptBindings - maps binding type and target id", async () => {
  const fetchImpl = mockFetch([
    ["/bindings", () =>
      jsonResponse({
        success: true,
        result: [
          { type: "kv_namespace", namespace_id: "kv-1" },
          { type: "d1", id: "db-1" },
          { type: "plain_text" },
        ],
        errors: [],
      })],
  ]);

  const bindings = await listScriptBindings(creds, "my-worker", fetchImpl);

  assertEquals(bindings.length, 3);
  assertEquals(bindings[0], { type: "kv_namespace", namespace_id: "kv-1" });
  assertEquals(bindings[1], { type: "d1", id: "db-1" });
});

Deno.test("buildStorageInventory - a namespace/database referenced by a Worker's bindings is safe, an unreferenced one is warning", async () => {
  const fetchImpl = mockFetch([
    ["/r2/buckets", () => jsonResponse({ success: true, result: { buckets: [] }, errors: [] })],
    [
      "/storage/kv/namespaces",
      () =>
        jsonResponse({
          success: true,
          result: [{ id: "kv-used", title: "USED" }, { id: "kv-unused", title: "UNUSED" }],
          errors: [],
        }),
    ],
    [
      "/d1/database",
      () =>
        jsonResponse({ success: true, result: [{ uuid: "db-used", name: "used-db" }], errors: [] }),
    ],
    EMPTY_ACCESS_APPS,
    [
      "/workers/scripts",
      () => jsonResponse({ success: true, result: [{ id: "my-worker" }], errors: [] }),
    ],
    ["/my-worker/bindings", () =>
      jsonResponse({
        success: true,
        result: [{ type: "kv_namespace", namespace_id: "kv-used" }, { type: "d1", id: "db-used" }],
        errors: [],
      })],
  ]);

  const inventory = await buildStorageInventory(creds, fetchImpl);

  assertEquals(inventory.bindingReferences.kvNamespaceIds.has("kv-used"), true);
  assertEquals(inventory.bindingReferences.kvNamespaceIds.has("kv-unused"), false);
  assertEquals(inventory.bindingReferences.d1DatabaseIds.has("db-used"), true);
  assertEquals(inventory.bindingReferences.allBindingsConfirmed, true);
});

// specs/016-storage-dashboard research.md §2
Deno.test("buildStorageInventory - bindingReferences preserves the referencing Worker names, including for R2 buckets (matched by name)", async () => {
  const fetchImpl = mockFetch([
    [
      "/r2/buckets",
      () => jsonResponse({ success: true, result: { buckets: [{ name: "uploads" }] }, errors: [] }),
    ],
    [
      "/storage/kv/namespaces",
      () =>
        jsonResponse({
          success: true,
          result: [{ id: "kv-shared", title: "SHARED" }],
          errors: [],
        }),
    ],
    ["/d1/database", () => jsonResponse({ success: true, result: [], errors: [] })],
    R2_DEV_DISABLED,
    NO_CUSTOM_DOMAINS,
    EMPTY_ACCESS_APPS,
    [
      "/workers/scripts",
      () =>
        jsonResponse({
          success: true,
          result: [{ id: "worker-a" }, { id: "worker-b" }],
          errors: [],
        }),
    ],
    ["/worker-a/bindings", () =>
      jsonResponse({
        success: true,
        result: [
          { type: "kv_namespace", namespace_id: "kv-shared" },
          { type: "r2_bucket", bucket_name: "uploads" },
        ],
        errors: [],
      })],
    ["/worker-b/bindings", () =>
      jsonResponse({
        success: true,
        result: [{ type: "kv_namespace", namespace_id: "kv-shared" }],
        errors: [],
      })],
  ]);

  const inventory = await buildStorageInventory(creds, fetchImpl);

  assertEquals(
    inventory.bindingReferences.kvNamespaceBoundTo.get("kv-shared"),
    ["worker-a", "worker-b"],
  );
  assertEquals(inventory.bindingReferences.r2BucketBoundTo.get("uploads"), ["worker-a"]);
  assertEquals(inventory.bindingReferences.d1DatabaseBoundTo.get("db-unreferenced"), undefined);
});

// Regression coverage: a single Worker binding the same resource under two
// different binding names must count once in "Bound to," not once per
// binding.
Deno.test("buildStorageInventory - bindingReferences dedupes a Worker that binds the same resource twice", async () => {
  const fetchImpl = mockFetch([
    ["/r2/buckets", () => jsonResponse({ success: true, result: { buckets: [] }, errors: [] })],
    [
      "/storage/kv/namespaces",
      () => jsonResponse({ success: true, result: [], errors: [] }),
    ],
    ["/d1/database", () => jsonResponse({ success: true, result: [], errors: [] })],
    R2_DEV_DISABLED,
    NO_CUSTOM_DOMAINS,
    EMPTY_ACCESS_APPS,
    [
      "/workers/scripts",
      () => jsonResponse({ success: true, result: [{ id: "worker-a" }], errors: [] }),
    ],
    ["/worker-a/bindings", () =>
      jsonResponse({
        success: true,
        result: [
          { type: "d1", id: "db-shared" },
          { type: "d1", id: "db-shared" },
        ],
        errors: [],
      })],
  ]);

  const inventory = await buildStorageInventory(creds, fetchImpl);

  assertEquals(inventory.bindingReferences.d1DatabaseBoundTo.get("db-shared"), ["worker-a"]);
});

Deno.test("buildStorageInventory - a per-script bindings-fetch failure marks allBindingsConfirmed false, other scripts' bindings still counted", async () => {
  const fetchImpl = mockFetch([
    ["/r2/buckets", () => jsonResponse({ success: true, result: { buckets: [] }, errors: [] })],
    ["/storage/kv/namespaces", () => jsonResponse({ success: true, result: [], errors: [] })],
    ["/d1/database", () => jsonResponse({ success: true, result: [], errors: [] })],
    EMPTY_ACCESS_APPS,
    ["/workers/scripts", () =>
      jsonResponse({
        success: true,
        result: [{ id: "broken-worker" }, { id: "healthy-worker" }],
        errors: [],
      })],
    [
      "/broken-worker/bindings",
      () => jsonResponse({ success: false, result: null, errors: [] }, 500),
    ],
    [
      "/healthy-worker/bindings",
      () =>
        jsonResponse({
          success: true,
          result: [{ type: "kv_namespace", namespace_id: "kv-used" }],
          errors: [],
        }),
    ],
  ]);

  const inventory = await buildStorageInventory(creds, fetchImpl);

  assertEquals(inventory.bindingReferences.kvNamespaceIds.has("kv-used"), true);
  assertEquals(inventory.bindingReferences.allBindingsConfirmed, false);
});
