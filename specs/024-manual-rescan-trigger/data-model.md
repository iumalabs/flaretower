# Phase 1 Data Model: Manual Re-scan Trigger

No new D1 tables, columns, or API response shapes (research.md §1 — zero backend change). What
follows is the frontend hook/component contract this feature actually introduces.

## `useRescan` hook

```ts
// app/lib/use-rescan.ts
function useRescan(
  endpoint: string,       // e.g. "/api/exposure/evaluate"
  onSuccess: () => void,  // the page's own existing inventory refetch function (research.md §4)
): {
  pending: boolean;
  error: string | null;
  trigger: () => void;    // fire-and-forget; internally async
}
```

State machine (mirrors `AuditInventory.tsx`'s `AcknowledgeButton` conventions — pending/disabled/
inline-error — with one deliberate difference: success calls the caller's refetch instead of an
optimistic local mutation, since a re-scan changes the whole page's dataset server-side, not one
row):

1. `trigger()` called → `pending: true`, `error: null`.
2. `POST` to `endpoint` resolves 2xx → call `onSuccess()` (page refetches its inventory) →
   `pending: false`.
3. `POST` rejects or resolves non-2xx → `error: "Re-scan failed: <message>"` → `pending: false`.
   The page's currently-displayed data is untouched — `onSuccess()` is never called on failure
   (FR-005).

## `RescanButton` component

```ts
// app/components/RescanButton.tsx
interface RescanButtonProps {
  pending: boolean;
  error: string | null;
  onClick: () => void;
}
```

Purely presentational — every page owns its own `useRescan(...)` call and passes the three fields
straight through. Renders a button (label "Re-scan", swaps to "Scanning…" and becomes
`disabled` while `pending` — FR-004) and, when `error` is set, an inline error line below it in the
existing critical-text color convention (`var(--status-critical-fg)`, same token every other
inline error message in this codebase already uses).

## Per-page integration (research.md §3)

| Page | `useRescan` endpoint | Button placement(s) |
|---|---|---|
| `ExposureInventory.tsx` | `/api/exposure/evaluate` | Header (covers US1 + US2) |
| `DnsInventory.tsx` | `/api/dns/evaluate` | Header |
| `PagesInventory.tsx` | `/api/pages/evaluate` | Header |
| `StorageInventory.tsx` | `/api/storage/evaluate` | Header |
| `SecurityPostureInventory.tsx` | `/api/security/evaluate` | Header, **and** the `run_id === null` early-return block |
| `ZeroTrustInventory.tsx` | `/api/zero-trust/evaluate` | Header, **and** the `run_id === null` early-return block |

Security and Zero Trust each need **two** `useRescan(...)` call sites in the same component (one
per render branch — the early return happens before the normal header's JSX, so they can't share a
single button instance) both pointed at the same endpoint; this is fine since each is independently
mounted (only one branch ever renders at a time per the existing `if (data && data.run_id ===
null) return (...)` guard).
