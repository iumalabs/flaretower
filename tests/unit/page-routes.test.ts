import { assertEquals } from "@std/assert";
import {
  pageForPath,
  pathForPage,
  pathForWorkerDetail,
  workerNameFromPath,
} from "../../app/lib/page-routes.ts";

const VALID_KEYS = ["overview", "workers", "exposure", "dns", "zero-trust"];

Deno.test("pathForPage - overview maps to root", () => {
  assertEquals(pathForPage("overview"), "/");
});

Deno.test("pathForPage - every other key maps to /<key>", () => {
  assertEquals(pathForPage("workers"), "/workers");
  assertEquals(pathForPage("zero-trust"), "/zero-trust");
});

Deno.test("pageForPath - root path resolves to overview", () => {
  assertEquals(pageForPath("/", VALID_KEYS), "overview");
});

Deno.test("pageForPath - a known page's path resolves back to its key (issue #480)", () => {
  assertEquals(pageForPath("/workers", VALID_KEYS), "workers");
  assertEquals(pageForPath("/zero-trust", VALID_KEYS), "zero-trust");
});

Deno.test("pageForPath - a trailing slash is tolerated", () => {
  assertEquals(pageForPath("/workers/", VALID_KEYS), "workers");
});

Deno.test("pageForPath - an unrecognized path falls back to overview", () => {
  assertEquals(pageForPath("/does-not-exist", VALID_KEYS), "overview");
});

// issue #495 — worker-detail deep-linking.
Deno.test("pathForWorkerDetail - builds /workers/<name>", () => {
  assertEquals(pathForWorkerDetail("cf-deployments-cleaner"), "/workers/cf-deployments-cleaner");
});

Deno.test("pathForWorkerDetail - URL-encodes a name with special characters", () => {
  assertEquals(pathForWorkerDetail("a b/c"), "/workers/a%20b%2Fc");
});

Deno.test("workerNameFromPath - extracts the name from /workers/<name>", () => {
  assertEquals(workerNameFromPath("/workers/cf-deployments-cleaner"), "cf-deployments-cleaner");
});

Deno.test("workerNameFromPath - decodes a URL-encoded name", () => {
  assertEquals(workerNameFromPath("/workers/a%20b%2Fc"), "a b/c");
});

Deno.test("workerNameFromPath - a trailing slash is tolerated", () => {
  assertEquals(workerNameFromPath("/workers/my-worker/"), "my-worker");
});

Deno.test("workerNameFromPath - the bare Workers list path is not a detail path", () => {
  assertEquals(workerNameFromPath("/workers"), null);
  assertEquals(workerNameFromPath("/workers/"), null);
});

Deno.test("workerNameFromPath - an unrelated path is not a detail path", () => {
  assertEquals(workerNameFromPath("/dns"), null);
  assertEquals(workerNameFromPath("/"), null);
});

Deno.test("workerNameFromPath - round-trips with pathForWorkerDetail", () => {
  const path = pathForWorkerDetail("cf-deployments-cleaner");
  assertEquals(workerNameFromPath(path), "cf-deployments-cleaner");
});
