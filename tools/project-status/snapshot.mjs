// Semantic snapshot extractor for one bounded context (T6a).
//
// Pure functions: no git, no filesystem. Input is a map of relative filename
// -> file content for a single `.github/skills/<bc>/` directory. Output is a
// deterministic, timestamp-free snapshot that `diffSnapshots` can compare.
//
// See README.md ("T6a: snapshot.mjs") for the API contract used by T6b.

import { createHash } from "node:crypto";

export const SNAPSHOT_VERSION = 1;

/** Item categories in output order. `lifecycle` is a scalar, not a list. */
export const CATEGORIES = [
  "features",
  "scenarios",
  "rules",
  "skill",
  "model",
  "ports",
  "decisions",
  "acls",
  "aclSections",
  "properties",
  "gates",
  "openItems",
];

// ------------------------------------------------------------ normalisation

/**
 * Normalise text before hashing: unify line endings, trim trailing whitespace
 * per line, collapse runs of blank lines to one, drop leading/trailing blank
 * lines.
 */
export function normalize(text) {
  const out = [];
  for (const raw of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (line === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** sha256 hex of the normalised text. */
export function hashContent(text) {
  return createHash("sha256").update(normalize(text), "utf8").digest("hex");
}

const isPlaceholderText = (value) => {
  const v = String(value ?? "").trim();
  return (
    v === "" ||
    v === "..." ||
    /^\[.*\]$/.test(v) ||
    /^<.*>$/.test(v) ||
    v.includes("YYYY-MM-DD")
  );
};

const stripTicks = (value) => {
  const t = value.trim();
  const m = /^`([^`]*)`$/.exec(t);
  return m ? m[1].trim() : t;
};

const truncate = (text, max = 80) => (text.length > max ? `${text.slice(0, max)}` : text);

// Give duplicate keys a stable "#2", "#3" suffix in document order.
function dedupeKeys(items) {
  const seen = new Map();
  for (const item of items) {
    const n = (seen.get(item.key) ?? 0) + 1;
    seen.set(item.key, n);
    if (n > 1) item.key = `${item.key}#${n}`;
  }
  return items;
}

// ---------------------------------------------------------------- markdown

const lines = (text) => String(text ?? "").replace(/\r\n?/g, "\n").split("\n");

/** Frontmatter key/value pairs (flat YAML subset). */
export function parseFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(markdown ?? ""));
  const data = {};
  if (!match) return data;
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (pair) data[pair[1]] = stripTicks(pair[2]).replace(/^["']|["']$/g, "");
  }
  return data;
}

/**
 * Split Markdown into sections at headings of exactly `level` (default 2).
 * Headings inside fenced code blocks are ignored. Frontmatter is skipped.
 * Returns [{ heading, body }] where body excludes the heading line and runs
 * until the next heading of the same or a higher level.
 */
export function splitSections(markdown, level = 2) {
  const all = lines(markdown);
  let i = 0;
  if (all[0] === "---") {
    const end = all.indexOf("---", 1);
    if (end !== -1) i = end + 1;
  }
  const sections = [];
  let current = null;
  let fence = null;
  for (; i < all.length; i += 1) {
    const line = all[i];
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
    }
    const h = fence || f ? null : /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h && h[1].length <= level) {
      if (current) sections.push(current);
      current = h[1].length === level ? { heading: h[2].trim(), body: [] } : null;
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ heading: s.heading, body: s.body.join("\n") }));
}

function splitRow(line) {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|")) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map((cell) => stripTicks(cell.replace(/\\\|/g, "|")));
}

const isSeparator = (line) => /^\|?[\s:|-]+\|?$/.test(line) && line.includes("-");

/**
 * First pipe table in a section body. Returns [{ cells: {header: value},
 * values: [..] }]. Rows with any placeholder cell ("[...]", "<...>",
 * "YYYY-MM-DD") or all-empty cells are skipped.
 */
export function parseTable(body) {
  const rows = [];
  let header = null;
  for (const line of lines(body)) {
    if (!line.trim().startsWith("|")) {
      if (header) break;
      continue;
    }
    if (!header) {
      header = splitRow(line).map((h) => h.toLowerCase());
      continue;
    }
    if (isSeparator(line.trim())) continue;
    const values = splitRow(line);
    if (values.every((v) => v === "") || values.some((v) => isPlaceholderText(v) && v !== "")) {
      continue;
    }
    const cells = {};
    header.forEach((name, idx) => {
      cells[name] = values[idx] ?? "";
    });
    rows.push({ cells, values });
  }
  return rows;
}

