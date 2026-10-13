#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const EXIT_VALID = 0;
export const EXIT_INVALID = 1;
export const EXIT_DISCOVERY = 2;

const ID_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)+-[0-9]{3}$/;
const DEFAULT_PROPERTY_PATHS = [".github/skills"];
const DEFAULT_TEST_PATHS = ["."];
const DEFAULT_EXCLUDES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);
const REQUIRED_FIELDS = [
  "Claim",
  "Quantification",
  "Preconditions",
  "Oracle",
  "Technique",
  "Generator",
  "Bounds",
];
const TECHNIQUES = new Set(["PROPERTY", "FINITE_MODEL"]);
const ADEQUACY_FIELDS = [
  "Domain partitions",
  "Boundary values",
  "Cross-field combinations",
  "Min runs",
  "Max discard ratio",
  "Shrinking",
  "Invalid-input generator",
  "Coverage evidence",
];
const ADEQUACY_OPTIONAL_FIELDS = [
  "Min runs rationale",
  "Max discard ratio rationale",
];
const MIN_RUNS_FLOOR = 100;
const DISCARD_RATIO_REASONED_ABOVE = 20;
const DISCARD_RATIO_HARD_LIMIT = 50;
const MIN_PARTITIONS = 3;

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function lineNumberAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }
  return line;
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

function normalizeMetadataValue(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    trimmed.startsWith("`") &&
    trimmed.endsWith("`")
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parsePropertyFile(source, file) {
  const lines = source.split(/\r?\n/);
  const properties = [];
  const diagnostics = [];

  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^##\s+(.+?)\s*$/.exec(lines[index].trim());
    if (!heading) {
      continue;
    }

    const headingText = heading[1];
    const markers = [
      ...headingText.matchAll(/@property:([^\s@]*)/g),
    ].map((match) => match[1]);
    const property = {
      id: null,
      title: headingText.replace(/@property:[^\s@]*/g, "").trim(),
      file,
      line: index + 1,
      technique: null,
      fields: {},
    };

    if (markers.length === 0) {
      diagnostics.push(
        diagnostic(
          "PROP001",
          file,
          property.line,
          null,
          `property heading "${headingText}" has no @property:<ID> marker`,
        ),
      );
    } else if (markers.length > 1) {
      diagnostics.push(
        diagnostic(
          "PROP002",
          file,
          property.line,
          null,
          `property heading "${headingText}" has multiple @property:<ID> markers`,
        ),
      );
    } else if (!ID_PATTERN.test(markers[0])) {
      diagnostics.push(
        diagnostic(
          "PROP003",
          file,
          property.line,
          markers[0],
          `property ID "${markers[0]}" must use uppercase segments and a three-digit suffix`,
        ),
      );
    } else {
      property.id = markers[0];
    }

    let cursor = index + 1;
    while (cursor < lines.length && !/^##\s+/.test(lines[cursor].trim())) {
      const fieldMatch =
        /^-\s+\*\*([^*]+):\*\*\s*(.*?)\s*$/.exec(lines[cursor].trim());
      if (fieldMatch) {
        const field = fieldMatch[1];
        if (Object.hasOwn(property.fields, field)) {
          diagnostics.push(
            diagnostic(
              "PROP004",
              file,
              cursor + 1,
              property.id,
              `property declaration repeats field "${field}"`,
            ),
          );
        }
        property.fields[field] = normalizeMetadataValue(fieldMatch[2]);
      }
      cursor += 1;
    }

    if (!property.title) {
      diagnostics.push(
        diagnostic(
          "PROP004",
          file,
          property.line,
          property.id,
          "property declaration must have a human-readable title",
        ),
      );
    }

    const missingFields = REQUIRED_FIELDS.filter(
      (field) => !property.fields[field],
    );
    if (missingFields.length > 0) {
      diagnostics.push(
        diagnostic(
          "PROP004",
          file,
          property.line,
          property.id,
          `property declaration is missing required field(s): ${missingFields.join(", ")}`,
        ),
      );
    } else {
      property.technique = property.fields.Technique;
      if (!TECHNIQUES.has(property.technique)) {
        diagnostics.push(
          diagnostic(
            "PROP004",
            file,
            property.line,
            property.id,
            `Technique must be PROPERTY or FINITE_MODEL, received "${property.technique}"`,
          ),
        );
      }
      if (
        property.technique === "PROPERTY" &&
        property.fields.Generator.toUpperCase() === "N/A"
      ) {
        diagnostics.push(
          diagnostic(
            "PROP004",
            file,
            property.line,
            property.id,
            "PROPERTY declarations must name a generator contract",
          ),
        );
      }
      if (
        property.technique === "PROPERTY" &&
        property.fields.Bounds.toUpperCase() !== "N/A"
      ) {
        diagnostics.push(
          diagnostic(
            "PROP004",
            file,
            property.line,
            property.id,
            "PROPERTY declarations must use Bounds: N/A",
          ),
        );
      }
      if (
        property.technique === "FINITE_MODEL" &&
        property.fields.Bounds.toUpperCase() === "N/A"
      ) {
        diagnostics.push(
          diagnostic(
            "PROP004",
            file,
            property.line,
            property.id,
            "FINITE_MODEL declarations must state explicit completeness bounds",
          ),
        );
      }
      if (
        property.technique === "FINITE_MODEL" &&
        property.fields.Generator.toUpperCase() !== "N/A"
      ) {
        diagnostics.push(
          diagnostic(
            "PROP004",
            file,
            property.line,
            property.id,
            "FINITE_MODEL declarations must use Generator: N/A",
          ),
        );
      }
    }

    diagnostics.push(...validateAdequacy(property, file));
    properties.push(property);
    index = cursor - 1;
  }

  return { properties, diagnostics };
}

