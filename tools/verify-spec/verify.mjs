#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  extractClassNames,
  parseTable,
  splitSections,
  stripMarkup,
  toKebab,
} from "./markdown.mjs";

export const EXIT_VALID = 0;
export const EXIT_INVALID = 1;
export const EXIT_DISCOVERY = 2;

const DEFAULT_SKILLS_PATH = ".github/skills";
const DEFAULT_SRC_PATH = "src";
const ID_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)+-[0-9]{3}$/;
const PORT_DIRECTIONS = new Set(["INBOUND", "OUTBOUND", "BIDIRECTIONAL", "UNKNOWN"]);
const READY_LIFECYCLES = new Set(["REFINED", "SPEC_REVIEWED", "IMPLEMENTING"]);
const EMPTY_MARKERS = /^(?:none|n\/a|na|-|—|–|tbd)?$/i;
const NONE_MARKERS = /^(?:none|n\/a|na|-|—|–|no\b.*)$/i;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function diagnostic(code, file, line, message) {
  return { code, file, line, message };
}

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function listFiles(directory, predicate) {
  const found = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        return;
      }
      throw error;
    }
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git") {
          await visit(path.join(current, entry.name));
        }
      } else if (predicate(entry.name)) {
        found.push(path.join(current, entry.name));
      }
    }
  }
  await visit(directory);
  return found;
}

async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function discoverBoundedContexts(skillsRoot) {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const contexts = [];
  for (const entry of entries.sort((a, b) => compareText(a.name, b.name))) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = path.join(skillsRoot, entry.name);
    const hasBcArtifact =
      (await readOptional(path.join(dir, "domain-model.md"))) !== null ||
      (await readOptional(path.join(dir, "bdd-scenarios.md"))) !== null;
    if (hasBcArtifact) {
      contexts.push({ name: entry.name, dir });
    }
  }
  return contexts;
}

