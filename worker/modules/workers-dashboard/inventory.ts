// A small, dedicated fetch for last-deploy timestamps — deliberately not
// added to workers-access-exposure/inventory.ts's own RawWorkerScript type,
// since Module 1 has no use for a script's `modified_on` and this project's
// established precedent (research.md, storage module's own Access-app
// fetch) is local re-implementation over reaching into another module's
// internals for an unrelated concern.
import { withGlobalFetchSlot } from "../../concurrency.ts";
import type { CloudflareCredentials } from "../workers-access-exposure/inventory.ts";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

interface RawWorkerScriptMetadata {
  id: string;
  modified_on?: string;
}

interface CloudflareAPIResponse<T> {
  success: boolean;
  result: T;
}

export async function getWorkerLastDeployTimes(
  creds: CloudflareCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string | null>> {
  // Gated by the invocation-wide semaphore (worker/concurrency.ts) — every
  // module's cfFetch() goes through it, so the true total in-flight
  // connection count across all of them together never exceeds the
  // Workers runtime's 6-per-invocation limit, not just this one module's
  // own fan-out.
  const res = await withGlobalFetchSlot(() =>
    fetchImpl(`${CF_API_BASE}/accounts/${creds.accountId}/workers/scripts`, {
      headers: { Authorization: `Bearer ${creds.apiToken}` },
    })
  );

  if (!res.ok) {
    throw new Error(`Cloudflare Workers Scripts API returned HTTP ${res.status}`);
  }

  const body = await res.json() as CloudflareAPIResponse<RawWorkerScriptMetadata[]>;
  if (!body.success) {
    throw new Error("Cloudflare Workers Scripts API returned success: false");
  }

  return new Map(body.result.map((s) => [s.id, s.modified_on ?? null]));
}
