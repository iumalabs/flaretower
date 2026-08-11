# API Contract: Identity, Authorization & Audit Data Model

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-11

Two new endpoints, mounted at `/api/identity/*`, gated by the same cross-cutting Access JWT
middleware as every other module — plus a behavior change (not a new endpoint) to the 7 existing
`POST /alerts/.../acknowledge` endpoints.

## `GET /api/identity/users`

Lists every known operator (FR-011). `admin`-only.

**Response 200**:

```json
{
  "users": [
    {
      "sub": "f1b2...",
      "email": "max@example.com",
      "idp": "google-apps",
      "role": "admin",
      "created_at": "2026-08-11T09:00:00Z",
      "last_seen_at": "2026-08-11T14:32:00Z"
    }
  ]
}
```

**Errors**: `403` (missing/invalid Access JWT, or a valid operator whose role isn't `admin`).

## `POST /api/identity/users/{sub}/role`

Grants or revokes the elevated permission level for a known operator (FR-006). `admin`-only.

**Request body**: `{ "role": "member" | "admin" }`

**Response 200**: `{ "sub": "f1b2...", "role": "admin" }`

**Errors**:
- `403` — missing/invalid Access JWT, or the caller isn't `admin`.
- `400` — `role` is missing or isn't exactly `"member"` or `"admin"`.
- `404` — `{sub}` doesn't match any known operator.

## Behavior change: `POST /api/{module}/alerts/.../{id}/acknowledge` (all 7 modules)

No new endpoint and no response-shape change. Adds one check, per FR-007/FR-008/FR-009: the
request is now rejected with `403` if the calling operator's stored `role` isn't `admin`, before any
part of the acknowledge logic runs. An already-`admin` operator sees no behavior change at all.

## Not an HTTP contract: operator recognition

FR-001–FR-003 (creating/updating an operator record, recording first-seen/last-active, best-effort
IdP enrichment) happen inside the existing `accessAuth` middleware on every `/api/*` request — there
is no dedicated endpoint for it, matching how JWT validation itself has no dedicated endpoint.
