#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadTypeScript, parseTestCalls } from "../shared/ts-source.mjs";

export const EXIT_VALID = 0;
export const EXIT_INVALID = 1;
export const EXIT_DISCOVERY = 2;

const ID_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)+-[0-9]{3}$/;
const DEFAULT_SCENARIO_PATHS = [".github/skills"];
const DEFAULT_TEST_PATHS = ["."];
const DEFAULT_EXCLUDES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function collectFiles(root, inputPaths, excludes, predicate) {
  const files = new Set();

  async function visit(absolutePath) {
    const details = await stat(absolutePath);
    if (details.isFile()) {
      if (predicate(absolutePath)) {
        files.add(absolutePath);
      }
      return;
    }
    if (!details.isDirectory()) {
      return;
    }

    const entries = await readdir(absolutePath, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && excludes.has(entry.name)) {
        continue;
      }
      await visit(path.join(absolutePath, entry.name));
    }
  }

  for (const inputPath of inputPaths) {
    const absolutePath = path.resolve(root, inputPath);
    try {
      await visit(absolutePath);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  return [...files].sort(compareText);
}

function diagnostic(code, file, line, id, message) {
  return { code, file, line, id: id ?? null, message };
}

function parseScenarioFile(source, file) {
  const lines = source.split(/\r?\n/);
  const scenarios = [];
  const diagnostics = [];
  let inGherkin = false;
  let pendingTagLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const value = lines[index];
    const trimmed = value.trim();

    if (!inGherkin && /^```gherkin\s*$/i.test(trimmed)) {
      inGherkin = true;
      pendingTagLines = [];
      continue;
    }
    if (inGherkin && /^```\s*$/.test(trimmed)) {
      inGherkin = false;
      pendingTagLines = [];
      continue;
    }
    if (!inGherkin) {
      continue;
    }

    if (trimmed.startsWith("@")) {
      pendingTagLines.push({ value: trimmed, line: index + 1 });
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const scenarioMatch = /^(Scenario(?: Outline)?):\s*(.+?)\s*$/.exec(trimmed);
    if (!scenarioMatch) {
      pendingTagLines = [];
      continue;
    }

    const markers = [];
    for (const tagLine of pendingTagLines) {
      const markerPattern = /@scenario:([^\s@]*)/g;
      let markerMatch;
      while ((markerMatch = markerPattern.exec(tagLine.value)) !== null) {
        markers.push({
          id: markerMatch[1],
          line: tagLine.line,
        });
      }
    }

    const scenario = {
      id: null,
      kind: scenarioMatch[1],
      title: scenarioMatch[2],
      file,
      line: index + 1,
    };

    if (markers.length === 0) {
      diagnostics.push(
        diagnostic(
          "BDD001",
          file,
          scenario.line,
          null,
          `${scenario.kind} "${scenario.title}" has no @scenario:<ID> tag`,
        ),
      );
    } else if (markers.length > 1) {
      diagnostics.push(
        diagnostic(
          "BDD002",
          file,
          scenario.line,
          null,
          `${scenario.kind} "${scenario.title}" has multiple @scenario:<ID> tags`,
        ),
      );
    } else if (!ID_PATTERN.test(markers[0].id)) {
      diagnostics.push(
        diagnostic(
          "BDD003",
          file,
          markers[0].line,
          markers[0].id,
          `scenario ID "${markers[0].id}" must use uppercase segments and a three-digit suffix`,
        ),
      );
    } else {
      scenario.id = markers[0].id;
    }

    scenarios.push(scenario);
    pendingTagLines = [];
  }

  return { scenarios, diagnostics };
}

function parseJestTestFile(ts, source, file) {
  const references = [];
  const diagnostics = [];
  const warnings = [];

  for (const testCall of parseTestCalls(ts, source, file)) {
    const { active, line } = testCall;
    const titleResult = { value: testCall.title };
    const markerPattern = /\[BDD:([^\]]*)\]/g;
    const recognizedRanges = [];
    let markerMatch;

    while ((markerMatch = markerPattern.exec(titleResult.value)) !== null) {
      recognizedRanges.push([markerMatch.index, markerPattern.lastIndex]);
      const id = markerMatch[1];
      if (!ID_PATTERN.test(id)) {
        diagnostics.push(
          diagnostic(
            "BDD007",
            file,
            line,
            id,
            `test title contains malformed BDD reference "${markerMatch[0]}"`,
          ),
        );
        continue;
      }
      references.push({
        id,
        file,
        line,
        title: titleResult.value,
        active,
      });
      if (testCall.focused) {
        warnings.push(
          diagnostic(
            "BDD010",
            file,
            line,
            id,
            `test for "${id}" is focused with .only/fit/fdescribe; Jest skips sibling tests while it is focused`,
          ),
        );
      }
    }

    let markerStart = titleResult.value.indexOf("[BDD:");
    while (markerStart !== -1) {
      const recognized = recognizedRanges.some(
        ([start, end]) => markerStart >= start && markerStart < end,
      );
      if (!recognized) {
        diagnostics.push(
          diagnostic(
            "BDD007",
            file,
            line,
            null,
            'test title contains an unclosed "[BDD:" reference',
          ),
        );
      }
      markerStart = titleResult.value.indexOf("[BDD:", markerStart + 5);
    }
  }

  return { references, diagnostics, warnings };
}

