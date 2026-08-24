import { assertEquals } from "@std/assert";
import { pageForPath, pathForPage } from "../../app/lib/page-routes.ts";

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
