// Cloudflare Workers cap concurrent outbound connections waiting for
// response headers at 6 per invocation — and during the shared scheduled
// handler (constitution Principle III), every module's fetch fan-out runs
// within that same one invocation, so they all share this one budget.
// Several modules' per-entity fan-out (one or more fetch() calls per
// Worker/zone/bucket/project) trivially exceeded it on a real account,
// confirmed live via `wrangler tail`'s own "stalled HTTP response was
// canceled to prevent deadlock" warning (2026-08-11/12, issue #292).
//
// Runs `fn` over `items` with at most `limit` calls in flight at once,
// preserving result order.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}