function compareRecords(left, right) {
  return (
    compareText(left.code ?? "", right.code ?? "") ||
    compareText(left.file, right.file) ||
    left.line - right.line ||
    compareText(left.id ?? "", right.id ?? "") ||
    compareText(left.title ?? "", right.title ?? "")
  );
}

export async function verifyProject(options = {}) {
  const root = path.resolve(options.root ?? ".");
  const scenarioPaths = options.scenarioPaths ?? DEFAULT_SCENARIO_PATHS;
  const testPaths = options.testPaths ?? DEFAULT_TEST_PATHS;
  const excludes = new Set([...DEFAULT_EXCLUDES, ...(options.excludes ?? [])]);

  const scenarioFiles = await collectFiles(
    root,
    scenarioPaths,
    excludes,
    (filePath) =>
      path.basename(filePath) === "bdd-scenarios.md" ||
      (options.scenarioPaths !== undefined && filePath.endsWith(".md")),
  );
  const testFiles = await collectFiles(
    root,
    testPaths,
    excludes,
    (filePath) => /\.(?:spec|test)\.ts$/.test(filePath),
  );

  const scenarios = [];
  const testReferences = [];
  const diagnostics = [];
  const warnings = [];
  const ts = loadTypeScript(root);

  for (const absolutePath of scenarioFiles) {    const file = toPosixPath(path.relative(root, absolutePath));
    const parsed = parseScenarioFile(await readFile(absolutePath, "utf8"), file);
    scenarios.push(...parsed.scenarios);
    diagnostics.push(...parsed.diagnostics);
  }

  for (const absolutePath of testFiles) {
    const file = toPosixPath(path.relative(root, absolutePath));
    const parsed = parseJestTestFile(
      ts,
      await readFile(absolutePath, "utf8"),
      file,
    );
    testReferences.push(...parsed.references);
    diagnostics.push(...parsed.diagnostics);
    warnings.push(...parsed.warnings);
  }

  if (scenarioFiles.length === 0) {
    diagnostics.push(
      diagnostic(
        "BDD008",
        ".",
        1,
        null,
        "no BDD scenario specification files were discovered",
      ),
    );
  }

  const scenariosById = new Map();
  for (const scenario of scenarios) {
    if (!scenario.id) {
      continue;
    }
    const matches = scenariosById.get(scenario.id) ?? [];
    matches.push(scenario);
    scenariosById.set(scenario.id, matches);
  }

  for (const [id, matches] of scenariosById) {
    if (matches.length < 2) {
      continue;
    }
    for (const scenario of matches) {
      diagnostics.push(
        diagnostic(
          "BDD004",
          scenario.file,
          scenario.line,
          id,
          `scenario ID "${id}" is duplicated at ${matches
            .map(({ file, line }) => `${file}:${line}`)
            .join(", ")}`,
        ),
      );
    }
  }

  const activeReferencesById = new Map();
  for (const reference of testReferences) {
    if (!scenariosById.has(reference.id)) {
      diagnostics.push(
        diagnostic(
          "BDD006",
          reference.file,
          reference.line,
          reference.id,
          `test references unknown scenario ID "${reference.id}"`,
        ),
      );
    }
    if (reference.active) {
      const matches = activeReferencesById.get(reference.id) ?? [];
      matches.push(reference);
      activeReferencesById.set(reference.id, matches);
    }
  }

  for (const [id, matches] of scenariosById) {
    if (matches.length === 1 && !activeReferencesById.has(id)) {
      const scenario = matches[0];
      diagnostics.push(
        diagnostic(
          "BDD005",
          scenario.file,
          scenario.line,
          id,
          `scenario ID "${id}" has no active Jest test reference`,
        ),
      );
    }
  }

  scenarios.sort(compareRecords);
  testReferences.sort(compareRecords);
  diagnostics.sort(compareRecords);
  warnings.sort(compareRecords);

  const coveredScenarios = [...scenariosById].filter(
    ([id, matches]) => matches.length === 1 && activeReferencesById.has(id),
  ).length;
  const exitCode = diagnostics.some(({ code }) => code === "BDD008")
    ? EXIT_DISCOVERY
    : diagnostics.length > 0
      ? EXIT_INVALID
      : EXIT_VALID;

  return {
    schemaVersion: 1,
    exitCode,
    scenarios,
    testReferences,
    diagnostics,
    warnings,
    summary: {
      scenarioFiles: scenarioFiles.length,
      testFiles: testFiles.length,
      scenarios: scenarios.length,
      coveredScenarios,
      testReferences: testReferences.length,
      errors: diagnostics.length,
      warnings: warnings.length,
    },
  };
}