function isNotApplicable(value) {
  return /^`?N\/A`?$/i.test((value ?? "").trim());
}

function hasRationale(value) {
  return Boolean(value) && !isNotApplicable(value);
}

function parseAdequacy(fields) {
  const problems = [];
  const partitions = [];

  const partitionText = fields["Domain partitions"] ?? "";
  for (const item of partitionText.split(";").map((part) => part.trim())) {
    const match =
      /^([A-Za-z0-9_-]+):\s*(\d+(?:\.\d+)?)%\s*-\s*(\S.*)$/.exec(item);
    if (!match) {
      problems.push(
        `Domain partitions entry "${item}" must be "<label>:<share>% - <why it matters>"`,
      );
      continue;
    }
    partitions.push({ label: match[1], share: Number(match[2]) });
  }
  if (partitions.length > 0 || problems.length === 0) {
    const total = partitions.reduce((sum, { share }) => sum + share, 0);
    if (partitions.length < MIN_PARTITIONS) {
      problems.push(
        `Domain partitions must declare at least ${MIN_PARTITIONS} partitions`,
      );
    }
    if (Math.abs(total - 100) > 0.001) {
      problems.push(`Domain partitions shares must sum to 100%, received ${total}%`);
    }
    if (new Set(partitions.map(({ label }) => label)).size !== partitions.length) {
      problems.push("Domain partitions labels must be unique");
    }
  }

  const boundaryText = fields["Boundary values"] ?? "";
  const boundaryEntries = boundaryText
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (
    boundaryEntries.length === 0 ||
    !boundaryEntries.every((entry) =>
      /^[A-Za-z0-9_.-]+\s*=\s*\[[^\],]+(?:,[^\],]+)+\]$/.test(entry),
    )
  ) {
    problems.push(
      "Boundary values must list at least two values per constrained field as field=[a, b, ...]",
    );
  }

  const combinations = fields["Cross-field combinations"] ?? "";
  if (!combinations || (isNotApplicable(combinations))) {
    problems.push(
      'Cross-field combinations must name reachable combinations or "N/A: <reason>"',
    );
  }

  const minRuns = /^\d+$/.test(fields["Min runs"] ?? "")
    ? Number(fields["Min runs"])
    : null;
  if (minRuns === null || minRuns < 1) {
    problems.push("Min runs must be a positive integer");
  }

  const discardMatch = /^(\d+(?:\.\d+)?)%$/.exec(fields["Max discard ratio"] ?? "");
  const discard = discardMatch ? Number(discardMatch[1]) : null;
  if (discard === null) {
    problems.push('Max discard ratio must be a percentage such as "10%"');
  } else if (discard > DISCARD_RATIO_HARD_LIMIT) {
    problems.push(
      `Max discard ratio must not exceed ${DISCARD_RATIO_HARD_LIMIT}%; build valid values by construction`,
    );
  }

  const invalid = fields["Invalid-input generator"] ?? "";
  if (!invalid || (isNotApplicable(invalid))) {
    problems.push(
      'Invalid-input generator must name a separate generator and expected rejection, or "N/A: <reason>"',
    );
  }

  for (const field of ["Shrinking", "Coverage evidence"]) {
    if (!fields[field] || isNotApplicable(fields[field])) {
      problems.push(`${field} must be described, not N/A`);
    }
  }

  const policy = [];
  if (
    minRuns !== null &&
    minRuns < MIN_RUNS_FLOOR &&
    !hasRationale(fields["Min runs rationale"])
  ) {
    policy.push(
      `Min runs ${minRuns} is below ${MIN_RUNS_FLOOR}; add a Min runs rationale tied to input complexity`,
    );
  }
  if (
    discard !== null &&
    discard > DISCARD_RATIO_REASONED_ABOVE &&
    discard <= DISCARD_RATIO_HARD_LIMIT &&
    !hasRationale(fields["Max discard ratio rationale"])
  ) {
    policy.push(
      `Max discard ratio ${discard}% exceeds ${DISCARD_RATIO_REASONED_ABOVE}%; add a Max discard ratio rationale`,
    );
  }

  return { problems, policy, partitions, minRuns };
}

