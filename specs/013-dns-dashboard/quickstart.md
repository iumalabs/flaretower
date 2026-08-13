# Quickstart: DNS Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

## Prerequisites

- A Cloudflare test account with at least 2 zones, one of which has a `_dmarc` TXT record with
  `p=none` and another zone with either no `_dmarc` record or one with `p=reject`.
- At least one record (e.g. a CNAME) pointing at a `*.pages.dev` or `*.workers.dev` target.
- A completed `POST /api/dns/evaluate` run after this feature's migration has been applied (existing
  runs predating the migration will show `ttl: null` for their persisted rows — expected, not a bug;
  the next evaluation run populates it).

## Scenario 1 — zone tabs isolate one zone's records (User Story 1)

Open the DNS page: zone tabs appear, one per zone, each labeled with name + record count. Selecting a
different tab swaps the table's contents with no reload; a zone with zero records shows its own empty
state when selected.

## Scenario 2 — Proxy status and TTL (User Story 2)

A proxied A/CNAME record shows "proxied" and `ttl: 1` ("auto"); an unproxied one shows "DNS only" with
its real TTL; an MX/TXT record shows "not applicable" for proxy status.

## Scenario 3 — DMARC policy warning (User Story 3)

The zone with `_dmarc` `p=none` shows a warning on that record. The zone with `p=reject` (or no
`_dmarc` record at all) shows no DMARC warning anywhere.

## Scenario 4 — platform-domain informational label

The record pointing at `*.pages.dev`/`*.workers.dev` shows the informational label, without affecting
its actual status color/severity.

Run all 4 scenarios end-to-end against a real scratch Cloudflare test account before considering this
module done — same real-account caveat as every prior module's own quickstart.
