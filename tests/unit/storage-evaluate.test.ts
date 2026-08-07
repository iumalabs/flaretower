import { assertEquals } from "@std/assert";
import {
  evaluateBucketExposure,
  evaluateD1DatabaseUsage,
  evaluateKvNamespaceUsage,
} from "../../worker/modules/storage/evaluate.ts";
import type { AccessApplication, BucketInventoryItem } from "../../worker/modules/storage/types.ts";

function bucket(overrides: Partial<BucketInventoryItem> = {}): BucketInventoryItem {
  return {
    bucketName: "uploads",
    r2DevEnabled: false,
    customDomains: [],
    ...overrides,
  };
}

function scopedApp(appId: string, appDomain: string): AccessApplication {
  return {
    appId,
    appDomain,
    policies: [{ decision: "allow", includesEveryone: false, hasScopedInclude: true }],
  };
}

function everyoneApp(appId: string, appDomain: string): AccessApplication {
  return {
    appId,
    appDomain,
    policies: [{ decision: "allow", includesEveryone: true, hasScopedInclude: false }],
  };
}

Deno.test("evaluateBucketExposure - critical when r2.dev is enabled, regardless of Access apps", () => {
  const result = evaluateBucketExposure(bucket({ r2DevEnabled: true }), [
    scopedApp("app-1", "uploads.example.com"),
  ]);
  assertEquals(result.status, "critical");
  assertEquals(result.reason, "r2.dev managed public URL is enabled");
});

Deno.test("evaluateBucketExposure - safe when no r2.dev and no enabled custom domains", () => {
  const result = evaluateBucketExposure(bucket(), []);
  assertEquals(result.status, "safe");
});

Deno.test("evaluateBucketExposure - a disabled custom domain does not count toward exposure", () => {
  const result = evaluateBucketExposure(
    bucket({ customDomains: [{ domain: "uploads.example.com", enabled: false }] }),
    [],
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateBucketExposure - critical when an enabled custom domain is uncovered by any Access application", () => {
  const result = evaluateBucketExposure(
    bucket({ customDomains: [{ domain: "uploads.example.com", enabled: true }] }),
    [scopedApp("app-1", "other.example.com")],
  );
  assertEquals(result.status, "critical");
});

Deno.test("evaluateBucketExposure - warning when the covering Access application is effectively open", () => {
  const result = evaluateBucketExposure(
    bucket({ customDomains: [{ domain: "uploads.example.com", enabled: true }] }),
    [everyoneApp("app-1", "uploads.example.com")],
  );
  assertEquals(result.status, "warning");
});

Deno.test("evaluateBucketExposure - safe when the covering Access application's policy is scoped", () => {
  const result = evaluateBucketExposure(
    bucket({ customDomains: [{ domain: "uploads.example.com", enabled: true }] }),
    [scopedApp("app-1", "uploads.example.com")],
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateBucketExposure - not_evaluated when apps could not be fetched but an enabled custom domain exists", () => {
  const result = evaluateBucketExposure(
    bucket({ customDomains: [{ domain: "uploads.example.com", enabled: true }] }),
    null,
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateBucketExposure - safe with no enabled custom domains even when apps could not be fetched (nothing to evaluate)", () => {
  const result = evaluateBucketExposure(bucket(), null);
  assertEquals(result.status, "safe");
});

Deno.test("evaluateBucketExposure - not_evaluated when the bucket itself has an evaluationError, takes priority over everything else", () => {
  const result = evaluateBucketExposure(
    bucket({
      r2DevEnabled: true,
      evaluationError: "could not determine public access configuration",
    }),
    [everyoneApp("app-1", "uploads.example.com")],
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateKvNamespaceUsage - safe when the namespace id is referenced by a Worker's bindings", () => {
  const result = evaluateKvNamespaceUsage(
    { namespaceId: "kv-1", title: "SESSIONS" },
    new Set(["kv-1"]),
    true,
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateKvNamespaceUsage - warning when not referenced and bindings were fully confirmed", () => {
  const result = evaluateKvNamespaceUsage(
    { namespaceId: "kv-1", title: "SESSIONS" },
    new Set(),
    true,
  );
  assertEquals(result.status, "warning");
});

Deno.test("evaluateKvNamespaceUsage - not_evaluated when not referenced but some Worker's bindings couldn't be checked", () => {
  const result = evaluateKvNamespaceUsage(
    { namespaceId: "kv-1", title: "SESSIONS" },
    new Set(),
    false,
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateKvNamespaceUsage - referenced takes priority over an unconfirmed binding check elsewhere", () => {
  const result = evaluateKvNamespaceUsage(
    { namespaceId: "kv-1", title: "SESSIONS" },
    new Set(["kv-1"]),
    false,
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateKvNamespaceUsage - not_evaluated when the namespace itself has an evaluationError", () => {
  const result = evaluateKvNamespaceUsage(
    { namespaceId: "kv-1", title: "SESSIONS", evaluationError: "could not list KV namespaces" },
    new Set(["kv-1"]),
    true,
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateD1DatabaseUsage - safe when the database uuid is referenced by a Worker's bindings", () => {
  const result = evaluateD1DatabaseUsage(
    { databaseUuid: "db-1", name: "flaretower" },
    new Set(["db-1"]),
    true,
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateD1DatabaseUsage - warning when not referenced and bindings were fully confirmed", () => {
  const result = evaluateD1DatabaseUsage(
    { databaseUuid: "db-1", name: "flaretower" },
    new Set(),
    true,
  );
  assertEquals(result.status, "warning");
});

Deno.test("evaluateD1DatabaseUsage - not_evaluated when not referenced but some Worker's bindings couldn't be checked", () => {
  const result = evaluateD1DatabaseUsage(
    { databaseUuid: "db-1", name: "flaretower" },
    new Set(),
    false,
  );
  assertEquals(result.status, "not_evaluated");
});