function validateAdequacy(property, file) {
  const result = [];
  const { fields } = property;
  const present = [...ADEQUACY_FIELDS, ...ADEQUACY_OPTIONAL_FIELDS].filter(
    (field) => Object.hasOwn(fields, field),
  );

  if (property.technique === "FINITE_MODEL") {
    for (const field of present.filter((name) => !isNotApplicable(fields[name]))) {
      result.push(
        diagnostic(
          "PROP030",
          file,
          property.line,
          property.id,
          `FINITE_MODEL declarations must not set generator adequacy field "${field}" (use N/A)`,
        ),
      );
    }
    return result;
  }
  if (property.technique !== "PROPERTY") {
    return result;
  }

  const missing = ADEQUACY_FIELDS.filter((field) => !fields[field]);
  if (missing.length > 0) {
    result.push(
      diagnostic(
        "PROP030",
        file,
        property.line,
        property.id,
        `PROPERTY declaration is missing generator adequacy field(s): ${missing.join(", ")}`,
      ),
    );
    return result;
  }

  const adequacy = parseAdequacy(fields);
  for (const problem of adequacy.problems) {
    result.push(diagnostic("PROP030", file, property.line, property.id, problem));
  }
  for (const problem of adequacy.policy) {
    result.push(diagnostic("PROP031", file, property.line, property.id, problem));
  }
  property.adequacy = {
    partitions: adequacy.partitions.map(({ label }) => label),
    minRuns: adequacy.minRuns,
  };
  return result;
}

function isIdentifierCharacter(value) {
  return value !== undefined && /[A-Za-z0-9_$]/.test(value);
}

function skipWhitespaceAndComments(source, initialIndex) {
  let index = initialIndex;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
      continue;
    }
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      return newline === -1
        ? source.length
        : skipWhitespaceAndComments(source, newline + 1);
    }
    if (source.startsWith("/*", index)) {
      const close = source.indexOf("*/", index + 2);
      return close === -1
        ? source.length
        : skipWhitespaceAndComments(source, close + 2);
    }
    break;
  }
  return index;
}