const findSection = (markdown, heading) =>
  splitSections(markdown).find((s) => s.heading.toLowerCase() === heading.toLowerCase()) ?? null;

const sectionItems = (markdown, exclude = []) =>
  dedupeKeys(
    splitSections(markdown)
      .filter((s) => !isPlaceholderText(s.heading))
      .filter((s) => !exclude.some((x) => x.toLowerCase() === s.heading.toLowerCase()))
      .map((s) => ({ key: s.heading, label: s.heading, hash: hashContent(s.body) })),
  );

// ----------------------------------------------------------------- gherkin

const STEP_START = /^(Scenario Outline|Scenario Template|Scenario|Example):\s*(.*)$/;
const BLOCK_END = /^(Feature|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example):/;

/**
 * Extract features and scenarios from Gherkin text (fenced or bare) inside
 * bdd-scenarios.md. Scenario content = its tag lines, title line, steps,
 * doc strings and Examples tables, each line trimmed (re-indentation is not a
 * change). Feature content = Feature line, description and Background, up to
 * its first Rule/Scenario, so a scenario edit does not modify its feature.
 */
export function parseGherkin(markdown) {
  const scenarios = [];
  const features = [];
  let feature = null;
  let scenario = null;
  let pendingTags = [];
  let inFeatureHeader = false;
  let inDocString = false;

  const closeScenario = () => {
    if (scenario) scenarios.push(scenario);
    scenario = null;
  };

  for (const raw of lines(markdown)) {
    const line = raw.trim();
    if (inDocString) {
      if (scenario) scenario.lines.push(line);
      else if (inFeatureHeader && feature) feature.lines.push(line);
      if (line.startsWith('"""') || line.startsWith("```")) inDocString = false;
      continue;
    }
    if (/^(```|~~~)/.test(line)) {
      // Markdown fence open/close: ends any open scenario and feature header.
      closeScenario();
      inFeatureHeader = false;
      pendingTags = [];
      continue;
    }
    if (/^#{1,6}\s/.test(raw)) {
      closeScenario();
      inFeatureHeader = false;
      pendingTags = [];
      continue;
    }
    if (line.startsWith("@")) {
      closeScenario();
      inFeatureHeader = false;
      pendingTags.push(line);
      continue;
    }
    const featureMatch = /^Feature:\s*(.*)$/.exec(line);
    if (featureMatch) {
      closeScenario();
      feature = { title: featureMatch[1].trim(), lines: [...pendingTags, line] };
      features.push(feature);
      pendingTags = [];
      inFeatureHeader = true;
      continue;
    }
    const scenarioMatch = STEP_START.exec(line);
    if (scenarioMatch) {
      closeScenario();
      inFeatureHeader = false;
      const tags = pendingTags;
      pendingTags = [];
      const id = tags.join(" ").match(/@scenario:(\S+)/)?.[1] ?? null;
      scenario = {
        id,
        title: scenarioMatch[2].trim(),
        feature: feature?.title ?? null,
        lines: [...tags, line],
      };
      continue;
    }
    if (BLOCK_END.test(line)) {
      // Rule: / Background:
      closeScenario();
      pendingTags = [];
      if (/^Background:/.test(line) && feature) {
        inFeatureHeader = true;
        feature.lines.push(line);
      } else {
        inFeatureHeader = false;
      }
      continue;
    }
    if (line.startsWith('"""')) inDocString = true;
    if (scenario) scenario.lines.push(line);
    else if (inFeatureHeader && feature) feature.lines.push(line);
  }
  closeScenario();
  return { features, scenarios };
}

// ------------------------------------------------------------- categories

function extractScenarios(bdd) {
  const { features, scenarios } = parseGherkin(bdd);
  const scenarioItems = dedupeKeys(
    scenarios
      .filter((s) => !(s.id && s.id.includes("<")) && !isPlaceholderText(s.title))
      .map((s) => ({
        key: s.id ? `@scenario:${s.id}` : `title:${s.title}`,
        label: s.title,
        hash: hashContent(s.lines.join("\n")),
      })),
  );
  const featureItems = dedupeKeys(
    features
      .filter((f) => !isPlaceholderText(f.title))
      .map((f) => ({ key: f.title, label: f.title, hash: hashContent(f.lines.join("\n")) })),
  );
  return { scenarios: scenarioItems, features: featureItems };
}

/**
 * Core Business Rules: numbered list items (with continuation lines). Key and
 * hash are the content hash of the rule text without its number (D5); label
 * is "#<n>: <first 80 chars>". Each item also carries `number`.
 */
export function extractRules(skill) {
  const section = findSection(skill, "Core Business Rules");
  if (!section) return [];
  const rules = [];
  let current = null;
  for (const raw of lines(section.body)) {
    const m = /^\s{0,3}(\d+)[.)]\s+(.*)$/.exec(raw);
    if (m) {
      if (current) rules.push(current);
      current = { number: Number(m[1]), text: [m[2]] };
    } else if (!current) {
      continue;
    } else if (raw.trim() === "") {
      current.text.push("");
    } else if (
      /^\s{2,}\S/.test(raw) ||
      (current.text[current.text.length - 1] !== "" && !/^([-*+]\s|#|\|)/.test(raw))
    ) {
      // Indented block, or a lazy continuation directly after rule text.
      current.text.push(raw.trim());
    } else {
      // Top-level bullet, heading or table ends the numbered list.
      rules.push(current);
      current = null;
    }
  }
  if (current) rules.push(current);
  return dedupeKeys(
    rules
      .map((r) => ({ number: r.number, text: normalize(r.text.join("\n")) }))
      .filter((r) => !isPlaceholderText(r.text))
      .map((r) => {
        const hash = hashContent(r.text);
        const flat = r.text.replace(/\s+/g, " ");
        return { key: hash, label: `#${r.number}: ${truncate(flat)}`, hash, number: r.number };
      }),
  );
}

