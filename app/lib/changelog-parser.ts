// issue #528 — parses the repo's real, release-please-generated CHANGELOG.md
// so the public /changelog page renders that file's actual content, not a
// hand-authored duplicate (exactly the kind of content drift issue #525
// already found once, between /docs and the README). Pure parsing, no DOM —
// testable without rendering React (tests/unit/changelog-parser.test.ts).
// vite.config.ts's own changelog-serving plugin is what gets the raw file
// to the client in the first place; this only interprets it once it's here.

export type ChangelogSegment =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "link"; text: string; href: string };

export interface ChangelogItem {
  category: string;
  segments: ChangelogSegment[];
}

export interface ChangelogRelease {
  version: string;
  compareHref: string | null;
  date: string;
  items: ChangelogItem[];
}

const RELEASE_HEADING = /^## \[([^\]]+)\]\(([^)]+)\)\s*\(([^)]+)\)\s*$/;
const CATEGORY_HEADING = /^### (.+?)\s*$/;
const BULLET_LINE = /^\*\s+(.+?)\s*$/;
// release-please's own conventional-commit bullet shape: `**scope:** text`
// or plain `**text**` for emphasis elsewhere — both handled the same way,
// alongside `[text](url)` links (issue/commit references).
const INLINE_SEGMENT = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

// release-please HTML-escapes characters like `<`/`>` that appear in a
// commit's own description (e.g. "/workers/<name>") so they're safe inside
// the markdown file — this renders them as plain text, not markdown/HTML,
// so those entities need decoding back to their real characters or a real
// commit message like that one shows up as literal "&lt;name&gt;" on the
// page instead of "<name>".
const HTML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(lt|gt|amp|quot|#39|apos);/g, (entity) => HTML_ENTITIES[entity]);
}

function parseInline(rawText: string): ChangelogSegment[] {
  const text = decodeHtmlEntities(rawText);
  const segments: ChangelogSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_SEGMENT)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, index) });
    }
    if (match[1] !== undefined) {
      segments.push({ type: "link", text: match[1], href: match[2] });
    } else {
      segments.push({ type: "bold", value: match[3] });
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

// Bullets before the first `##` release heading (shouldn't happen in a real
// release-please changelog, but this is parsing a file outside this
// codebase's own control) are silently dropped rather than crashing — same
// resilient-degradation spirit as every module's own API-failure handling.
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let currentCategory = "Other";

  for (const line of markdown.split("\n")) {
    const releaseMatch = RELEASE_HEADING.exec(line);
    if (releaseMatch) {
      releases.push({
        version: releaseMatch[1],
        compareHref: releaseMatch[2],
        date: releaseMatch[3],
        items: [],
      });
      currentCategory = "Other";
      continue;
    }

    const categoryMatch = CATEGORY_HEADING.exec(line);
    if (categoryMatch) {
      currentCategory = categoryMatch[1];
      continue;
    }

    const bulletMatch = BULLET_LINE.exec(line);
    if (bulletMatch && releases.length > 0) {
      releases[releases.length - 1].items.push({
        category: currentCategory,
        segments: parseInline(bulletMatch[1]),
      });
    }
  }

  return releases;
}
