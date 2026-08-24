import { assertEquals } from "@std/assert";
import {
  diffForBucketAlerts,
  diffForD1DatabaseAlerts,
  diffForKvNamespaceAlerts,
  type OpenAlert,
  resolveForBucketAlerts,
  resolveForD1DatabaseAlerts,
  resolveForKvNamespaceAlerts,
} from "../../worker/modules/storage/alerts.ts";
import type {
  BucketEvaluation,
  D1DatabaseEvaluation,
  KvNamespaceEvaluation,
} from "../../worker/modules/storage/types.ts";

function bucketResult(status: BucketEvaluation["status"]): BucketEvaluation[] {
  return [{
    bucketName: "uploads",
    status,
    reason: "test",
    customDomain: null,
    boundToWorkers: [],
  }];
}

function kvResult(status: KvNamespaceEvaluation["status"]): KvNamespaceEvaluation[] {
  return [{ namespaceId: "kv-1", title: "SESSIONS", status, reason: "test", boundToWorkers: [] }];
}

function d1Result(status: D1DatabaseEvaluation["status"]): D1DatabaseEvaluation[] {
  return [{
    databaseUuid: "db-1",
    name: "flaretower",
    status,
    reason: "test",
    boundToWorkers: [],
    numTables: null,
    fileSizeBytes: null,
  }];
}

Deno.test("diffForBucketAlerts - first-ever critical alerts (no grace period)", () => {
  const alerts = diffForBucketAlerts(bucketResult("critical"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].newStatus, "critical");
});

Deno.test("diffForBucketAlerts - first-ever safe does not alert", () => {
  const alerts = diffForBucketAlerts(bucketResult("safe"), new Map());
  assertEquals(alerts.length, 0);
});

Deno.test("diffForBucketAlerts - unchanged critical across two runs does not repeat-alert", () => {
  const previous = new Map([["uploads", "critical" as const]]);
  const alerts = diffForBucketAlerts(bucketResult("critical"), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForBucketAlerts - a transition from warning to critical alerts", () => {
  const previous = new Map([["uploads", "warning" as const]]);
  const alerts = diffForBucketAlerts(bucketResult("critical"), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, "warning");
  assertEquals(alerts[0].newStatus, "critical");
});

Deno.test("diffForBucketAlerts - not_evaluated is never alert-worthy", () => {
  const alerts = diffForBucketAlerts(bucketResult("not_evaluated"), new Map());
  assertEquals(alerts.length, 0);
});

Deno.test("diffForKvNamespaceAlerts - first-ever warning alerts (no grace period)", () => {
  const alerts = diffForKvNamespaceAlerts(kvResult("warning"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, null);
});

Deno.test("diffForKvNamespaceAlerts - unchanged warning does not repeat-alert", () => {
  const previous = new Map([["kv-1", "warning" as const]]);
  const alerts = diffForKvNamespaceAlerts(kvResult("warning"), previous);
  assertEquals(alerts.length, 0);
});

Deno.test("diffForKvNamespaceAlerts - a transition from safe to warning alerts", () => {
  const previous = new Map([["kv-1", "safe" as const]]);
  const alerts = diffForKvNamespaceAlerts(kvResult("warning"), previous);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, "safe");
});

Deno.test("diffForD1DatabaseAlerts - first-ever warning alerts (no grace period)", () => {
  const alerts = diffForD1DatabaseAlerts(d1Result("warning"), new Map());
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].previousStatus, null);
});

Deno.test("diffForD1DatabaseAlerts - unchanged warning does not repeat-alert", () => {
  const previous = new Map([["db-1", "warning" as const]]);
  const alerts = diffForD1DatabaseAlerts(d1Result("warning"), previous);
  assertEquals(alerts.length, 0);
});

// issue #481 — resolveFor*Alerts (the auto-resolve counterpart to
// diffFor*Alerts above): an open alert whose entity has recovered to
// "safe" in the run that just completed should resolve; not_evaluated or
// an entity absent from this run must not (never fabricate a clean state).
function openAlert(id: string, entityId: string): OpenAlert {
  return { id, entityId };
}

Deno.test("resolveForBucketAlerts - a bucket back to safe resolves its open alert", () => {
  const resolved = resolveForBucketAlerts(bucketResult("safe"), [openAlert("a1", "uploads")]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForBucketAlerts - a bucket still critical does not resolve", () => {
  const resolved = resolveForBucketAlerts(bucketResult("critical"), [openAlert("a1", "uploads")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForBucketAlerts - not_evaluated does not resolve", () => {
  const resolved = resolveForBucketAlerts(bucketResult("not_evaluated"), [
    openAlert("a1", "uploads"),
  ]);
  assertEquals(resolved, []);
});

Deno.test("resolveForBucketAlerts - a bucket absent from this run's results does not resolve", () => {
  const resolved = resolveForBucketAlerts([], [openAlert("a1", "uploads")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForBucketAlerts - only the recovered bucket's alert resolves, others stay open", () => {
  const results: BucketEvaluation[] = [
    {
      bucketName: "uploads",
      status: "safe",
      reason: "test",
      customDomain: null,
      boundToWorkers: [],
    },
    {
      bucketName: "backups",
      status: "critical",
      reason: "test",
      customDomain: null,
      boundToWorkers: [],
    },
  ];
  const resolved = resolveForBucketAlerts(results, [
    openAlert("a1", "uploads"),
    openAlert("a2", "backups"),
  ]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForBucketAlerts - no open alerts means nothing to resolve", () => {
  const resolved = resolveForBucketAlerts(bucketResult("safe"), []);
  assertEquals(resolved, []);
});

Deno.test("resolveForKvNamespaceAlerts - a namespace back to safe resolves its open alert", () => {
  const resolved = resolveForKvNamespaceAlerts(kvResult("safe"), [openAlert("a1", "kv-1")]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForKvNamespaceAlerts - a namespace still warning does not resolve", () => {
  const resolved = resolveForKvNamespaceAlerts(kvResult("warning"), [openAlert("a1", "kv-1")]);
  assertEquals(resolved, []);
});

Deno.test("resolveForD1DatabaseAlerts - a database back to safe resolves its open alert", () => {
  const resolved = resolveForD1DatabaseAlerts(d1Result("safe"), [openAlert("a1", "db-1")]);
  assertEquals(resolved, ["a1"]);
});

Deno.test("resolveForD1DatabaseAlerts - a database still warning does not resolve", () => {
  const resolved = resolveForD1DatabaseAlerts(d1Result("warning"), [openAlert("a1", "db-1")]);
  assertEquals(resolved, []);
});