function extractPorts(domainModel) {
  const section = findSection(domainModel, "Ports");
  if (!section) return [];
  return dedupeKeys(
    parseTable(section.body)
      .map((row) => {
        const name = row.cells.name ?? row.cells.port ?? row.values[0] ?? "";
        return { key: name, label: name, hash: hashContent(row.values.join(" | ")) };
      })
      .filter((p) => !isPlaceholderText(p.key)),
  );
}

function extractAcls(files) {
  const names = Object.keys(files)
    .filter((n) => /(^|\/)[^/]*-acl\.md$/.test(n))
    .sort();
  const acls = names.map((n) => ({ key: n, label: n, hash: hashContent(files[n]) }));
  const aclSections = names.flatMap((n) =>
    sectionItems(files[n]).map((s) => ({ ...s, key: `${n}#${s.key}`, label: `${n}: ${s.label}` })),
  );
  return { acls, aclSections: dedupeKeys(aclSections) };
}

function extractProperties(properties) {
  return dedupeKeys(
    splitSections(properties)
      .map((s) => ({ s, m: /^@property:(\S+)\s*(.*)$/.exec(s.heading) }))
      .filter(({ m }) => m && !m[1].includes("<"))
      .map(({ s, m }) => ({
        key: `@property:${m[1]}`,
        label: m[2].trim() || m[1],
        hash: hashContent(`${s.heading}\n${s.body}`),
      })),
  );
}

function extractGates(status) {
  const section = findSection(status, "Gate Evidence");
  if (!section) return [];
  return dedupeKeys(
    parseTable(section.body).map(({ cells, values }) => {
      const transition = (cells.transition ?? "").replace(/\s*(?:->|→)\s*/, " -> ");
      const gate = cells.gate ?? "";
      const date = cells.date ?? "";
      const result = (cells.result ?? "").toUpperCase();
      return {
        key: `${transition}|${gate}|${date}`,
        label: `${transition} ${gate} ${result} (${date})`,
        hash: hashContent(values.join(" | ")),
      };
    }),
  );
}

function extractOpenItems(status) {
  const section = findSection(status, "Open Items");
  if (!section) return [];
  return dedupeKeys(
    parseTable(section.body).map(({ cells, values }) => {
      const id = cells.id && cells.id !== "-" ? cells.id : null;
      const item = cells.item ?? cells["open item"] ?? values[0] ?? "";
      return {
        key: id ?? item,
        label: id ? `${id}: ${truncate(item)}` : truncate(item),
        hash: hashContent(values.join(" | ")),
      };
    }),
  );
}

// --------------------------------------------------------------- snapshot

/**
 * Snapshot one BC. `files`: { "SKILL.md": "...", "status.md": "...", ... };
 * any file may be missing. Returns { version, lifecycle, <category>: Item[] }
 * where Item = { key, label, hash } (rules also carry `number`). Lists keep
 * document order; keys are unique within a category.
 */
