# Quickstart: Pages Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

## Prerequisites

- A Cloudflare test account with at least 3 Pages projects: one with an active custom domain and a
  successful recent production build, one with no custom domain and a failed build, one with no
  production deployment yet at all.
- Projects on different production branches (e.g. `main`, `release`).

## Scenario 1 — one row per project, all fields real (User Story 1)

`GET /api/pages/inventory` — each project appears exactly once. The project with an active domain
shows it; the one without shows an explicit "none" state. Each shows its real production branch.

## Scenario 2 — build states

The successful-build project shows a success state with real recency; the failed-build project shows
a distinct failure state; the never-deployed project shows "no production deployment yet" — three
visibly distinct states, none fabricated.

## Scenario 3 — Health unchanged

Compare each project's Health pill against the existing `GET /api/pages/inventory` subdomain-exposure
values from before this feature (or against `worker/modules/pages/evaluate.ts`'s own logic read
directly) — confirm byte-for-byte the same status/reason, proving no severity logic changed.

Run all 3 scenarios end-to-end against a real scratch Cloudflare test account before considering this
module done — same real-account caveat as every prior module's own quickstart.
