import { assertEquals, assertThrows } from "@std/assert";
import {
  buildEnvelope,
  paginateArray,
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

interface Item {
  name: string;
  count: number | null;
}

const ITEM_WHITELIST: Record<string, (i: Item) => string | number> = {
  name: (i) => i.name,
  count: (i) => i.count ?? -1,
};

Deno.test("paginateArray - defaults to page 1/size 50, sorted by defaultSortKey ascending", () => {
  const items: Item[] = [{ name: "c", count: 1 }, { name: "a", count: 1 }, { name: "b", count: 1 }];
  const result = paginateArray(items, {}, ITEM_WHITELIST, "name");
  assertEquals(result.items.map((i) => i.name), ["a", "b", "c"]);
  assertEquals(result.pagination, { page: 1, page_size: 50, total: 3, total_pages: 1 });
});

Deno.test("paginateArray - slices correctly across pages", () => {
  const items: Item[] = Array.from({ length: 5 }, (_, i) => ({ name: `i${i}`, count: i }));
  const page1 = paginateArray(items, { page_size: "2" }, ITEM_WHITELIST, "name");
  assertEquals(page1.items.map((i) => i.name), ["i0", "i1"]);
  const page3 = paginateArray(items, { page: "3", page_size: "2" }, ITEM_WHITELIST, "name");
  assertEquals(page3.items.map((i) => i.name), ["i4"]);
});

Deno.test("paginateArray - sorts by a non-default whitelisted key, descending", () => {
  const items: Item[] = [{ name: "a", count: 1 }, { name: "b", count: 3 }, { name: "c", count: 2 }];
  const result = paginateArray(
    items,
    { sort_key: "count", sort_dir: "desc" },
    ITEM_WHITELIST,
    "name",
  );
  assertEquals(result.items.map((i) => i.name), ["b", "c", "a"]);
});

Deno.test("paginateArray - rejects an unrecognized sort_key and invalid page", () => {
  assertThrows(
    () => paginateArray([{ name: "a", count: 1 }], { sort_key: "nope" }, ITEM_WHITELIST, "name"),
    PaginationParamError,
  );
  assertThrows(
    () => paginateArray([{ name: "a", count: 1 }], { page: "0" }, ITEM_WHITELIST, "name"),
    PaginationParamError,
  );
});

Deno.test("paginateArray - empty input -> empty page, total_pages minimum 1", () => {
  const result = paginateArray([], {}, ITEM_WHITELIST, "name");
  assertEquals(result.items, []);
  assertEquals(result.pagination, { page: 1, page_size: 50, total: 0, total_pages: 1 });
});
