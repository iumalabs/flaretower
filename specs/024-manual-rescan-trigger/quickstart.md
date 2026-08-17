# Quickstart: Manual Re-scan Trigger

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-16

Manual validation once implemented — run `deno task dev`, log in via Access.

## Scenario 1 — Re-scan from a loaded page (User Story 1)

1. Open any of Exposure, DNS, Storage, Security, Zero Trust, Pages with existing findings.
2. Click "Re-scan". Confirm it immediately shows "Scanning…" and becomes unclickable.
3. Wait for it to finish. Confirm the button returns to "Re-scan" (clickable again) and the page's
   findings reflect the just-completed run (spot-check the `run` id in the header meta line, if
   that page shows one, changed to the new run).
4. Make an actual change on the Cloudflare side that would flip one finding's status (e.g. attach
   an Access application to a previously-uncovered Worker route), then repeat steps 2-3. Confirm
   that specific finding now shows its updated status without a page reload.

## Scenario 2 — Re-scan failure leaves existing data alone (Edge Case / FR-005)

1. With DevTools open, block the relevant `POST /api/<module>/evaluate` request (or temporarily
   revoke the account's Cloudflare API token scope, if safe to do in the test environment) and
   click "Re-scan".
2. Confirm an inline error appears near the button, the button returns to its normal (non-pending)
   state, and every finding already on the page is still exactly what it was before the click — not
   blanked, not replaced with an error page.

## Scenario 3 — First-ever scan from the never-evaluated empty state (User Story 2)

1. Against an account/module with no evaluation history yet (or a fresh preview D1 database), open
   Security Posture or Zero Trust. Confirm the empty state offers a "Re-scan" control directly,
   with no instruction to run a raw command.
2. Click it. Confirm the page transitions from the empty state to showing real findings once the
   scan completes.
3. Repeat for Exposure, DNS, Pages, and Storage — confirm the same header control (no separate
   empty-state affordance needed on these four, per research.md §3) does the same job.
