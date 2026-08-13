# Quickstart: Access Dashboard

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-13

## Prerequisites

- A Cloudflare test account with at least 3 Access applications: one using an Okta (or any real) IdP
  login-method policy, one using only a service-token policy, one with an `allow`+`everyone` or
  `bypass` policy (open).
- At least one application with `self_hosted_domains` covering more than one hostname.
- At least 2 Access Groups, one referenced by at least one application's policy, one referenced by
  none.
- A token scoped per research.md §6 — confirm live whether Groups/Identity Providers actually need a
  scope beyond `Access: Apps and Policies Read`; update README's token-scope table if not.

## Scenario 1 — application table shows real coverage/identity/session data (User Story 1)

`GET /api/zero-trust/inventory` — every application shows its real policy count, covered hostname
count (with the multi-hostname app showing more than 1), identity summary (the Okta app shows "Okta"
or the real provider name, the service-token-only app shows "service token", never a raw ID), and
session duration. Existing status (safe/warning/not_evaluated) is unchanged from before this feature.

## Scenario 2 — policy detail shows accurate plain-language rules (User Story 2)

Select the Okta-backed application: its policy detail shows ALLOW/REQUIRE/DENY lines matching its
real policy configuration, with the identity-provider rule showing the real provider name. Select the
open (`bypass`/`allow`+`everyone`) application: its rules show plainly that it grants broad access.

## Scenario 3 — Access Groups panel (User Story 3)

The group referenced by an application's policy shows a reference count ≥ 1; the unreferenced group
shows 0, not omitted. Temporarily revoke Groups-read access (or point at a scope that lacks it) and
reconfirm: the panel shows an explicit "not available" state, the applications table and policy
detail are unaffected.

Run all 3 scenarios end-to-end against a real scratch Cloudflare test account before considering this
module done — same real-account caveat as every prior module's own quickstart.