function aggregateNames(section) {
  const names = [];
  for (const [offset, raw] of section.lines.entries()) {
    const match = /^[-*]\s+(.*)$/.exec(raw);
    if (!match) {
      continue;
    }
    const name =
      /^\*\*`?([A-Z][A-Za-z0-9]*)`?\*\*/.exec(match[1])?.[1] ??
      /^`([A-Z][A-Za-z0-9]*)`/.exec(match[1])?.[1] ??
      /^([A-Z][A-Za-z0-9]*)(?=\s*(?:[:(—–-]|$))/.exec(match[1])?.[1];
    if (name) {
      names.push({ name, line: section.startLine + 1 + offset });
    }
  }
  return names;
}

function findSection(sections, pattern) {
  return sections.find((section) => pattern.test(section.title));
}

function missingSection(ctx, out, title) {
  out.push(diagnostic("VSP015", ctx.skill.file, 1, `SKILL.md has no "${title}" section`));
}

function checkAggregates(ctx, out) {
  const section = findSection(ctx.skill.sections, /^key aggregates\b/i);
  if (!section) {
    missingSection(ctx, out, "Key Aggregates");
    return;
  }
  if (!ctx.model) {
    return;
  }
  const classes = new Set(extractClassNames(ctx.model.source));
  for (const { name, line } of aggregateNames(section)) {
    if (!classes.has(name)) {
      out.push(
        diagnostic("VSP001", ctx.skill.file, line, `aggregate ${name} has no class in domain-model.md`),
      );
    }
  }
}

function checkEvents(ctx, out, readiness) {
  const section = findSection(ctx.skill.sections, /^domain events emitted\b/i);
  if (!section) {
    missingSection(ctx, out, "Domain Events Emitted");
    return;
  }
  const rows = parseTable(section)
    .rows.map((row) => ({
      name: stripMarkup(row.cells[0] ?? ""),
      payload: stripMarkup(row.cells[1] ?? ""),
      line: row.line,
    }))
    .filter((row) => row.name !== "" && !NONE_MARKERS.test(row.name));
  const treeFiles = new Set(
    [...ctx.skill.source.matchAll(/[\w.-]+\.event\.ts/g)].map((m) => m[0]),
  );
  for (const row of rows) {
    const expected = `${toKebab(row.name.replace(/Event$/, ""))}.event.ts`;
    const onDisk = ctx.sourceEventFiles.has(expected);
    if (!treeFiles.has(expected) && !onDisk) {
      out.push(
        diagnostic("VSP002", ctx.skill.file, row.line, `event ${row.name} has no ${expected} in the module tree or source`),
      );
    } else if (ctx.requireSource && !onDisk) {
      out.push(
        diagnostic("VSP002", ctx.skill.file, row.line, `event ${row.name}: ${expected} not found under ${ctx.srcPath}`),
      );
    }
    if (readiness && EMPTY_MARKERS.test(row.payload)) {
      out.push(diagnostic("VSP101", ctx.skill.file, row.line, `event ${row.name} has no payload defined`));
    }
  }
}

function checkAcls(ctx, out, readiness) {
  const section = findSection(ctx.skill.sections, /^external integrations?\b/i);
  if (!section) {
    missingSection(ctx, out, "External Integrations");
    return;
  }
  const entries = parseTable(section).rows.map((row) => ({
    text: row.cells.join(" "),
    line: row.line,
  }));
  for (const [offset, raw] of section.lines.entries()) {
    if (/^[-*]\s+\S/.test(raw)) {
      entries.push({ text: raw, line: section.startLine + 1 + offset });
    }
  }
  const referenced = new Set();
  for (const entry of entries) {
    const files = [...entry.text.matchAll(/[\w.-]*-acl\.md/g)].map((m) => m[0]);
    if (files.length === 0) {
      if (!NONE_MARKERS.test(stripMarkup(entry.text.replace(/^[-*]\s+/, "")))) {
        out.push(
          diagnostic("VSP004", ctx.skill.file, entry.line, "external integration entry does not name its *-acl.md file"),
        );
      }
      continue;
    }
    for (const file of files) {
      referenced.add(file);
      if (!ctx.aclFiles.has(file)) {
        out.push(diagnostic("VSP003", ctx.skill.file, entry.line, `${file} does not exist in the BC directory`));
      }
    }
  }
  if (readiness) {
    for (const file of referenced) {
      const acl = ctx.aclSources.get(file);
      if (acl && !/^#{1,6}\s+port interface\b/im.test(acl)) {
        out.push(diagnostic("VSP103", `${ctx.rel}/${file}`, 1, 'ACL has no "Port Interface" section'));
      }
    }
  }
}

function checkPorts(ctx, out, readiness) {
  if (!ctx.model) {
    return;
  }
  const section = findSection(ctx.model.sections, /^ports\b/i);
  if (!section) {
    out.push(diagnostic("VSP010", ctx.model.file, 1, 'domain-model.md has no "Ports" section'));
    return;
  }
  const table = parseTable(section);
  const indexes = ["name", "direction", "purpose", "contract"].map((column) =>
    table.header.findIndex((h) => stripMarkup(h).toLowerCase() === column),
  );
  if (!table.found || indexes.some((i) => i < 0)) {
    out.push(
      diagnostic(
        "VSP010",
        ctx.model.file,
        table.found ? table.headerLine : section.startLine,
        "Ports section needs a table with Name | Direction | Purpose | Contract columns",
      ),
    );
    return;
  }
  const seen = new Set();
  for (const row of table.rows) {
    const [name, direction, purpose, contract] = indexes.map((i) => stripMarkup(row.cells[i] ?? ""));
    if (name === "" || NONE_MARKERS.test(name)) {
      continue;
    }
    if (seen.has(name)) {
      out.push(diagnostic("VSP013", ctx.model.file, row.line, `port ${name} is listed more than once`));
    }
    seen.add(name);
    for (const [label, value] of [["Direction", direction], ["Purpose", purpose], ["Contract", contract]]) {
      if (value === "") {
        out.push(diagnostic("VSP011", ctx.model.file, row.line, `port ${name} has an empty ${label}`));
      }
    }
    if (direction !== "" && !PORT_DIRECTIONS.has(direction)) {
      out.push(
        diagnostic("VSP012", ctx.model.file, row.line, `port ${name} direction "${direction}" must be INBOUND, OUTBOUND, BIDIRECTIONAL or UNKNOWN`),
      );
    }
    if (readiness && /^tbd\b/i.test(contract)) {
      out.push(diagnostic("VSP102", ctx.model.file, row.line, `port ${name} contract is TBD`));
    }
  }
}

function antiTerms(skill) {
  const section = findSection(skill.sections, /^ubiquitous language\b/i);
  if (!section) {
    return null;
  }
  const table = parseTable(section);
  const notIndex = table.header.findIndex((h) => /^not\b/i.test(stripMarkup(h)));
  const terms = new Set();
  if (notIndex >= 0) {
    for (const row of table.rows) {
      for (const part of (row.cells[notIndex] ?? "").split(/[,;]/)) {
        const term = stripMarkup(part).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
        if (term.length > 1 && !NONE_MARKERS.test(term)) {
          terms.add(term);
        }
      }
    }
  }
  return terms;
}

function parseScenarios(source, file) {
  const out = [];
  const scenarios = [];
  let inGherkin = false;
  let pending = [];
  for (const [index, value] of source.split(/\r?\n/).entries()) {
    const trimmed = value.trim();
    if (!inGherkin && /^```gherkin\s*$/i.test(trimmed)) {
      inGherkin = true;
      pending = [];
      continue;
    }
    if (inGherkin && /^```\s*$/.test(trimmed)) {
      inGherkin = false;
      continue;
    }
    if (!inGherkin) {
      continue;
    }
    if (trimmed.startsWith("@")) {
      pending.push({ value: trimmed, line: index + 1 });
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const match = /^(Scenario(?: Outline)?):\s*(.+?)\s*$/.exec(trimmed);
    if (!match) {
      pending = [];
      continue;
    }
    const ids = pending.flatMap((tag) =>
      [...tag.value.matchAll(/@scenario:([^\s@]*)/g)].map((m) => ({ id: m[1], line: tag.line })),
    );
    pending = [];
    const line = index + 1;
    if (ids.length === 0) {
      out.push(diagnostic("VSP006", file, line, `"${match[2]}" has no @scenario:<ID> tag`));
    } else if (ids.length > 1) {
      out.push(diagnostic("VSP007", file, line, `"${match[2]}" has multiple @scenario:<ID> tags`));
    } else if (!ID_PATTERN.test(ids[0].id)) {
      out.push(diagnostic("VSP008", file, ids[0].line, `scenario ID "${ids[0].id}" must look like BC-CAPABILITY-001`));
    } else {
      scenarios.push({ id: ids[0].id, line: ids[0].line, file });
    }
  }
  return { scenarios, diagnostics: out };
}

function checkGlossary(ctx, out) {
  if (!ctx.bdd) {
    return;
  }
  const terms = antiTerms(ctx.skill);
  if (!terms || terms.size === 0) {
    return;
  }
  let inGherkin = false;
  for (const [index, value] of ctx.bdd.source.split(/\r?\n/).entries()) {
    const trimmed = value.trim();
    if (/^```gherkin\s*$/i.test(trimmed)) {
      inGherkin = true;
      continue;
    }
    if (/^```\s*$/.test(trimmed)) {
      inGherkin = false;
      continue;
    }
    if (!inGherkin || trimmed.startsWith("#") || trimmed.startsWith("@")) {
      continue;
    }
    for (const term of terms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i").test(trimmed)) {
        out.push(
          diagnostic("VSP005", ctx.bdd.file, index + 1, `uses anti-term "${term}" from the SKILL.md glossary; use the ubiquitous term`),
        );
      }
    }
  }
}

function checkReadiness(ctx, out) {
  const statusFile = `${ctx.rel}/status.md`;
  if (ctx.status === null) {
    out.push(diagnostic("VSP106", statusFile, 1, "status.md is missing"));
  } else {
    const match = /^lifecycle:\s*(\S+)/im.exec(ctx.status);
    const lifecycle = match?.[1].replace(/[`"']/g, "");
    if (!lifecycle || !READY_LIFECYCLES.has(lifecycle)) {
      const line = match ? ctx.status.slice(0, match.index).split("\n").length : 1;
      out.push(
        diagnostic("VSP106", statusFile, line, `lifecycle ${lifecycle ?? "(missing)"} is not REFINED or SPEC_REVIEWED`),
      );
    }
  }
  if (ctx.model) {
    const section = findSection(ctx.model.sections, /^sequelize models?\b/i);
    if (!section) {
      out.push(diagnostic("VSP105", ctx.model.file, 1, "no Sequelize Models section declaring persistence placement"));
    } else if (!/\b(?:tenant|public)\b/i.test(section.lines.join("\n"))) {
      out.push(
        diagnostic("VSP105", ctx.model.file, section.startLine, "Sequelize Models section does not state tenant vs public schema"),
      );
    }
  }
  for (const doc of [ctx.skill, ctx.model, ...ctx.aclDocs].filter(Boolean)) {
    for (const [index, value] of doc.source.split(/\r?\n/).entries()) {
      if (/\[OPEN\]/.test(value)) {
        out.push(diagnostic("VSP104", doc.file, index + 1, "unresolved [OPEN] question blocks implementation"));
      }
    }
  }
}

export async function verifySpec(options = {}) {
  const root = path.resolve(options.root ?? ".");
  const skillsPath = options.skillsPath ?? DEFAULT_SKILLS_PATH;
  const srcPath = options.srcPath ?? DEFAULT_SRC_PATH;
  const phase = options.phase ?? "refinement";
  if (!["refinement", "implementation"].includes(phase)) {
    throw new Error("--phase must be refinement or implementation");
  }
  const skillsRoot = path.resolve(root, skillsPath);
  if (!(await isDirectory(skillsRoot))) {
    throw new Error(`skills directory not found: ${skillsPath}`);
  }
  const only = options.bcs ?? [];
  const contexts = await discoverBoundedContexts(skillsRoot);
  for (const name of only) {
    if (!contexts.some((c) => c.name === name)) {
      throw new Error(`bounded context not found: ${name}`);
    }
  }
  const selected = contexts.filter((c) => only.length === 0 || only.includes(c.name));

  const eventFiles = new Set(
    (await listFiles(path.resolve(root, srcPath), (n) => n.endsWith(".event.ts"))).map((f) =>
      path.basename(f),
    ),
  );
  const rel = (file) => path.relative(root, file).split(path.sep).join("/");
  const readiness = phase === "implementation";
  const diagnostics = [];

  // Scenario IDs are unique across every BC, even when only one is selected.
  const selectedFiles = new Set(selected.map((c) => rel(path.join(c.dir, "bdd-scenarios.md"))));
  const idOwners = new Map();
  for (const context of contexts) {
    const file = path.join(context.dir, "bdd-scenarios.md");
    const source = await readOptional(file);
    if (source === null) {
      continue;
    }
    const parsed = parseScenarios(source, rel(file));
    if (selectedFiles.has(rel(file))) {
      diagnostics.push(...parsed.diagnostics);
    }
    for (const scenario of parsed.scenarios) {
      const owners = idOwners.get(scenario.id) ?? [];
      owners.push(scenario);
      idOwners.set(scenario.id, owners);
    }
  }
  for (const [id, owners] of idOwners) {
    for (const owner of owners.slice(1)) {
      if (selectedFiles.has(owner.file)) {
        diagnostics.push(
          diagnostic("VSP009", owner.file, owner.line, `duplicate scenario ID ${id} (first used at ${owners[0].file}:${owners[0].line})`),
        );
      }
    }
  }

  for (const context of selected) {
    const load = async (name) => {
      const file = path.join(context.dir, name);
      const source = await readOptional(file);
      return source === null ? null : { file: rel(file), source, sections: splitSections(source) };
    };
    const skill = await load("SKILL.md");
    const model = await load("domain-model.md");
    const bdd = await load("bdd-scenarios.md");
    const bcRel = rel(context.dir);
    for (const [doc, name] of [[skill, "SKILL.md"], [model, "domain-model.md"], [bdd, "bdd-scenarios.md"]]) {
      if (!doc) {
        diagnostics.push(diagnostic("VSP014", `${bcRel}/${name}`, 1, `required file ${name} is missing`));
      }
    }
    if (!skill) {
      continue;
    }
    const aclFiles = new Set();
    const aclSources = new Map();
    const aclDocs = [];
    for (const entry of (await readdir(context.dir)).sort()) {
      if (entry.endsWith("-acl.md")) {
        const loaded = await load(entry);
        aclFiles.add(entry);
        aclSources.set(entry, loaded.source);
        aclDocs.push(loaded);
      }
    }
    const ctx = {
      rel: bcRel,
      skill,
      model,
      bdd,
      aclFiles,
      aclSources,
      aclDocs,
      status: await readOptional(path.join(context.dir, "status.md")),
      sourceEventFiles: eventFiles,
      requireSource: options.requireSource === true,
      srcPath,
    };
    checkAggregates(ctx, diagnostics);
    checkEvents(ctx, diagnostics, readiness);
    checkAcls(ctx, diagnostics, readiness);
    checkPorts(ctx, diagnostics, readiness);
    checkGlossary(ctx, diagnostics);
    if (readiness) {
      checkReadiness(ctx, diagnostics);
    }
  }

  diagnostics.sort(
    (a, b) =>
      compareText(a.file, b.file) || a.line - b.line || compareText(a.code, b.code) || compareText(a.message, b.message),
  );
  return {
    phase,
    checked: selected.map((c) => c.name),
    diagnostics,
    exitCode: diagnostics.length > 0 ? EXIT_INVALID : EXIT_VALID,
  };
}

export function formatTextReport(report) {
  if (report.diagnostics.length === 0) {
    return `verify-spec OK (${report.phase}): ${report.checked.length} BC(s)\n`;
  }
  const lines = report.diagnostics.map((d) => `${d.code} ${d.file}:${d.line} ${d.message}`);
  lines.push(`verify-spec FAILED (${report.phase}): ${report.diagnostics.length} issue(s)`);
  return `${lines.join("\n")}\n`;
}

export function formatJsonReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function usage() {
  return `Usage: node tools/verify-spec/verify.mjs [options]

Options:
  --root <path>          Project root (default: current directory)
  --skills-path <path>   BC skills directory (default: ${DEFAULT_SKILLS_PATH})
  --src-path <path>      Source tree searched for *.event.ts (default: ${DEFAULT_SRC_PATH})
  --bc <name>            Only check this bounded context; repeatable
  --phase <name>         refinement (default) or implementation (adds readiness checks)
  --require-source       Event files must exist under --src-path, not just in the module tree
  --format <text|json>   Report format (default: text)
  --help                 Show this help
`;
}

function parseArguments(args) {
  const options = {};
  let format = "text";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help") {
      return { help: true, options, format };
    }
    if (arg === "--require-source") {
      options.requireSource = true;
      continue;
    }
    const value = args[i + 1];
    if (!["--root", "--skills-path", "--src-path", "--bc", "--phase", "--format"].includes(arg)) {
      throw new Error(`unknown option: ${arg}`);
    }
    if (value === undefined) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--root") options.root = value;
    else if (arg === "--skills-path") options.skillsPath = value;
    else if (arg === "--src-path") options.srcPath = value;
    else if (arg === "--phase") options.phase = value;
    else if (arg === "--bc") (options.bcs ??= []).push(value);
    else {
      if (!["text", "json"].includes(value)) {
        throw new Error("--format must be text or json");
      }
      format = value;
    }
    i += 1;
  }
  return { help: false, options, format };
}

async function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}`);
    process.exitCode = EXIT_DISCOVERY;
    return;
  }
  if (parsed.help) {
    process.stdout.write(usage());
    return;
  }
  try {
    const report = await verifySpec(parsed.options);
    process.stdout.write(parsed.format === "json" ? formatJsonReport(report) : formatTextReport(report));
    process.exitCode = report.exitCode;
  } catch (error) {
    process.stderr.write(`VSP900 verifier failure: ${error.message}\n`);
    process.exitCode = EXIT_DISCOVERY;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
