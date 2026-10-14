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
const ORACLE_SOURCES = new Set([
  "REFERENCE_CALCULATION",
  "DOMAIN_EQUATION",
  "CONSERVATION",
  "METAMORPHIC",
  "ROUND_TRIP",
  "TRUSTED_LIBRARY",
  "STATE_INVARIANT",
  "APPROVED_TABLE",
]);
const MIN_INDEPENDENCE_LENGTH = 40;
const PLACEHOLDER_PATTERN =
  /^(?:n\/a|na|none|tbd|todo|<[^>]*>|independent\.?|yes|same|-+)$/i;
const SHARED_PATH_PATTERNS = [
  /\b(?:same|identical)\s+(?:function|method|implementation|code|algorithm|path|logic|service|calculation)\b/i,
  /\bcop(?:y|ies|ied)\s+of\b/i,
  /\bline[- ]for[- ]line\b/i,
  /\b(?:reuses?|re-?implements?|calls?|invokes?|delegates?\s+to|wraps?|mirrors?|duplicates?)\s+(?:the\s+)?(?:production|subject|implementation)\b/i,
  /\bproduction\s+(?:code|algorithm|implementation|function|path|logic)\b/i,
];
const NEGATION_PATTERN =
  /\b(?:never|not|no|without|nor|neither|isn't|doesn't|don't|cannot|avoids?)\b/i;
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
const RISK_TIERS = ["LOW", "MEDIUM", "HIGH"];
const SENSITIVITY_METHODS = new Set([
  "MUTATION",
  "KNOWN_BAD_FIXTURE",
  "INJECTED_DEFECT",
  "ORACLE_VIOLATION",
  "REGRESSION_COUNTEREXAMPLE",
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

function oracleIndependenceProblem(statement) {
  if (!statement) {
    return "statement is missing";
  }
  if (PLACEHOLDER_PATTERN.test(statement)) {
    return "statement is a placeholder";
  }
  if (statement.length < MIN_INDEPENDENCE_LENGTH) {
    return `statement must name the independent source and why it shares no implementation path (at least ${MIN_INDEPENDENCE_LENGTH} characters)`;
  }
  for (const sentence of statement.split(/(?<=[.;!?])\s+/)) {
    for (const pattern of SHARED_PATH_PATTERNS) {
      const match = pattern.exec(sentence);
      if (match && !NEGATION_PATTERN.test(sentence.slice(0, match.index))) {
        return `statement admits a shared implementation path ("${match[0]}")`;
      }
    }
  }
  return null;
}

function checkSensitivity(property, file, diagnostics) {
  const report = (code, message) =>
    diagnostics.push(diagnostic(code, file, property.line, property.id, message));
  const { Risk, Sensitivity, "Sensitivity-Evidence": evidence } =
    property.fields;
  const waiver = property.fields["Sensitivity-Waiver"];

  if (!RISK_TIERS.includes(Risk)) {
    report("PROP050", `Risk must be one of ${RISK_TIERS.join(", ")}`);
    return;
  }
  property.risk = Risk;

  if (!Sensitivity) {
    report("PROP051", "property declaration is missing Sensitivity");
    return;
  }

  if (Sensitivity.toUpperCase() === "N/A") {
    if (Risk !== "LOW") {
      report("PROP053", `${Risk} risk properties must declare a sensitivity method`);
    } else if (!waiver) {
      report("PROP053", "Sensitivity: N/A requires a Sensitivity-Waiver reason");
    } else {
      property.sensitivityWaived = true;
    }
    return;
  }

  const methods = Sensitivity.split(",").map((method) => method.trim());
  const unknown = methods.filter((method) => !SENSITIVITY_METHODS.has(method));
  if (unknown.length > 0) {
    report("PROP052", `unknown Sensitivity method(s): ${unknown.join(", ")}`);
    return;
  }
  property.sensitivityMethods = methods;

  const segments = (evidence ?? "").split(";").map((part) => part.trim());
  if (segments.length < 2 || segments.some((part) => !part)) {
    report(
      "PROP054",
      "Sensitivity-Evidence must name the mutant/defect and the observed failure as '<defect>; <failure observed>'",
    );
    return;
  }

  if (Risk === "HIGH" && methods.every((method) => method === "ORACLE_VIOLATION")) {
    report(
      "PROP055",
      "HIGH risk properties need a production-logic method (MUTATION, KNOWN_BAD_FIXTURE, INJECTED_DEFECT, or REGRESSION_COUNTEREXAMPLE), not ORACLE_VIOLATION alone",
    );
    return;
  }
  property.sensitivityEvidenced = true;
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

    const oracleSource = property.fields["Oracle source"];
    if (!oracleSource || !ORACLE_SOURCES.has(oracleSource)) {
      diagnostics.push(
        diagnostic(
          "PROP040",
          file,
          property.line,
          property.id,
          `Oracle source must be one of ${[...ORACLE_SOURCES].join(", ")}${oracleSource ? `, received "${oracleSource}"` : ""}`,
        ),
      );
    }

    const independenceProblem = oracleIndependenceProblem(
      property.fields["Oracle independence"],
    );
    if (independenceProblem) {
      diagnostics.push(
        diagnostic(
          "PROP041",
          file,
          property.line,
          property.id,
          `Oracle independence ${independenceProblem}`,
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
    checkSensitivity(property, file, diagnostics);

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

const EXECUTION_PATTERNS = {
  PROPERTY: new Set(["fc.assert", "fastCheck.assert", "hgateProperty"]),
  FINITE_MODEL: new Set(["exploreFiniteModel", "hgateFiniteModel"]),
};

function detectExecutionKinds(calls) {
  return Object.entries(EXECUTION_PATTERNS)
    .filter(([, names]) => calls.some(({ path: name }) => names.has(name)))
    .map(([kind]) => kind);
}

async function readEvidence(root, evidencePath) {
  const file = toPosixPath(evidencePath);
  const fail = (message) => ({
    file,
    records: [],
    diagnostics: [diagnostic("PROP014", file, 1, null, message)],
  });
  let text;
  try {
    text = await readFile(path.resolve(root, evidencePath), "utf8");
  } catch (error) {
    return fail(`execution evidence file cannot be read: ${error.message}`);
  }

  const records = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === "") {
      continue;
    }
    let record;
    try {
      record = JSON.parse(lines[index]);
    } catch {
      return fail(`execution evidence line ${index + 1} is not valid JSON`);
    }
    if (
      record === null ||
      typeof record !== "object" ||
      typeof record.id !== "string" ||
      !TECHNIQUES.has(record.technique)
    ) {
      return fail(
        `execution evidence line ${index + 1} needs a string id and a PROPERTY or FINITE_MODEL technique`,
      );
    }
    records.push({
      id: record.id,
      technique: record.technique,
      numRuns: record.numRuns,
      seed: record.seed,
      statesVisited: record.statesVisited,
      transitionsExplored: record.transitionsExplored,
    });
  }
  records.sort(
    (left, right) =>
      compareText(left.id, right.id) ||
      compareText(left.technique, right.technique),
  );
  return { file, records, diagnostics: [] };
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value >= 1;
}

function evidenceIsComplete(record) {
  return record.technique === "PROPERTY"
    ? isPositiveInteger(record.numRuns) && Number.isInteger(record.seed)
    : isPositiveInteger(record.statesVisited);
}

function parseJestTestFile(ts, source, file, allowFocused = false) {
  const references = [];
  const diagnostics = [];
  const warnings = [];

  for (const testCall of parseTestCalls(ts, source, file)) {
    const titleResult = { value: testCall.title };
    const executionKinds = detectExecutionKinds(testCall.calls);
    const unreachableExecution =
      executionKinds.length === 0 &&
      detectExecutionKinds(testCall.allCalls).length > 0;
    const { line } = testCall;
    const rejectFocus = testCall.focused && !allowFocused;
    const active = testCall.active && !rejectFocus;
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
        executionKinds,
        unreachableExecution,
      });
      if (testCall.focused) {
        (allowFocused ? warnings : diagnostics).push(
          diagnostic(
            "PROP015",
            file,
            line,
            id,
            `test for "${id}" is focused with .only/fit/fdescribe; Jest skips sibling tests while it is focused; remove the focus${allowFocused ? "" : " (or pass --allow-focused for local runs)"}`,
          ),
        );
      }
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
  const warnings = [];
  const ts = loadTypeScript(root);

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
    const parsed = parseJestTestFile(
      ts,
      source,
      file,
      options.allowFocused === true,
    );
    testReferences.push(...parsed.references);
    diagnostics.push(...parsed.diagnostics);
    warnings.push(...parsed.warnings);
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
    const declarations = propertiesById.get(reference.id) ?? [];
    const counts =
      reference.active &&
      (declarations.length !== 1 ||
        reference.executionKinds.includes(declarations[0].technique));
    if (
      reference.active &&
      declarations.length === 1 &&
      !reference.executionKinds.includes(declarations[0].technique)
    ) {
      const technique = declarations[0].technique;
      const expected =
        technique === "PROPERTY"
          ? "fc.assert(...) or hgateProperty(...)"
          : "exploreFiniteModel(...) or hgateFiniteModel(...)";
      diagnostics.push(
        reference.executionKinds.length === 0
          ? diagnostic(
              "PROP011",
              reference.file,
              reference.line,
              reference.id,
              `test for ${technique} property "${reference.id}" never executes a property; its body must call ${expected}${reference.unreachableExecution ? " on a statically reachable path (the existing call is in a constant-false branch, after return/throw, or in a helper or callback that is never invoked)" : ""}`,
            )
          : diagnostic(
              "PROP012",
              reference.file,
              reference.line,
              reference.id,
              `test for ${technique} property "${reference.id}" executes ${reference.executionKinds.join(", ")} instead; its body must call ${expected}`,
            ),
      );
    }
    if (counts) {
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

  let evidence = null;
  if (options.evidencePath !== undefined) {
    const loaded = await readEvidence(root, options.evidencePath);
    evidence = { path: loaded.file, records: loaded.records };
    diagnostics.push(...loaded.diagnostics);
    for (const [id, matches] of propertiesById) {
      if (matches.length !== 1 || !activeReferencesById.has(id)) {
        continue;
      }
      const property = matches[0];
      const complete = loaded.records.some(
        (record) =>
          record.id === id &&
          record.technique === property.technique &&
          evidenceIsComplete(record),
      );
      if (!complete && loaded.diagnostics.length === 0) {
        diagnostics.push(
          diagnostic(
            "PROP013",
            property.file,
            property.line,
            id,
            `no complete ${property.technique} execution evidence for "${id}" in ${loaded.file}`,
          ),
        );
      }
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
  warnings.sort(compareRecords);

  const coveredProperties = [...propertiesById].filter(
    ([id, matches]) => matches.length === 1 && activeReferencesById.has(id),
  ).length;
  const exitCode = diagnostics.some(
    ({ code }) => code === "PROP009" || code === "PROP014",
  )
    ? EXIT_DISCOVERY
    : diagnostics.length > 0
      ? EXIT_INVALID
      : EXIT_VALID;

  return {
    schemaVersion: 2,
    exitCode,
    properties,
    testReferences,
    evidence,
    diagnostics,
    warnings,
    summary: {
      propertyFiles: propertyFiles.length,
      testFiles: testFiles.length,
      properties: properties.length,
      coveredProperties,
      propertyDeclarations: properties.filter(
        ({ technique }) => technique === "PROPERTY",
      ).length,
      finiteModelDeclarations: properties.filter(
        ({ technique }) => technique === "FINITE_MODEL",
      ).length,
      riskTiers: Object.fromEntries(
        RISK_TIERS.map((tier) => [
          tier,
          properties.filter(({ risk }) => risk === tier).length,
        ]),
      ),
      sensitivityEvidenced: properties.filter(
        ({ sensitivityEvidenced }) => sensitivityEvidenced,
      ).length,
      sensitivityWaived: properties.filter(
        ({ sensitivityWaived }) => sensitivityWaived,
      ).length,
      testReferences: testReferences.length,
      activeTestReferences: testReferences.filter(({ active }) => active)
        .length,
      inactiveTestReferences: testReferences.filter(({ active }) => !active)
        .length,
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
    lines.push("PROP000 business-property traceability valid");
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
      `${summary.propertyFiles} property file(s),`,
      `${summary.testFiles} test file(s),`,
      `${summary.properties} property declaration(s),`,
      `${summary.coveredProperties} covered,`,
      `${summary.propertyDeclarations} PROPERTY declaration(s),`,
      `${summary.finiteModelDeclarations} FINITE_MODEL declaration(s),`,
      `${summary.sensitivityEvidenced} sensitivity-evidenced,`,
      `${summary.sensitivityWaived} sensitivity-waived,`,
      `${summary.testReferences} test reference(s)`,
      `(${summary.activeTestReferences} active, ${summary.inactiveTestReferences} inactive),`,
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
  return `Usage: node tools/business-verification/verify.mjs [options]

Options:
  --root <path>           Project root (default: current directory)
  --property-path <path> Property file or directory; repeatable
  --test-path <path>     Jest test file or directory; repeatable
  --exclude <name>       Directory name to exclude; repeatable
  --evidence <path>      JSONL execution evidence written by the hGATE
                         wrappers; validated when supplied
  --allow-focused        Downgrade .only/fit/fdescribe from an error to a warning
                         (local iteration only; not for CI)
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
    if (argument === "--allow-focused") {
      options.allowFocused = true;
      continue;
    }
    const value = argumentsList[index + 1];
    if (
      ![
        "--root",
        "--property-path",
        "--test-path",
        "--exclude",
        "--evidence",
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
    } else if (argument === "--evidence") {
      options.evidencePath = value;
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
