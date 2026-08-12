// Curated, static lookup of Cloudflare API token permission-group IDs to
// human-readable names (specs/011-clone-token-permissions/, T001,
// research.md §2/data-model.md) — intended to cover the scopes README's
// own "Required API token scopes" table documents (the realistic common
// case: cloning FlareTower's own preview/production tokens).
//
// Deliberately EMPTY for now, not populated with placeholder/guessed IDs.
// Populating it needs a real permission-group ID (a long hex string) per
// scope, which only Cloudflare's own `GET /user/tokens/permission_groups`
// exposes — confirmed live (2026-08-12) that this is NOT published
// anywhere in Cloudflare's public docs, Terraform provider, or community
// references (every public example uses different, unlabeled IDs with no
// reliable name mapping). That endpoint requires the same sensitive "API
// Tokens" scope tier this whole feature exists to avoid (research.md §1),
// so FlareTower's own code must never call it — and this session's own
// Cloudflare credential doesn't hold that scope either (confirmed via
// `wrangler whoami`), so there was no way to populate this file with real,
// verified data right now without either fabricating IDs (worse than
// leaving this empty — a wrong mapping would misinform an operator that a
// permission is something it isn't) or expanding FlareTower's own
// standing credential just to author a static file.
//
// This is a real, open gap, not silently swallowed: every permission-group
// ID falls back to its own raw ID in the UI (renderChecklist in
// token-permissions.ts), clearly marked unrecognized — spec.md's edge
// case for exactly this situation. A maintainer with their own
// already-broader Cloudflare access can populate real entries here later,
// out-of-band, the same way this comment describes; FlareTower's shipped
// code will never do that lookup itself.
export const CLOUDFLARE_PERMISSION_GROUP_NAMES: Record<string, string> = {};
