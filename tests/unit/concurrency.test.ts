import { assertEquals } from "@std/assert";
import { mapWithConcurrency } from "../../worker/concurrency.ts";

Deno.test("mapWithConcurrency - preserves result order regardless of completion order", async () => {
  const items = [30, 10, 20];
  const results = await mapWithConcurrency(items, 3, async (ms) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return ms;
  });
  assertEquals(results, [30, 10, 20]);
});

Deno.test("mapWithConcurrency - never runs more than `limit` tasks at once", async () => {
  let current = 0;
  let peak = 0;

  await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
    current++;
    peak = Math.max(peak, current);
    await new Promise((resolve) => setTimeout(resolve, 5));
    current--;
  });

  assertEquals(peak <= 3, true);
});

Deno.test("mapWithConcurrency - runs every item exactly once", async () => {
  const seen: number[] = [];
  await mapWithConcurrency([1, 2, 3, 4, 5], 2, (n) => {
    seen.push(n);
    return Promise.resolve();
  });
  assertEquals(seen.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

Deno.test("mapWithConcurrency - an empty items array resolves immediately to an empty result", async () => {
  const results = await mapWithConcurrency([], 5, () => Promise.resolve(1));
  assertEquals(results, []);
});

Deno.test("mapWithConcurrency - limit greater than item count doesn't throw or hang", async () => {
  const results = await mapWithConcurrency([1, 2], 10, (n) => Promise.resolve(n * 2));
  assertEquals(results, [2, 4]);
});

Deno.test("mapWithConcurrency - a rejected task propagates as a rejection of the whole call", async () => {
  let threw = false;
  try {
    await mapWithConcurrency([1, 2, 3], 2, (n) => {
      if (n === 2) return Promise.reject(new Error("boom"));
      return Promise.resolve(n);
    });
  } catch (err) {
    threw = true;
    assertEquals((err as Error).message, "boom");
  }
  assertEquals(threw, true);
});
