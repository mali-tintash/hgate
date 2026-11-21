#!/usr/bin/env node
// Copies docs/viewer-guide.md into tools/gherkin-viewer/viewer-guide.js.
// The viewer opens from file:// and cannot fetch repository files, so the
// guide is embedded. Run after editing the guide:
//   node tools/gherkin-viewer/sync-guide.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "docs", "viewer-guide.md");
const target = join(here, "viewer-guide.js");
const markdown = readFileSync(source, "utf8");

const output = `// GENERATED from docs/viewer-guide.md by tools/gherkin-viewer/sync-guide.mjs.
// Do not edit by hand: edit the Markdown, then run
//   node tools/gherkin-viewer/sync-guide.mjs
(function (root) {
  "use strict";
  const GUIDE_MARKDOWN = ${JSON.stringify(markdown)};
  if (typeof module === "object" && module.exports) module.exports = { GUIDE_MARKDOWN };
  if (root) root.HgateViewerGuide = { GUIDE_MARKDOWN };
})(typeof window !== "undefined" ? window : null);
`;
writeFileSync(target, output);
console.log(`Wrote ${target}`);
