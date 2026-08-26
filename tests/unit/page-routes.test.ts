import { assertEquals } from "@std/assert";
import {
  pageForPath,
  pathForPage,
  pathForWorkerDetail,
  workerNameFromPath,
} from "../../app/lib/page-routes.ts";

const VALID_KEYS = ["overview", "workers", "exposure", "dns", "zero-trust"];

Deno.test("pathForPage - overview maps to /app", () => {
  assertEquals(pathForPage("overview"), "/app");
});

Deno.test("pathForPage - landing maps to root", () => {
  assertEquals(pathForPage("landing"), "/");
});

Deno.test("pathForPage - docs maps to /docs", () => {
  assertEquals(pathForPage("docs"), "/docs");
});

Deno.test("pathForPage - every other key maps to /app/<key>", () => {
  assertEquals(pathForPage("workers"), "/app/workers");
  assertEquals(pathForPage("zero-trust"), "/app/zero-trust");
});

Deno.test("pageForPath - root path resolves to landing", () => {
  assertEquals(pageForPath("/", VALID_KEYS), "landing");
});

Deno.test("pageForPath - /app resolves to overview", () => {
  assertEquals(pageForPath("/app", VALID_KEYS), "overview");
});

Deno.test("pageForPath - /docs resolves to the docs key when it's a valid key", () => {
  assertEquals(pageForPath("/docs", [...VALID_KEYS, "docs"]), "docs");
});

Deno.test("pageForPath - /docs falls back to landing when docs isn't a valid key", () => {
  assertEquals(pageForPath("/docs", VALID_KEYS), "landing");
});

Deno.test("pageForPath - a known page's path resolves back to its key (issue #480)", () => {
  assertEquals(pageForPath("/app/workers", VALID_KEYS), "workers");
  assertEquals(pageForPath("/app/zero-trust", VALID_KEYS), "zero-trust");
});

Deno.test("pageForPath - a trailing slash is tolerated", () => {
  assertEquals(pageForPath("/app/workers/", VALID_KEYS), "workers");
});

Deno.test("pageForPath - an unrecognized key under /app falls back to overview", () => {
  assertEquals(pageForPath("/app/does-not-exist", VALID_KEYS), "overview");
});

// issue #516 — every pre-move bookmark to the old, unprefixed dashboard
// paths (as well as any other unrecognized path) now falls back to
// "landing", not "overview" — those old paths are no longer Access-
// protected at the edge, so treating them as valid dashboard routes would
// render dashboard shell at an unprotected URL. "landing" is always safe:
// App.tsx's own boot effect bounces an already-authenticated visitor into
// /app for them.
Deno.test("pageForPath - a stale pre-#516 bookmark to an old unprefixed path falls back to landing", () => {
  assertEquals(pageForPath("/workers", VALID_KEYS), "landing");
  assertEquals(pageForPath("/does-not-exist", VALID_KEYS), "landing");
});

// issue #495/#516 — worker-detail deep-linking, now under /app.
Deno.test("pathForWorkerDetail - builds /app/workers/<name>", () => {
  assertEquals(
    pathForWorkerDetail("cf-deployments-cleaner"),
    "/app/workers/cf-deployments-cleaner",
  );
});

Deno.test("pathForWorkerDetail - URL-encodes a name with special characters", () => {
  assertEquals(pathForWorkerDetail("a b/c"), "/app/workers/a%20b%2Fc");
});

Deno.test("workerNameFromPath - extracts the name from /app/workers/<name>", () => {
  assertEquals(
    workerNameFromPath("/app/workers/cf-deployments-cleaner"),
    "cf-deployments-cleaner",
  );
});

Deno.test("workerNameFromPath - decodes a URL-encoded name", () => {
  assertEquals(workerNameFromPath("/app/workers/a%20b%2Fc"), "a b/c");
});

Deno.test("workerNameFromPath - a trailing slash is tolerated", () => {
  assertEquals(workerNameFromPath("/app/workers/my-worker/"), "my-worker");
});

Deno.test("workerNameFromPath - the bare Workers list path is not a detail path", () => {
  assertEquals(workerNameFromPath("/app/workers"), null);
  assertEquals(workerNameFromPath("/app/workers/"), null);
});

Deno.test("workerNameFromPath - an unrelated path is not a detail path", () => {
  assertEquals(workerNameFromPath("/app/dns"), null);
  assertEquals(workerNameFromPath("/"), null);
  // The old, pre-#516 unprefixed shape is not a detail path either.
  assertEquals(workerNameFromPath("/workers/my-worker"), null);
});

Deno.test("workerNameFromPath - round-trips with pathForWorkerDetail", () => {
  const path = pathForWorkerDetail("cf-deployments-cleaner");
  assertEquals(workerNameFromPath(path), "cf-deployments-cleaner");
});
