# Quickstart: Storage Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

Manual validation against a real Cloudflare account (real-account dependency — same caveat as
every prior module's equivalent task; left unchecked in `tasks.md` until run).

## Prerequisites

- A Cloudflare account with:
  - At least one R2 bucket, one with an enabled custom domain and one without.
  - At least one KV namespace referenced by exactly one Worker, one referenced by more than one
    Worker, and one referenced by none.
  - At least one D1 database.
- FlareTower deployed and authenticated against that account (see README Setup).

## Scenario 1 — Bound to (User Story 1)

1. Trigger an evaluation: `POST /api/storage/evaluate`.
2. Open the Storage page.
3. Confirm the resource referenced by exactly one Worker shows that Worker's name in the Bound to
   column.
4. Confirm the resource referenced by more than one Worker shows a count ("N workers"), not a
   truncated name list.
5. Confirm the resource referenced by zero Workers shows an explicit "none" state.

## Scenario 2 — R2 custom domain (User Story 2)

1. On the same evaluated run, confirm the bucket with an enabled custom domain shows that domain
   in the Custom domain column.
2. Confirm the bucket without one shows an explicit "none" state.

## Scenario 3 — D1 table count and size (User Story 3)

1. Confirm every D1 database's row shows a real table count and a real on-disk size (not zero
   unless the database genuinely has zero tables / is genuinely empty).
2. If feasible, temporarily revoke the token's D1 read access and re-run the evaluation to confirm
   the Tables/Size columns show an explicit "not available" state rather than blocking the rest of
   that database's row from rendering — restore the token scope afterward.
