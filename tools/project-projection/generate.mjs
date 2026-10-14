#!/usr/bin/env node

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const EXIT_OK = 0;
export const EXIT_INVALID = 1;
export const EXIT_USAGE = 2;

const DEFAULT_OUTPUT = "docs/hgate-project.json";
const SCHEMA_PATH = "docs/hgate-project.schema.json";
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_SCHEMA = path.resolve(THIS_DIR, "../..", SCHEMA_PATH);

export class ProjectionError extends Error {
  constructor(problems) {
    super(problems.join("\n"));
    this.problems = problems;
  }
}

const toPosix = (value) => value.split(path.sep).join("/");

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

// ---------------------------------------------------------------- markdown

const clean = (cell) => {
  const trimmed = cell.trim();
  const match = /^`([^`]*)`$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
};

const isPlaceholder = (value) => /^\[.*\]$/.test(value) || value === "";

function splitRow(line) {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|")) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map((cell) => clean(cell.replace(/\\\|/g, "|")));
}

const isSeparator = (line) => /^\|?[\s:|-]+\|?$/.test(line) && line.includes("-");

function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    new RegExp(`^#{2,6}\\s+${heading}\\s*$`, "i").test(line),
  );
  if (start === -1) return null;
  const level = /^#+/.exec(lines[start])[0].length;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    const next = /^(#+)\s/.exec(line);
    if (next && next[1].length <= level) break;
    body.push(line);
  }
  return body;
}

