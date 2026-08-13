# API Contract: DNS Dashboard

**Feature**: [spec.md](../spec.md) | **Date**: 2026-08-13

`GET /api/dns/inventory` (existing endpoint, response extended — no new endpoint, no new route).

**Response 200** (new fields only shown per record; every existing field unchanged):

```json
{
  "run_id": "01JDNSXYZ...",
  "evaluated_at": "2026-08-13T12:00:00Z",
  "zones": [
    {
      "zone_name": "acme.dev",
      "records": [
        {
          "record_name": "_dmarc.acme.dev",
          "type": "TXT",
          "content": "v=DMARC1; p=none; rua=...",
          "proxy_capable": false,
          "proxied": null,
          "ttl": 3600,
          "is_platform_target": false,
          "status": "warning",
          "reason": "DMARC policy provides no enforcement (p=none)"
        },
        {
          "record_name": "docs.acme.dev",
          "type": "CNAME",
          "content": "acme-docs.pages.dev",
          "proxy_capable": true,
          "proxied": true,
          "ttl": 1,
          "is_platform_target": true,
          "status": "safe",
          "reason": "proxied through Cloudflare"
        }
      ]
    }
  ]
}
```

`POST /api/dns/evaluate` — unchanged (still persists a new run including the new `ttl` column).
