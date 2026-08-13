# API Contract: Access Dashboard

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-13

`GET /api/zero-trust/inventory` (existing endpoint, response extended).

**Response 200**:

```json
{
  "run_id": "01JZTXYZ...",
  "evaluated_at": "2026-08-13T12:00:00Z",
  "applications": [
    {
      "app_id": "app-1",
      "app_name": "gateway-admin",
      "app_domain": "api.acme.dev/*",
      "policy_count": 3,
      "covered_hostname_count": 2,
      "identity_summary": "Okta SSO",
      "session_duration": "24h",
      "policy_rules": [
        [
          { "verb": "ALLOW", "label": "emails ending in @acme.dev" },
          { "verb": "ALLOW", "label": "service token · gateway-ci" },
          { "verb": "REQUIRE", "label": "identity provider · Okta" }
        ],
        [
          { "verb": "DENY", "label": "everyone else" }
        ]
      ],
      "status": "warning",
      "reason": "a policy allows Everyone or bypasses identity verification"
    }
  ],
  "service_tokens": [
    { "token_id": "...", "token_name": "...", "expires_at": null, "status": "safe", "reason": "..." }
  ],
  "access_groups": [
    { "group_id": "grp-1", "name": "platform", "rule_summary": "Okta group", "referenced_by_app_count": 4 }
  ]
}
```

`access_groups` is `null` (not `[]`) when the Groups fetch failed entirely (spec.md FR-008,
data-model.md).

`POST /api/zero-trust/evaluate` — unchanged (still persists a new run including the new
`zt_app_findings` columns; Access Groups are not part of the evaluate/persist pipeline at all,
research.md §3).
