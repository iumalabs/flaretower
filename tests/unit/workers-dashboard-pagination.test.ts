// specs/020-list-pagination — paginateWorkers() is extracted from the
// GET /dashboard route handler specifically so this pagination/sort logic
// is unit-testable without mocking buildWorkersDashboard()'s 4+ live
// Cloudflare API calls (same rationale as this file's sibling
// workers-dashboard-summary.test.ts already established for
// buildAccountSummary/serializeDashboard).
import { assertEquals, assertThrows } from "@std/assert";
import { paginateWorkers } from "../../worker/modules/workers-dashboard/routes.ts";
import { PaginationParamError } from "../../worker/pagination.ts";
import type { WorkerDashboardRow } from "../../worker/modules/workers-dashboard/types.ts";

function worker(overrides: Partial<WorkerDashboardRow> = {}): WorkerDashboardRow {
  return {
    workerName: "worker-1",
    environment: "production",
    routeCount: 1,
    lastDeployAt: null,
    requests24h: null,
    errors24h: null,
    cpuP50Ms: null,
    exposureStatus: "safe",
    ...overrides,
  };
}

Deno.test("paginateWorkers - defaults to page 1, page_size 50, sorted by worker name ascending", () => {
  const workers = [
    worker({ workerName: "charlie" }),
    worker({ workerName: "alpha" }),
    worker({ workerName: "bravo" }),
  ];
  const result = paginateWorkers(workers, {});

  assertEquals(result.workers.map((w) => w.workerName), ["alpha", "bravo", "charlie"]);
  assertEquals(result.pagination, { page: 1, page_size: 50, total: 3, total_pages: 1 });
});

Deno.test("paginateWorkers - a small page_size slices correctly across pages", () => {
  const workers = Array.from({ length: 5 }, (_, i) => worker({ workerName: `w${i}` }));

  const page1 = paginateWorkers(workers, { page_size: "2" });
  assertEquals(page1.workers.map((w) => w.workerName), ["w0", "w1"]);
  assertEquals(page1.pagination, { page: 1, page_size: 2, total: 5, total_pages: 3 });

  const page3 = paginateWorkers(workers, { page: "3", page_size: "2" });
  assertEquals(page3.workers.map((w) => w.workerName), ["w4"]);
  assertEquals(page3.pagination.page, 3);
});

Deno.test("paginateWorkers - sorts by requests descending when requested", () => {
  const workers = [
    worker({ workerName: "a", requests24h: 10 }),
    worker({ workerName: "b", requests24h: 100 }),
    worker({ workerName: "c", requests24h: 50 }),
  ];
  const result = paginateWorkers(workers, { sort_key: "requests", sort_dir: "desc" });
  assertEquals(result.workers.map((w) => w.workerName), ["b", "c", "a"]);
});

Deno.test("paginateWorkers - null metric fields sort as the lowest value (-1), not last unconditionally", () => {
  const workers = [
    worker({ workerName: "has-data", requests24h: 5 }),
    worker({ workerName: "no-data", requests24h: null }),
  ];
  const result = paginateWorkers(workers, { sort_key: "requests", sort_dir: "asc" });
  assertEquals(result.workers.map((w) => w.workerName), ["no-data", "has-data"]);
});

Deno.test("paginateWorkers - rejects an unrecognized sort_key", () => {
  assertThrows(
    () => paginateWorkers([worker()], { sort_key: "not-a-real-key" }),
    PaginationParamError,
  );
});

Deno.test("paginateWorkers - rejects an invalid page value", () => {
  assertThrows(() => paginateWorkers([worker()], { page: "0" }), PaginationParamError);
  assertThrows(() => paginateWorkers([worker()], { page: "banana" }), PaginationParamError);
});

Deno.test("paginateWorkers - zero workers -> empty page, total_pages minimum 1", () => {
  const result = paginateWorkers([], {});
  assertEquals(result.workers, []);
  assertEquals(result.pagination, { page: 1, page_size: 50, total: 0, total_pages: 1 });
});
