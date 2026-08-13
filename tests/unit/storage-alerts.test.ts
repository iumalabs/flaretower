import { assertEquals } from "@std/assert";
import {
  diffForBucketAlerts,
  diffForD1DatabaseAlerts,
  diffForKvNamespaceAlerts,
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
