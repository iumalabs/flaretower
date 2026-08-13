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

// mapWithConcurrency's own `limit` only bounds ONE call site's fan-out —
// it doesn't know about any other module's fetches happening in the same
// invocation. The scheduled handler kicks off all 6 fetch-issuing
// modules' evaluations concurrently via separate ctx.waitUntil() calls
// (worker/index.ts), each with its own initial burst of standalone
// (non-mapWithConcurrency) list calls — those alone sum to well over 6
// connections before any module's fan-out phase even begins. This
// semaphore is the true, invocation-wide gate: every module's own
// cfFetch() helper acquires a slot here before calling the real fetch,
// so the TOTAL in-flight count across every caller — standalone list
// calls and mapWithConcurrency-wrapped fan-outs alike — never exceeds
// GLOBAL_FETCH_LIMIT, regardless of which module or how many are
// running at once.
//
// Deliberately plain module-level state rather than an object threaded
// explicitly through every call site — simpler, and this Worker has no
// realistic scenario where two unrelated invocations sharing one isolate
// would meaningfully suffer from being (slightly, briefly) throttled
// against each other; that cost is far cheaper than re-exceeding the
// connection limit, which is issue #292's actual production failure.
// Every acquire is guaranteed to release via try/finally in
// withGlobalFetchSlot(), so a permit can never leak even if the wrapped
// call throws.
const GLOBAL_FETCH_LIMIT = 6;
let globalInFlight = 0;
const globalWaiters: Array<() => void> = [];

function acquireGlobalFetchSlot(): Promise<void> {
  if (globalInFlight < GLOBAL_FETCH_LIMIT) {
    globalInFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    globalWaiters.push(() => {
      globalInFlight++;
      resolve();
    });
  });
}

function releaseGlobalFetchSlot(): void {
  globalInFlight--;
  const next = globalWaiters.shift();
  if (next) next();
}

export async function withGlobalFetchSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireGlobalFetchSlot();
  try {
    return await fn();
  } finally {
    releaseGlobalFetchSlot();
  }
}