export function snapshotBc(files = {}) {
  const get = (name) => (typeof files[name] === "string" ? files[name] : "");
  const skill = get("SKILL.md");
  const status = get("status.md");
  const { scenarios, features } = extractScenarios(get("bdd-scenarios.md"));
  const { acls, aclSections } = extractAcls(files);
  const lifecycle = parseFrontmatter(status).lifecycle;
  return {
    version: SNAPSHOT_VERSION,
    lifecycle: lifecycle && !isPlaceholderText(lifecycle) ? lifecycle : null,
    features,
    scenarios,
    rules: extractRules(skill),
    skill: sectionItems(skill, ["Core Business Rules"]),
    model: sectionItems(get("domain-model.md")),
    ports: extractPorts(get("domain-model.md")),
    decisions: sectionItems(get("decisions.md")),
    acls,
    aclSections,
    properties: extractProperties(get("properties.md")),
    gates: extractGates(status),
    openItems: extractOpenItems(status),
  };
}

// ------------------------------------------------------------------- diff

const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
const brief = (item) => ({ key: item.key, label: item.label });

function diffKeyed(before, after) {
  const old = new Map(before.map((i) => [i.key, i]));
  const now = new Map(after.map((i) => [i.key, i]));
  const added = after.filter((i) => !old.has(i.key)).map(brief);
  const removed = before.filter((i) => !now.has(i.key)).map(brief);
  const modified = after
    .filter((i) => old.has(i.key) && old.get(i.key).hash !== i.hash)
    .map((i) => ({ key: i.key, label: i.label, hashBefore: old.get(i.key).hash, hashAfter: i.hash }));
  return { added: added.sort(byKey), removed: removed.sort(byKey), modified: modified.sort(byKey) };
}

/**
 * Rules diff: (1) match by content hash -> unchanged; if the number changed
 * it is listed in `moved` (pure renumbering is not a content change);
 * (2) unmatched rules with the same number -> `modified`; (3) rest -> added
 * / removed. Modified rule entries use the new hash as `key` and carry
 * `previousKey`, `labelBefore`, `numberBefore`, `numberAfter`.
 */
function diffRules(before, after) {
  const pool = new Map();
  for (const r of before) {
    const list = pool.get(r.hash) ?? [];
    list.push(r);
    pool.set(r.hash, list);
  }
  const moved = [];
  const leftAfter = [];
  for (const r of after) {
    const list = pool.get(r.hash);
    if (list && list.length) {
      const prev = list.shift();
      if (prev.number !== r.number) {
        moved.push({ key: r.key, label: r.label, numberBefore: prev.number, numberAfter: r.number });
      }
    } else {
      leftAfter.push(r);
    }
  }
  const leftBefore = [...pool.values()].flat();
  const beforeByNumber = new Map();
  for (const r of leftBefore) if (!beforeByNumber.has(r.number)) beforeByNumber.set(r.number, r);
  const modified = [];
  const added = [];
  const usedBefore = new Set();
  for (const r of leftAfter) {
    const prev = beforeByNumber.get(r.number);
    if (prev && !usedBefore.has(prev)) {
      usedBefore.add(prev);
      modified.push({
        key: r.key,
        label: r.label,
        previousKey: prev.key,
        labelBefore: prev.label,
        numberBefore: prev.number,
        numberAfter: r.number,
        hashBefore: prev.hash,
        hashAfter: r.hash,
      });
    } else {
      added.push(brief(r));
    }
  }
  const removed = leftBefore.filter((r) => !usedBefore.has(r)).map(brief);
  return {
    added: added.sort(byKey),
    removed: removed.sort(byKey),
    modified: modified.sort(byKey),
    moved: moved.sort(byKey),
  };
}

/** An empty snapshot (no files). */
export const emptySnapshot = () => snapshotBc({});

/**
 * Diff two snapshots. `before` may be null (everything is added). Returns
 * { <category>: {added, removed, modified[, moved]}, lifecycle?: {from, to},
 * summary: {added, removed, modified, moved, changed} }. Lists are sorted by
 * key. `summary.changed` is false when nothing was added/removed/modified and
 * lifecycle is unchanged (`moved` rules alone do not count as a change).
 */
export function diffSnapshots(before, after) {
  const prev = before ?? null;
  const next = after ?? emptySnapshot();
  const result = {};
  const summary = { added: 0, removed: 0, modified: 0, moved: 0, changed: false };
  for (const category of CATEGORIES) {
    const a = prev?.[category] ?? [];
    const b = next[category] ?? [];
    const d = category === "rules" ? diffRules(a, b) : diffKeyed(a, b);
    result[category] = d;
    summary.added += d.added.length;
    summary.removed += d.removed.length;
    summary.modified += d.modified.length;
    summary.moved += d.moved?.length ?? 0;
  }
  const from = prev ? prev.lifecycle ?? null : null;
  const to = next.lifecycle ?? null;
  if (from !== to) result.lifecycle = { from, to };
  summary.changed = summary.added + summary.removed + summary.modified > 0 || from !== to;
  result.summary = summary;
  return result;
}
