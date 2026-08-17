import { useState } from "react";

interface UseRescanResult {
  pending: boolean;
  error: string | null;
  trigger: () => void;
}

export function useRescan(endpoint: string, onSuccess: () => void): UseRescanResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function trigger() {
    setPending(true);
    setError(null);
    fetch(endpoint, { method: "POST" })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`${res.status}`);
        }
        onSuccess();
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "unknown error";
        setError(`Re-scan failed: ${message}`);
      })
      .finally(() => setPending(false));
  }

  return { pending, error, trigger };
}
