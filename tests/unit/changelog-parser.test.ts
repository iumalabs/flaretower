import { assertEquals } from "@std/assert";
import { parseChangelog } from "../../app/lib/changelog-parser.ts";

const SAMPLE = `# Changelog

## [1.15.11](https://github.com/iumalabs/flaretower/compare/v1.15.10...v1.15.11) (2026-08-26)


### Bug Fixes

* authenticated visitors can view the public landing page at / again ([#523](https://github.com/iumalabs/flaretower/issues/523)) ([c590569](https://github.com/iumalabs/flaretower/commit/c590569c38e57f8702629d42cb3e74c99bf854b9))

## [1.6.0](https://github.com/iumalabs/flaretower/compare/v1.5.0...v1.6.0) (2026-08-13)


### Features

* **audit:** account-wide activity feed (T001-T010) ([#280](https://github.com/iumalabs/flaretower/issues/280)) ([abc1234](https://github.com/iumalabs/flaretower/commit/abc1234))
* a plain, unscoped feature entry ([#281](https://github.com/iumalabs/flaretower/issues/281)) ([def5678](https://github.com/iumalabs/flaretower/commit/def5678))


### Bug Fixes

* **exposure:** fix a thing ([#282](https://github.com/iumalabs/flaretower/issues/282)) ([abcd000](https://github.com/iumalabs/flaretower/commit/abcd000))
`;

Deno.test("parseChangelog - extracts every release heading (version, compare link, date)", () => {
  const releases = parseChangelog(SAMPLE);
  assertEquals(releases.length, 2);
  assertEquals(releases[0].version, "1.15.11");
  assertEquals(
    releases[0].compareHref,
    "https://github.com/iumalabs/flaretower/compare/v1.15.10...v1.15.11",
  );
  assertEquals(releases[0].date, "2026-08-26");
});

Deno.test("parseChangelog - bullets are attached to the release they appear under, not the next one", () => {
  const releases = parseChangelog(SAMPLE);
  assertEquals(releases[0].items.length, 1);
  assertEquals(releases[1].items.length, 3);
});

Deno.test("parseChangelog - bullets are categorized by the most recent ### heading", () => {
  const releases = parseChangelog(SAMPLE);
  const [feature1, feature2, fix1] = releases[1].items;
  assertEquals(feature1.category, "Features");
  assertEquals(feature2.category, "Features");
  assertEquals(fix1.category, "Bug Fixes");
});

Deno.test("parseChangelog - a **scope:** prefix renders as a bold segment, not raw asterisks", () => {
  const releases = parseChangelog(SAMPLE);
  const [scoped] = releases[1].items;
  assertEquals(scoped.segments[0], { type: "bold", value: "audit:" });
});

Deno.test("parseChangelog - issue/commit references become link segments with real hrefs", () => {
  const releases = parseChangelog(SAMPLE);
  const linkSegments = releases[0].items[0].segments.filter((s) => s.type === "link");
  assertEquals(linkSegments, [
    {
      type: "link",
      text: "#523",
      href: "https://github.com/iumalabs/flaretower/issues/523",
    },
    {
      type: "link",
      text: "c590569",
      href:
        "https://github.com/iumalabs/flaretower/commit/c590569c38e57f8702629d42cb3e74c99bf854b9",
    },
  ]);
});

Deno.test("parseChangelog - plain surrounding text survives as text segments", () => {
  const releases = parseChangelog(SAMPLE);
  const textSegments = releases[0].items[0].segments.filter((s) => s.type === "text").map((s) =>
    s.type === "text" ? s.value : ""
  );
  assertEquals(
    textSegments.join(""),
    "authenticated visitors can view the public landing page at / again () ()",
  );
});

Deno.test("parseChangelog - decodes HTML entities release-please escapes in commit descriptions", () => {
  const markdown = `## [1.0.0](https://x/compare) (2026-01-01)

### Bug Fixes

* worker detail deep-links to /workers/&lt;name&gt;, not a bare /worker-detail ([#500](https://x/500)) ([abc](https://x/commit/abc))
`;
  const releases = parseChangelog(markdown);
  const textSegments = releases[0].items[0].segments.filter((s) => s.type === "text").map((s) =>
    s.type === "text" ? s.value : ""
  );
  assertEquals(
    textSegments.join(""),
    "worker detail deep-links to /workers/<name>, not a bare /worker-detail () ()",
  );
});

Deno.test("parseChangelog - an empty file produces zero releases", () => {
  assertEquals(parseChangelog(""), []);
});

Deno.test("parseChangelog - a bullet before any release heading is dropped, not crashed on", () => {
  const releases = parseChangelog(
    "* stray bullet\n\n## [1.0.0](https://x/compare) (2026-01-01)\n\n* real one",
  );
  assertEquals(releases.length, 1);
  assertEquals(releases[0].items.length, 1);
});
