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

  function trigger() {
    setPending(true);
    setErrors([]);
    // Promise.allSettled, not Promise.all — one module's failure must not
    // hide the other five's success (spec.md Edge Cases).
    Promise.allSettled(
      MODULES.map((m) =>
        fetch(m.endpoint, { method: "POST" }).then((res) => {
          if (!res.ok) throw new Error(`${res.status}`);
        })
      ),
    )
      .then((results) => {
        const failed: ModuleRescanError[] = [];
        results.forEach((result, i) => {
          if (result.status === "rejected") {
            const message = result.reason instanceof Error
              ? result.reason.message
              : "unknown error";
            failed.push({ label: MODULES[i].label, message });
          }
        });
        setErrors(failed);
        // Refetch regardless of per-module outcome — the modules that
        // succeeded already have fresh data worth showing.
        onSuccess();
      })
      .finally(() => setPending(false));
  }

  return { pending, errors, trigger };
}