// Returns row objects keyed by lower-cased header; template placeholder rows
// ("[...]" in the first cell) are skipped.
function table(markdown, heading) {
  const body = section(markdown, heading);
  if (!body) return [];
  const rows = [];
  let header = null;
  for (const line of body) {
    if (!line.trim().startsWith("|")) {
      if (header && rows.length) break;
      continue;
    }
    if (!header) {
      header = splitRow(line).map((name) => name.toLowerCase());
      continue;
    }
    if (isSeparator(line.trim())) continue;
    const cells = splitRow(line);
    if (isPlaceholder(cells[0])) continue;
    const row = {};
    header.forEach((name, index) => {
      row[name] = cells[index] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function frontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  const data = {};
  if (!match) return data;
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (pair) data[pair[1]] = clean(pair[2]).replace(/^["']|["']$/g, "");
  }
  return data;
}

function firstParagraph(markdown, heading) {
  const body = section(markdown, heading);
  if (!body) return "";
  const paragraph = [];
  for (const line of body) {
    if (!line.trim()) {
      if (paragraph.length) break;
      continue;
    }
    if (/^(```|\||[-*]\s|#)/.test(line.trim())) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(line.trim());
  }
  return paragraph.join(" ");
}

function boldField(markdown, label) {
  const match = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, "im").exec(markdown);
  return match ? match[1].trim() : "";
}

const splitList = (value) =>
  value
    .split(/\s*;\s*/)
    .map((item) => item.trim())
    .filter((item) => item && !/^(none|n\/a|-)$/i.test(item));

const upper = (value) => value.trim().replace(/[\s/-]+/g, "_").toUpperCase();

function setIfPresent(target, key, value) {
  if (value !== undefined && value !== "") target[key] = value;
}

// ---------------------------------------------------------------- generator

export async function buildProjection(root) {
  const problems = [];
  const domainMap = await readOptional(path.join(root, "docs/domain-map.md"));
  if (domainMap === null) {
    throw new ProjectionError(["docs/domain-map.md not found"]);
  }
  const contextMap = (await readOptional(path.join(root, "docs/context-map.md"))) ?? "";

  const name = boldField(domainMap, "Project");
  if (!name) {
    problems.push('docs/domain-map.md: missing "**Project:** <name>" line');
  }
  const project = { name };
  setIfPresent(project, "description", boldField(domainMap, "Description"));

  const domains = table(domainMap, "Domain Inventory").map((row) => ({
    id: row["domain id"],
    name: row["domain/subdomain"],
    classification: upper(row.classification),
    purpose: row["business purpose"],
  }));
  const domainByKey = new Map();
  for (const domain of domains) {
    domainByKey.set(domain.id.toLowerCase(), domain);
    domainByKey.set(domain.name.toLowerCase(), domain);
  }

  const boundedContexts = [];
  const bcByKey = new Map();
  for (const row of table(domainMap, "Bounded Context Inventory")) {
    const id = row["bc id"];
    const domain = domainByKey.get(row["domain/subdomain"].toLowerCase());
    if (!domain) {
      problems.push(`BC ${id}: unknown domain "${row["domain/subdomain"]}"`);
    }
    const statusPath = row["local status"];
    const dir = statusPath ? path.posix.dirname(statusPath) : `.github/skills/${id}`;
    const bc = await buildBoundedContext({ root, id, row, dir, domainId: domain?.id ?? "", problems });
    boundedContexts.push(bc);
    bcByKey.set(id.toLowerCase(), bc);
    bcByKey.set(row["bounded context"].toLowerCase(), bc);
  }

  for (const row of table(domainMap, "Business Capabilities")) {
    const owner = bcByKey.get(row["owning bc"].toLowerCase());
    if (!owner) {
      problems.push(`Capability "${row.capability}": unknown owning BC "${row["owning bc"]}"`);
      continue;
    }
    const capability = { name: row.capability };
    setIfPresent(capability, "trigger", row.trigger);
    setIfPresent(capability, "outcome", row.outcome);
    capability.status = upper(row.status);
    owner.capabilities.push(capability);
  }

  const relationships = table(contextMap, "Context Relationships").map((row) => {
    const relationship = {
      id: row["relationship id"],
      from: row["provider/owner bc id"],
      to: row["consumer bc id"],
      information: row["information or decision exchanged"],
    };
    setIfPresent(relationship, "sourceOfTruth", row["source of truth"]);
    setIfPresent(relationship, "consistency", row["consistency expectation"]);
    setIfPresent(relationship, "interaction", row["candidate interaction"]);
    setIfPresent(relationship, "translationAcl", row["translation/acl"]);
    relationship.status = row.status;
    return relationship;
  });

  const journeys = table(contextMap, "Cross-BC Journeys").map((row) => {
    const journey = {
      id: row["journey id"],
      name: row.journey,
      boundedContextIds: (row["participating bc ids"] ?? "")
        .split(/\s*,\s*/)
        .map(clean)
        .filter(Boolean),
    };
    setIfPresent(journey, "entryPoint", row["entry point"]);
    setIfPresent(journey, "outcome", row["business outcome"]);
    setIfPresent(journey, "validationArtifact", row["validation artifact"]);
    return journey;
  });

  const projection = {
    $schema: "./hgate-project.schema.json",
    schemaVersion: 1,
    project,
    domains,
    boundedContexts,
    relationships,
    journeys,
  };

  sortProjection(projection);
  checkReferences(projection, problems);
  if (problems.length) throw new ProjectionError(problems);
  return projection;
}

async function buildBoundedContext({ root, id, row, dir, domainId, problems }) {
  const file = (name) => `${dir}/${name}`;
  const read = (name) => readOptional(path.join(root, file(name)));
  const skill = await read("SKILL.md");
  const domainModel = await read("domain-model.md");
  const status = await read("status.md");
  const bdd = await read("bdd-scenarios.md");

  let lifecycle = "";
  if (status === null) {
    problems.push(`BC ${id}: ${file("status.md")} not found (lifecycle is authoritative there)`);
  } else {
    lifecycle = (frontmatter(status).lifecycle ?? "").toUpperCase();
    if (!lifecycle) problems.push(`BC ${id}: ${file("status.md")} has no lifecycle frontmatter`);
  }

  const bc = {
    id,
    name: row["bounded context"],
    domainId,
    classification: upper(row.classification),
    role: upper(row["boundary role"]),
    lifecycle,
  };
  if (skill !== null) setIfPresent(bc, "purpose", firstParagraph(skill, "Purpose"));
  bc.owns = splitList(row.owns ?? "");
  bc.doesNotOwn = splitList(row["does not own"] ?? "");
  bc.capabilities = [];
  bc.ports = domainModel === null ? [] : readPorts(domainModel, id, problems);
  bc.acls = await readAcls(root, dir, id, problems);
  bc.sources = {};
  if (skill !== null) bc.sources.skill = file("SKILL.md");
  if (domainModel !== null) bc.sources.domainModel = file("domain-model.md");
  if (status !== null) bc.sources.status = file("status.md");
  if (bdd !== null) bc.sources.bddScenarios = file("bdd-scenarios.md");
  return bc;
}

function readPorts(domainModel, bcId, problems) {
  return table(domainModel, "Ports").map((row) => {
    const direction = upper(row.direction ?? "");
    if (!direction) problems.push(`BC ${bcId}: port ${row.name} has no direction`);
    return {
      name: row.name,
      direction,
      purpose: row.purpose ?? "",
      contract: row.contract ?? "",
    };
  });
}

async function readAcls(root, dir, bcId, problems) {
  let entries = [];
  try {
    entries = await readdir(path.join(root, dir));
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  const acls = [];
  for (const entry of entries.filter((item) => item.endsWith("-acl.md")).sort()) {
    const text = await readFile(path.join(root, dir, entry), "utf8");
    const meta = frontmatter(text);
    const title = /^#\s+(.+)$/m.exec(text)?.[1].trim() ?? "";
    const acl = {
      name: meta.acl || meta.name || title,
      system: meta.system ?? "",
      direction: upper(meta.direction || "UNKNOWN"),
    };
    if (!acl.system) {
      problems.push(`BC ${bcId}: ${dir}/${entry} needs "system:" frontmatter`);
    }
    setIfPresent(acl, "purpose", firstParagraph(text, "Purpose"));
    acl.file = `${dir}/${entry}`;
    acls.push(acl);
  }
  return acls;
}

const byText = (key) => (left, right) =>
  left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0;

// Documented contract: collections ordered by stable ID, nested ones by name.
function sortProjection(projection) {
  projection.domains.sort(byText("id"));
  projection.boundedContexts.sort(byText("id"));
  projection.relationships.sort(byText("id"));
  projection.journeys.sort(byText("id"));
  for (const bc of projection.boundedContexts) {
    bc.capabilities.sort(byText("name"));
    bc.ports.sort(byText("name"));
    bc.acls.sort(byText("name"));
  }
}

function checkReferences(projection, problems) {
  const unique = (label, items) => {
    const ids = new Set();
    for (const item of items) {
      if (ids.has(item.id)) problems.push(`duplicate ${label} id "${item.id}"`);
      ids.add(item.id);
    }
    return ids;
  };
  const domainIds = unique("domain", projection.domains);
  const bcIds = unique("bounded context", projection.boundedContexts);
  unique("relationship", projection.relationships);
  unique("journey", projection.journeys);
  for (const bc of projection.boundedContexts) {
    if (bc.domainId && !domainIds.has(bc.domainId)) {
      problems.push(`BC ${bc.id}: domainId "${bc.domainId}" is not a domain`);
    }
  }
  for (const rel of projection.relationships) {
    for (const end of [rel.from, rel.to]) {
      if (!bcIds.has(end)) problems.push(`relationship ${rel.id}: unknown BC "${end}"`);
    }
  }
  for (const journey of projection.journeys) {
    for (const end of journey.boundedContextIds) {
      if (!bcIds.has(end)) problems.push(`journey ${journey.id}: unknown BC "${end}"`);
    }
  }
}

// ---------------------------------------------------------------- rendering

// Prettier-compatible layout: arrays of primitives stay on one line.
export function render(value, indent = 0) {
  const pad = "  ".repeat(indent);
  const inner = "  ".repeat(indent + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((item) => item === null || typeof item !== "object")) {
      return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
    }
    return `[\n${value.map((item) => inner + render(item, indent + 1)).join(",\n")}\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    return `{\n${keys
      .map((key) => `${inner}${JSON.stringify(key)}: ${render(value[key], indent + 1)}`)
      .join(",\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}

export const renderProjection = (projection) => `${render(projection)}\n`;

// ---------------------------------------------------------------- validation

// Minimal JSON Schema subset validator covering the keywords used by
// hgate-project.schema.json: type, enum, const, required, properties,
// additionalProperties, items, pattern, minLength and $ref into #/$defs.
export function validateSchema(data, schema) {
  const errors = [];
  const resolve = (ref) =>
    ref.replace(/^#\//, "").split("/").reduce((node, key) => node[key], schema);
  const visit = (value, node, where) => {
    if (node.$ref) return visit(value, resolve(node.$ref), where);
    if ("const" in node && value !== node.const) {
      errors.push(`${where}: must be ${JSON.stringify(node.const)}`);
    }
    if (node.enum && !node.enum.includes(value)) {
      errors.push(`${where}: "${value}" is not one of ${node.enum.join(", ")}`);
    }
    if (node.type) {
      const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
      if (actual !== node.type) {
        errors.push(`${where}: expected ${node.type}, got ${actual}`);
        return;
      }
    }
    if (typeof value === "string") {
      if (node.minLength && value.length < node.minLength) errors.push(`${where}: must not be empty`);
      if (node.pattern && !new RegExp(node.pattern).test(value)) {
        errors.push(`${where}: "${value}" does not match ${node.pattern}`);
      }
    }
    if (Array.isArray(value) && node.items) {
      value.forEach((item, index) => visit(item, node.items, `${where}[${index}]`));
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const key of node.required ?? []) {
        if (!(key in value)) errors.push(`${where}: missing required "${key}"`);
      }
      for (const [key, child] of Object.entries(value)) {
        const rule = node.properties?.[key];
        if (rule) visit(child, rule, `${where}.${key}`);
        else if (node.additionalProperties === false) errors.push(`${where}: unexpected "${key}"`);
        else if (typeof node.additionalProperties === "object") {
          visit(child, node.additionalProperties, `${where}.${key}`);
        }
      }
    }
  };
  visit(data, schema, "$");
  return errors;
}

async function loadSchema(root) {
  const local = await readOptional(path.join(root, SCHEMA_PATH));
  return JSON.parse(local ?? (await readFile(BUNDLED_SCHEMA, "utf8")));
}

// ---------------------------------------------------------------- operations

export async function generate({ root, output = DEFAULT_OUTPUT, check = false }) {
  const projection = await buildProjection(root);
  const schemaErrors = validateSchema(projection, await loadSchema(root));
  if (schemaErrors.length) throw new ProjectionError(schemaErrors.map((e) => `schema: ${e}`));

  const expected = renderProjection(projection);
  const target = path.resolve(root, output);
  const current = await readOptional(target);

  if (check) {
    if (current === expected) return { status: "in-sync", output };
    return { status: "drift", output, diff: lineDiff(current ?? "", expected) };
  }
  if (current === expected) return { status: "unchanged", output };
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, expected);
  return { status: "written", output };
}

function lineDiff(current, expected, limit = 20) {
  const a = current.split("\n");
  const b = expected.split("\n");
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < limit; i += 1) {
    if (a[i] !== b[i]) {
      out.push(`line ${i + 1}: - ${a[i] ?? "(missing)"}`, `line ${i + 1}: + ${b[i] ?? "(missing)"}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- CLI

function usage() {
  return `Usage: node tools/project-projection/generate.mjs [options]

Deterministically builds ${DEFAULT_OUTPUT} from authoritative BC Markdown.

Options:
  --root <dir>    Project root (default: current directory)
  --out <file>    Output path relative to root (default: ${DEFAULT_OUTPUT})
  --check         Do not write; exit 1 if the file is missing, stale or invalid
  --help          Show this help
`;
}

function parseArguments(argv) {
  const options = { root: ".", output: DEFAULT_OUTPUT, check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    const value = argv[index + 1];
    if (!["--root", "--out"].includes(argument)) throw new Error(`unknown option: ${argument}`);
    if (value === undefined) throw new Error(`${argument} requires a value`);
    if (argument === "--root") options.root = value;
    else options.output = toPosix(value);
    index += 1;
  }
  return { options };
}

async function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}`);
    process.exitCode = EXIT_USAGE;
    return;
  }
  if (parsed.help) {
    process.stdout.write(usage());
    return;
  }
  try {
    const result = await generate(parsed.options);
    if (result.status === "drift") {
      process.stderr.write(
        `HGP001 ${result.output} is out of sync with its Markdown sources. Run: node tools/project-projection/generate.mjs\n${result.diff.join("\n")}\n`,
      );
      process.exitCode = EXIT_INVALID;
    } else {
      process.stdout.write(`${result.output}: ${result.status}\n`);
    }
  } catch (error) {
    if (error instanceof ProjectionError) {
      process.stderr.write(
        `HGP002 projection cannot be generated:\n${error.problems.map((p) => `  - ${p}`).join("\n")}\n`,
      );
      process.exitCode = EXIT_INVALID;
    } else {
      process.stderr.write(`HGP009 generator failure: ${error.message}\n`);
      process.exitCode = EXIT_USAGE;
    }
  }
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