export function formatTextReport(report) {
  const lines = report.diagnostics.map(
    ({ code, file, line, message }) => `${code} ${file}:${line} ${message}`,
  );
  if (lines.length === 0) {
    lines.push("BDD000 traceability valid");
  }
  lines.push(
    ...report.warnings.map(
      ({ code, file, line, message }) =>
        `${code} ${file}:${line} warning: ${message}`,
    ),
  );
  const summary = report.summary;
  lines.push(
    [
      "Summary:",
      `${summary.scenarioFiles} scenario file(s),`,
      `${summary.testFiles} test file(s),`,
      `${summary.scenarios} scenario(s),`,
      `${summary.coveredScenarios} covered,`,
      `${summary.testReferences} test reference(s),`,
      `${summary.errors} error(s)${summary.warnings > 0 ? "," : ""}`,
      ...(summary.warnings > 0 ? [`${summary.warnings} warning(s)`] : []),
    ].join(" "),
  );
  return `${lines.join("\n")}\n`;
}

export function formatJsonReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function usage() {
  return `Usage: node tools/bdd-traceability/verify.mjs [options]

Options:
  --root <path>           Project root (default: current directory)
  --scenario-path <path> Scenario file or directory; repeatable
  --test-path <path>     Jest test file or directory; repeatable
  --exclude <name>       Directory name to exclude; repeatable
  --format <text|json>   Report format (default: text)
  --help                 Show this help
`;
}

function parseArguments(argumentsList) {
  const options = {};
  let format = "text";

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help") {
      return { help: true, options, format };
    }
    const value = argumentsList[index + 1];
    if (
      ["--root", "--scenario-path", "--test-path", "--exclude", "--format"].includes(
        argument,
      ) &&
      value === undefined
    ) {
      throw new Error(`${argument} requires a value`);
    }
    if (argument === "--root") {
      options.root = value;
    } else if (argument === "--scenario-path") {
      options.scenarioPaths ??= [];
      options.scenarioPaths.push(value);
    } else if (argument === "--test-path") {
      options.testPaths ??= [];
      options.testPaths.push(value);
    } else if (argument === "--exclude") {
      options.excludes ??= [];
      options.excludes.push(value);
    } else if (argument === "--format") {
      if (!["text", "json"].includes(value)) {
        throw new Error("--format must be text or json");
      }
      format = value;
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
    index += 1;
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
    const report = await verifyProject(parsed.options);
    process.stdout.write(
      parsed.format === "json"
        ? formatJsonReport(report)
        : formatTextReport(report),
    );
    process.exitCode = report.exitCode;
  } catch (error) {
    process.stderr.write(`BDD009 verifier failure: ${error.message}\n`);
    process.exitCode = EXIT_DISCOVERY;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
