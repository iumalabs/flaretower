import { useState } from "react";

// specs/024-manual-rescan-trigger's six per-module evaluate endpoints,
// fired together for the Overview page's account-wide re-scan
// (research.md §2) — no new mutation capability, just triggering the
// same six actions an operator could already trigger individually.
const MODULES = [
  { label: "Exposure", endpoint: "/api/exposure/evaluate" },
  { label: "DNS", endpoint: "/api/dns/evaluate" },
  { label: "Zero Trust", endpoint: "/api/zero-trust/evaluate" },
  { label: "Pages", endpoint: "/api/pages/evaluate" },
  { label: "Storage", endpoint: "/api/storage/evaluate" },
  { label: "Security Posture", endpoint: "/api/security/evaluate" },
] as const;

export interface ModuleRescanError {
  label: string;
  message: string;
}

interface UseMultiRescanResult {
  pending: boolean;
  errors: ModuleRescanError[];
  trigger: () => void;
}

export function useMultiRescan(onSuccess: () => void): UseMultiRescanResult {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<ModuleRescanError[]>([]);

  async function trigger() {
    setPending(true);
    setErrors([]);

    // issue #461 — sequential, not concurrent (was Promise.allSettled
    // firing all six at once). Each module's own evaluate call can need
    // several worker/concurrency.ts fetch slots internally (its own
    // per-entity fan-out); firing all six interactive invocations at once
    // let them land on the same Worker isolate and collectively blow past
    // GLOBAL_FETCH_LIMIT, starving a waiter in acquireGlobalFetchSlot()'s
    // queue with no timeout on the wait itself — the Workers runtime's own
    // hang-detector then killed the whole request with a generic 500
    // (Cloudflare error 1101), not a clean per-module error. Running one
    // module at a time gives each evaluate call the full slot budget to
    // itself, exactly like the already-reliable single-module RescanButton
    // click on each page. Still collects every module's own outcome
    // independently — one module's failure still doesn't hide (or stop)
    // the rest (spec.md Edge Cases).
    const failed: ModuleRescanError[] = [];
    for (const m of MODULES) {
      try {
        const res = await fetch(m.endpoint, { method: "POST" });
        if (!res.ok) throw new Error(`${res.status}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        failed.push({ label: m.label, message });
      }
    }

    setErrors(failed);
    // Refetch regardless of per-module outcome — the modules that
    // succeeded already have fresh data worth showing.
    onSuccess();
    setPending(false);
  }

  return { pending, errors, trigger };
}
