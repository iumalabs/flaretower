# Contract: Session probe

`GET /api/identity/session`

The one new endpoint this feature adds — a thin, read-only surface over the identity
`accessAuth` (existing, unmodified) already resolves for the current request. No role
required (unlike `/api/identity/users`, which stays admin-only). Added to the existing
`identityRoutes` router in `worker/modules/identity/routes.ts`, so it runs through the same
`accessAuth` middleware every other `/api/identity/*` route already does — no new
authentication logic.

## Request

No parameters, no body.

## Response — authenticated (200)

```json
{ "email": "operator@example.com", "role": "member" }
```

`email` and `role` are exactly what `accessAuth` already placed on the request context —
nothing new is looked up.

## Response — not authenticated

`accessAuth`'s existing fail-closed behavior applies unchanged: `403` with plain-text body,
for a missing/invalid/expired token, exactly as every other `/api/*` route already responds
today. The client (see quickstart.md) treats any non-200 outcome as "render the public
landing page," without needing to distinguish 403 from a network error from a redirect —
all of them mean "not authenticated" for this feature's purposes.

## What this contract explicitly does NOT do

- It does not set, read, or clear any cookie.
- It does not accept a token, credential, or any request body.
- It performs no identity-provider interaction — it only reports the result of the
  existing, unmodified `accessAuth` check.
