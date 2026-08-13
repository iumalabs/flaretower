-- specs/013-dns-dashboard: TTL is already present in the same
-- GET /zones/{id}/dns_records response this module already fetches
-- (research.md §1) — this just persists it alongside every other
-- per-record field already stored, rather than a parallel live-only fetch.
-- Nullable: existing rows written before this migration have no ttl value;
-- 1 means "auto" (Cloudflare's own convention for a proxied record).
ALTER TABLE dns_findings ADD COLUMN ttl INTEGER;
