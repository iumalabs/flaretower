import { assertEquals, assertThrows } from "@std/assert";
import {
  buildEnvelope,
  PaginationParamError,
  parsePaginationParams,
  resolveSortColumn,
  resolveSortDir,
  toLimitOffset,
} from "../../worker/pagination.ts";

Deno.test("parsePaginationParams - defaults to page 1, page_size 50 when both omitted", () => {
  assertEquals(parsePaginationParams(undefined, undefined), { page: 1, pageSize: 50 });
});

Deno.test("parsePaginationParams - parses valid explicit values", () => {
  assertEquals(parsePaginationParams("3", "25"), { page: 3, pageSize: 25 });
});

Deno.test("parsePaginationParams - rejects non-integer, zero, and negative page", () => {
  assertThrows(() => parsePaginationParams("0", undefined), PaginationParamError);
  assertThrows(() => parsePaginationParams("-1", undefined), PaginationParamError);
  assertThrows(() => parsePaginationParams("1.5", undefined), PaginationParamError);
  assertThrows(() => parsePaginationParams("banana", undefined), PaginationParamError);
});

Deno.test("parsePaginationParams - rejects page_size out of the 1-200 range", () => {
  assertThrows(() => parsePaginationParams(undefined, "0"), PaginationParamError);
  assertThrows(() => parsePaginationParams(undefined, "201"), PaginationParamError);
});

Deno.test("parsePaginationParams - accepts the page_size boundary values 1 and 200", () => {
  assertEquals(parsePaginationParams(undefined, "1").pageSize, 1);
  assertEquals(parsePaginationParams(undefined, "200").pageSize, 200);
});

Deno.test("toLimitOffset - computes LIMIT/OFFSET from page/pageSize", () => {
  assertEquals(toLimitOffset({ page: 1, pageSize: 50 }), { limit: 50, offset: 0 });
  assertEquals(toLimitOffset({ page: 2, pageSize: 50 }), { limit: 50, offset: 50 });
  assertEquals(toLimitOffset({ page: 3, pageSize: 25 }), { limit: 25, offset: 50 });
});

Deno.test("buildEnvelope - rounds total_pages up, minimum 1", () => {
  assertEquals(buildEnvelope({ page: 1, pageSize: 50 }, 0).total_pages, 1);
  assertEquals(buildEnvelope({ page: 1, pageSize: 50 }, 50).total_pages, 1);
  assertEquals(buildEnvelope({ page: 1, pageSize: 50 }, 51).total_pages, 2);
  assertEquals(buildEnvelope({ page: 1, pageSize: 50 }, 640).total_pages, 13);
});

Deno.test("buildEnvelope - carries page/page_size/total through unchanged", () => {
  assertEquals(buildEnvelope({ page: 2, pageSize: 25 }, 60), {
    page: 2,
    page_size: 25,
    total: 60,
    total_pages: 3,
  });
});

const WHITELIST = { name: "worker_name", requests: "requests_24h" };

Deno.test("resolveSortColumn - defaults to defaultKey when rawSortKey is undefined", () => {
  assertEquals(resolveSortColumn(undefined, WHITELIST, "name"), {
    key: "name",
    column: "worker_name",
  });
});

Deno.test("resolveSortColumn - resolves a whitelisted key to its real column", () => {
  assertEquals(resolveSortColumn("requests", WHITELIST, "name"), {
    key: "requests",
    column: "requests_24h",
  });
});

Deno.test("resolveSortColumn - rejects an unrecognized key rather than silently falling back", () => {
  assertThrows(
    () => resolveSortColumn("'; DROP TABLE workers; --", WHITELIST, "name"),
    PaginationParamError,
  );
});

Deno.test("resolveSortDir - defaults to ASC, accepts asc/desc, rejects anything else", () => {
  assertEquals(resolveSortDir(undefined), "ASC");
  assertEquals(resolveSortDir("asc"), "ASC");
  assertEquals(resolveSortDir("desc"), "DESC");
  assertThrows(() => resolveSortDir("DESC"), PaginationParamError);
  assertThrows(() => resolveSortDir("banana"), PaginationParamError);
});
