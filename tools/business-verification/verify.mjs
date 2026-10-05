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

    properties.push(property);
    index = cursor - 1;
  }

  return { properties, diagnostics };
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
    const parsed = parseJestTestFile(await readFile(absolutePath, "utf8"), file);
    testReferences.push(...parsed.references);
    diagnostics.push(...parsed.diagnostics);
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
