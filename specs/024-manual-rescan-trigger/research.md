# Phase 0 Research: Manual Re-scan Trigger

## §1. Backend — nothing to build, only to call

All six `POST /<module>/evaluate` routes already exist, share one pattern, and need no change:

| Module | Route | Handler |
|---|---|---|
| Exposure | `POST /api/exposure/evaluate` | `worker/modules/workers-access-exposure/routes.ts:132-135` |
| DNS | `POST /api/dns/evaluate` | `worker/modules/dns/routes.ts:148-151` |
| Storage | `POST /api/storage/evaluate` | `worker/modules/storage/routes.ts:216-219` |
| Security | `POST /api/security/evaluate` | `worker/modules/security/routes.ts:444-447` |
| Zero Trust | `POST /api/zero-trust/evaluate` | `worker/modules/zero-trust/routes.ts:190-193` |
| Pages | `POST /api/pages/evaluate` | `worker/modules/pages/routes.ts:220-223` |

Each `await`s the full evaluation (Cloudflare fetches + D1 writes) before responding `202
{ run_id }` — by the time the response resolves, the new run is already persisted. A caller can
refetch the page's own `GET /<module>/inventory` immediately on response; no polling, no delay,
no second endpoint needed. No route has a role guard (unlike the alert-acknowledge endpoints,
which require `admin` via `requireRole`) — confirmed by grep on all six `routes.ts` files, so
FR-008 (no new restriction) requires no backend change either, just not adding one.

**Decision**: zero backend work. This is a frontend-only feature — no `contracts/` directory
(same precedent as spec 021-dashboard-panel-tabs, also a pure-frontend feature with no API
change).

## §2. Shared logic vs. shared UI — a hook, not just a button

Six pages, six different places in their JSX to react to a re-scan's pending/error state (see §3)
— a single rigid `<RescanButton>` React component can't be dropped into all of them unmodified,
because two of the six also need the *same* trigger reachable from an early-return empty-state
block that bypasses the normal page body (§3). Splitting the concern in two solves this cleanly:

- **`app/lib/use-rescan.ts`** — a small hook, `useRescan(endpoint, onSuccess): { pending, error,
  trigger }`. POSTs to `endpoint`, calls the caller-supplied `onSuccess()` (the page's own,
  already-existing inventory refetch function — see §4) on 202, sets `error` on failure, always
  resets `pending` in a `finally`. This is the actual reusable "trigger + pending state + handle
  failure" logic issue #414 asked for.
- **`app/components/RescanButton.tsx`** — a small presentational component,
  `{ pending, error, onClick }`. Renders a button (label "Re-scan", swaps to "Scanning…" and
  disables itself while `pending`) plus an inline error line below it when `error` is set. Every
  page instantiates its own `useRescan(...)` and passes the three fields straight through — no
  page-specific logic lives in the component itself.

**Alternative considered**: extending `EmptyState`'s existing `ctaLabel`/`onCta` props to also
accept a `ctaPending`/show its own inline error. Rejected — `EmptyState` is a generic, widely-reused
component (every module's confirmed-empty and error states use it, not just the never-evaluated
one), and it turns out unnecessary anyway once §3 is worked through: none of the six pages actually
needs `EmptyState`'s CTA slot for this feature.

## §3. Per-page placement — the header alone covers 4 of 6; Security/Zero Trust need one more spot

Checked every page's actual conditional-render structure, not just the "loaded" case. Key finding:
for four of the six pages, the normal header (`<h1>` + meta `<p>`) renders **unconditionally once
`data` has loaded — including when `data.run_id` is `null`** (a never-evaluated account still gets
a valid `GET /inventory` response, just with `run_id: null` and empty arrays, not an error). So a
`RescanButton` placed in the header satisfies both User Story 1 (re-scan with existing results) and
User Story 2 (trigger the first run) simultaneously on those four pages — no separate empty-state
wiring needed at all.

| Page | Header always renders (even `run_id: null`)? | Extra spot needed for US2? |
|---|---|---|
| `ExposureInventory.tsx` | Yes (`{data && <p>...</p>}`, `data` truthy either way) | No — header covers it |
| `DnsInventory.tsx` | Yes | No |
| `PagesInventory.tsx` | Yes | No |
| `StorageInventory.tsx` | Yes (no `run_id === null` gate exists at all today — every state renders the same header) | No |
| `SecurityPostureInventory.tsx` | **No** — `if (data && data.run_id === null)` is an early return (`SecurityPostureInventory.tsx:409-428`) that renders *only* a bare `<h1>` + a `<p>` naming the raw curl command, skipping the normal header entirely | **Yes** — that early-return block needs its own `RescanButton` |
| `ZeroTrustInventory.tsx` | **No** — identical early-return pattern (`ZeroTrustInventory.tsx:420-435`, confirmed same shape) | **Yes** |

**Decision**: add `<RescanButton>` to all six pages' normal headers (covers US1 everywhere, and US2
for Exposure/DNS/Pages/Storage for free); additionally add one to Security's and Zero Trust's
never-evaluated early-return block, replacing the `<code>POST /api/.../evaluate</code>` instruction
text there (closes US2/FR-006 for the two pages where the header doesn't reach).

`FindingsTable`'s own `emptyState` prop (Exposure/DNS/Pages's "No evaluation runs yet..." wording,
already reusing `EmptyState`'s CTA capability) is left completely untouched — with the header
button already covering the never-evaluated case on those three pages, changing that text is
redundant, not required by any FR, and avoids touching a component with many unrelated callers.

## §4. Wiring `onSuccess` to each page's existing refetch

Every page already owns a `fetch<X>Inventory(...)`-shaped function called from a `useEffect` (e.g.
`ExposureInventory.tsx:96`, `DnsInventory.tsx` with `[selectedZone, page, sortKey, sortDir]` deps).
None of these are currently extracted as a standalone, re-callable function outside that effect on
every page — some are (`fetchInventory` as a named async function), some are inline arrow
expressions. **Decision**: where a page's fetch isn't already a named, re-invokable function,
extract it to one (mechanical refactor, no behavior change) so `useRescan`'s `onSuccess` can call
it directly — same function the page's own `useEffect` already calls on mount/param-change, just
also invoked once more after a successful re-scan.

## §5. Testing

No new shared spec file — matches this project's existing convention of adding a feature's
Playwright coverage directly into each affected page's own existing `tests/e2e/*.spec.ts` file
(the same pattern spec 020's pagination and spec 021's tabs both followed, one scenario appended
per affected page's file, not a new cross-cutting file). Six pages get one success-path scenario
each (mocked `POST .../evaluate` returns 202, mocked inventory refetch returns updated data,
assert the button shows/clears "Scanning…" and the new data renders) plus a shared-shape failure
scenario (mocked 500, assert inline error and unchanged existing data — FR-005). Security and Zero
Trust additionally get a never-evaluated-empty-state scenario (FR-006/US2).