function skipBalanced(source, initialIndex, open, close) {
  let depth = 0;
  let index = initialIndex;
  while (index < source.length) {
    const value = source[index];
    if (value === "'" || value === '"' || value === "`") {
      index = readStaticString(source, index).end;
      continue;
    }
    if (source.startsWith("//", index) || source.startsWith("/*", index)) {
      index = skipWhitespaceAndComments(source, index);
      continue;
    }
    if (value === open) {
      depth += 1;
    } else if (value === close) {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
    index += 1;
  }
  return source.length;
}

function readStaticString(source, initialIndex) {
  const quote = source[initialIndex];
  let value = "";
  let dynamic = false;
  let index = initialIndex + 1;

  while (index < source.length) {
    const character = source[index];
    if (character === "\\") {
      if (index + 1 < source.length) {
        value += source[index + 1];
        index += 2;
        continue;
      }
    }
    if (quote === "`" && character === "$" && source[index + 1] === "{") {
      dynamic = true;
    }
    if (character === quote) {
      return { value, dynamic, end: index + 1 };
    }
    value += character;
    index += 1;
  }

  return { value, dynamic: true, end: source.length };
}

function parseJestTestFile(source, file) {
  const references = [];
  const diagnostics = [];
  let index = 0;

  while (index < source.length) {
    if (source.startsWith("//", index) || source.startsWith("/*", index)) {
      index = skipWhitespaceAndComments(source, index);
      continue;
    }
    if (source[index] === "'" || source[index] === '"' || source[index] === "`") {
      index = readStaticString(source, index).end;
      continue;
    }

    const isTest =
      source.startsWith("test", index) &&
      !isIdentifierCharacter(source[index - 1]) &&
      source[index - 1] !== "." &&
      !isIdentifierCharacter(source[index + 4]);
    const isIt =
      source.startsWith("it", index) &&
      !isIdentifierCharacter(source[index - 1]) &&
      source[index - 1] !== "." &&
      !isIdentifierCharacter(source[index + 2]);
    if (!isTest && !isIt) {
      index += 1;
      continue;
    }

    const callOffset = index;
    const modifiers = [];
    let cursor = index + (isTest ? 4 : 2);
    cursor = skipWhitespaceAndComments(source, cursor);

    while (source[cursor] === ".") {
      cursor += 1;
      const modifierMatch = /^[A-Za-z]+/.exec(source.slice(cursor));
      if (!modifierMatch) {
        break;
      }
      const modifier = modifierMatch[0];
      modifiers.push(modifier);
      cursor += modifier.length;
      cursor = skipWhitespaceAndComments(source, cursor);
      if (modifier === "each") {
        if (source[cursor] === "<") {
          cursor = skipBalanced(source, cursor, "<", ">");
          cursor = skipWhitespaceAndComments(source, cursor);
        }
        if (source[cursor] === "(") {
          cursor = skipBalanced(source, cursor, "(", ")");
          cursor = skipWhitespaceAndComments(source, cursor);
        } else if (source[cursor] === "`") {
          cursor = readStaticString(source, cursor).end;
          cursor = skipWhitespaceAndComments(source, cursor);
        }
      }
    }

    if (source[cursor] !== "(") {
      index = cursor + 1;
      continue;
    }
    cursor = skipWhitespaceAndComments(source, cursor + 1);
    if (!["'", '"', "`"].includes(source[cursor])) {
      index = cursor + 1;
      continue;
    }

    const titleResult = readStaticString(source, cursor);
    index = titleResult.end;
    if (titleResult.dynamic) {
      continue;
    }

    const active = !modifiers.some((modifier) =>
      ["skip", "todo"].includes(modifier),
    );
    const line = lineNumberAt(source, callOffset);
    const markerPattern = /\[PROP:([^\]]*)\]/g;
    const recognizedRanges = [];
    let markerMatch;

    while ((markerMatch = markerPattern.exec(titleResult.value)) !== null) {
      recognizedRanges.push([markerMatch.index, markerPattern.lastIndex]);
      const id = markerMatch[1];
      if (!ID_PATTERN.test(id)) {
        diagnostics.push(
          diagnostic(
            "PROP008",
            file,
            line,
            id,
            `test title contains malformed property reference "${markerMatch[0]}"`,
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
    }

    let markerStart = titleResult.value.indexOf("[PROP:");
    while (markerStart !== -1) {
      const recognized = recognizedRanges.some(
        ([start, end]) => markerStart >= start && markerStart < end,
      );
      if (!recognized) {
        diagnostics.push(
          diagnostic(
            "PROP008",
            file,
            line,
            null,
            'test title contains an unclosed "[PROP:" reference',
          ),
        );
      }
      markerStart = titleResult.value.indexOf("[PROP:", markerStart + 6);
    }
  }

  return { references, diagnostics };
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
  const propertyPaths = options.propertyPaths ?? DEFAULT_PROPERTY_PATHS;
  const testPaths = options.testPaths ?? DEFAULT_TEST_PATHS;
  const excludes = new Set([...DEFAULT_EXCLUDES, ...(options.excludes ?? [])]);

  const propertyFiles = await collectFiles(
    root,
    propertyPaths,
    excludes,
    (filePath) =>
      path.basename(filePath) === "properties.md" ||
      (options.propertyPaths !== undefined && filePath.endsWith(".md")),
  );
  const testFiles = await collectFiles(
    root,
    testPaths,
    excludes,
    (filePath) => /\.(?:spec|test)\.ts$/.test(filePath),
  );

  const properties = [];
  const testReferences = [];
  const testSources = new Map();
  const diagnostics = [];

  for (const absolutePath of propertyFiles) {
    const file = toPosixPath(path.relative(root, absolutePath));
    const parsed = parsePropertyFile(await readFile(absolutePath, "utf8"), file);
    properties.push(...parsed.properties);
    diagnostics.push(...parsed.diagnostics);
    if (parsed.properties.length === 0) {
      diagnostics.push(
        diagnostic(
          "PROP004",
          file,
          1,
          null,
          "property specification contains no property declarations",
        ),
      );
    }
  }

  for (const absolutePath of testFiles) {
    const file = toPosixPath(path.relative(root, absolutePath));
    const source = await readFile(absolutePath, "utf8");
    const parsed = parseJestTestFile(source, file);
    testReferences.push(...parsed.references);
    diagnostics.push(...parsed.diagnostics);
    testSources.set(file, source);
  }

  if (propertyFiles.length === 0) {
    diagnostics.push(
      diagnostic(
        "PROP009",
        ".",
        1,
        null,
        "no business-property specification files were discovered",
      ),
    );
  }

  const propertiesById = new Map();
  for (const property of properties) {
    if (!property.id) {
      continue;
    }
    const matches = propertiesById.get(property.id) ?? [];
    matches.push(property);
    propertiesById.set(property.id, matches);
  }

  for (const [id, matches] of propertiesById) {
    if (matches.length < 2) {
      continue;
    }
    for (const property of matches) {
      diagnostics.push(
        diagnostic(
          "PROP005",
          property.file,
          property.line,
          id,
          `property ID "${id}" is duplicated at ${matches
            .map(({ file, line }) => `${file}:${line}`)
            .join(", ")}`,
        ),
      );
    }
  }

  const activeReferencesById = new Map();
  for (const reference of testReferences) {
    if (!propertiesById.has(reference.id)) {
      diagnostics.push(
        diagnostic(
          "PROP007",
          reference.file,
          reference.line,
          reference.id,
          `test references unknown property ID "${reference.id}"`,
        ),
      );
    }
    if (reference.active) {
      const matches = activeReferencesById.get(reference.id) ?? [];
      matches.push(reference);
      activeReferencesById.set(reference.id, matches);
    }
  }

  for (const [id, matches] of propertiesById) {
    if (matches.length === 1 && !activeReferencesById.has(id)) {
      const property = matches[0];
      diagnostics.push(
        diagnostic(
          "PROP006",
          property.file,
          property.line,
          id,
          `property ID "${id}" has no active Jest test reference`,
        ),
      );
    }
  }

  for (const [id, matches] of propertiesById) {
    const property = matches[0];
    if (matches.length !== 1 || !property.adequacy) {
      continue;
    }
    const covering = new Set(
      (activeReferencesById.get(id) ?? []).map(({ file }) => file),
    );
    for (const file of [...covering].sort(compareText)) {
      const source = testSources.get(file) ?? "";
      const missingLabels = property.adequacy.partitions.filter(
        (label) => !new RegExp(`["'\`]${label}["'\`]`).test(source),
      );
      if (missingLabels.length > 0) {
        diagnostics.push(
          diagnostic(
            "PROP032",
            property.file,
            property.line,
            id,
            `covering test ${file} does not reference partition label(s) as string literals: ${missingLabels.join(", ")}`,
          ),
        );
      }
      const lowRuns = [...source.matchAll(/numRuns\s*:\s*(\d+)/g)]
        .map((match) => Number(match[1]))
        .filter((runs) => property.adequacy.minRuns !== null && runs < property.adequacy.minRuns);
      if (lowRuns.length > 0) {
        diagnostics.push(
          diagnostic(
            "PROP033",
            property.file,
            property.line,
            id,
            `covering test ${file} sets numRuns ${lowRuns.join(", ")} below declared Min runs ${property.adequacy.minRuns}`,
          ),
        );
      }
    }
  }

  properties.sort(compareRecords);
  testReferences.sort(compareRecords);
  diagnostics.sort(compareRecords);

  const coveredProperties = [...propertiesById].filter(
    ([id, matches]) => matches.length === 1 && activeReferencesById.has(id),
  ).length;
  const exitCode = diagnostics.some(({ code }) => code === "PROP009")
    ? EXIT_DISCOVERY
    : diagnostics.length > 0
      ? EXIT_INVALID
      : EXIT_VALID;

  return {
    schemaVersion: 1,
    exitCode,
    properties,
    testReferences,
    diagnostics,
    summary: {
      propertyFiles: propertyFiles.length,
      testFiles: testFiles.length,
      properties: properties.length,
      coveredProperties,
      propertyTests: properties.filter(
        ({ technique }) => technique === "PROPERTY",
      ).length,
      finiteModelTests: properties.filter(
        ({ technique }) => technique === "FINITE_MODEL",
      ).length,
      testReferences: testReferences.length,
      errors: diagnostics.length,
    },
  };
}

export function formatTextReport(report) {
  const lines = report.diagnostics.map(
    ({ code, file, line, message }) => `${code} ${file}:${line} ${message}`,
  );
  if (lines.length === 0) {
    lines.push("PROP000 business-property traceability valid");
  }
  const summary = report.summary;
  lines.push(
    [
      "Summary:",
      `${summary.propertyFiles} property file(s),`,
      `${summary.testFiles} test file(s),`,
      `${summary.properties} property declaration(s),`,
      `${summary.coveredProperties} covered,`,
      `${summary.propertyTests} generated property test(s),`,
      `${summary.finiteModelTests} finite model test(s),`,
      `${summary.testReferences} test reference(s),`,
      `${summary.errors} error(s)`,
    ].join(" "),
  );
  return `${lines.join("\n")}\n`;
}

export function formatJsonReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function usage() {
  return `Usage: node tools/business-verification/verify.mjs [options]

Options:
  --root <path>           Project root (default: current directory)
  --property-path <path> Property file or directory; repeatable
  --test-path <path>     Jest test file or directory; repeatable
  --exclude <name>       Directory name to exclude; repeatable
  --format <text|json>   Report format (default: text)
  --help                 Show help
`;
}

function parseArguments(argumentsList) {
  const options = {
    root: ".",
    propertyPaths: [],
    testPaths: [],
    excludes: [],
    format: "text",
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help") {
      return { help: true };
    }
    const value = argumentsList[index + 1];
    if (
      ![
        "--root",
        "--property-path",
        "--test-path",
        "--exclude",
        "--format",
      ].includes(argument) ||
      value === undefined
    ) {
      throw new Error(`invalid or incomplete argument "${argument}"`);
    }
    index += 1;
    if (argument === "--root") {
      options.root = value;
    } else if (argument === "--property-path") {
      options.propertyPaths.push(value);
    } else if (argument === "--test-path") {
      options.testPaths.push(value);
    } else if (argument === "--exclude") {
      options.excludes.push(value);
    } else if (argument === "--format") {
      options.format = value;
    }
  }

  if (!["text", "json"].includes(options.format)) {
    throw new Error('--format must be "text" or "json"');
  }
  if (options.propertyPaths.length === 0) {
    delete options.propertyPaths;
  }
  if (options.testPaths.length === 0) {
    delete options.testPaths;
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stdout.write(`PROP010 verifier failure: ${error.message}\n`);
    process.stdout.write(usage());
    process.exitCode = EXIT_DISCOVERY;
    return;
  }

  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  try {
    const report = await verifyProject(options);
    process.stdout.write(
      options.format === "json"
        ? formatJsonReport(report)
        : formatTextReport(report),
    );
    process.exitCode = report.exitCode;
  } catch (error) {
    process.stderr.write(`PROP010 verifier failure: ${error.message}\n`);
    process.exitCode = EXIT_DISCOVERY;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
