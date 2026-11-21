// Gate validation for verify-spec. Implements the Validity Rules of
// skills/hgate-guide/references/lifecycle-gates.md against each BC's
// status.md (Transition History + Gate Evidence). Pure functions: callers
// pass file contents and receive diagnostics; no file system access here.

import { parseTable, splitSections } from "./markdown.mjs";

// Removes backticks and bold markers only; "_" and "*" are significant in
// state names (SPEC_REVIEWED) and catalog patterns ("* -> *").
const stripMarkup = (value) =>
  value.replace(/`/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

export const LIFECYCLE_STATES = [
  "DISCOVERED",
  "REFINING",
  "REFINED",
  "SPEC_REVIEWED",
  "IMPLEMENTING",
  "IMPLEMENTED",
  "VERIFIED",
  "CHANGING",
  "BLOCKED",
  "DEPRECATED",
];
const STATES = new Set(LIFECYCLE_STATES);
const KINDS = new Set(["H", "D", "R"]);
const RESULTS = new Set(["PASS", "FAIL", "WAIVED", "N/A"]);
const OPTIONAL_GATES = new Set(["GATE-IMPL-PROPS"]);
const OPTIONAL_RESULTS = new Set(["PASS", "N/A"]);
const WAIVER_ROLE = "tech lead";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GATE_ID = /^GATE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const NO_SIGNER = /^(?:-|—|–|none|n\/a)?$/i;

// Codes (stable; listed in README.md).
export const GATE_CODES = {
  missing: "HGS001", // required gate has no row for the current transition
  unsatisfied: "HGS002", // latest row is FAIL / N/A (or optional gate with a disallowed result)
  waiver: "HGS003", // WAIVED without a Tech lead signer or without a reason
  malformed: "HGS004", // Gate Evidence row breaks the column rules
  transition: "HGS005", // current transition cannot be determined
  legacy: "HGS006", // warning: no Gate Evidence section (unmigrated status.md)
  catalog: "HGS007", // gate catalog cannot be parsed
};

function diagnostic(code, file, line, message) {
  return { code, file, line, message };
}

// Same unfilled-template rules as tools/project-projection/generate.mjs:
// a whole "[...]" or "<...>" cell, or any cell containing YYYY-MM-DD.
const isUnfilledCell = (value) =>
  /^\[.*\]$/.test(value) || /^<.*>$/.test(value) || value.includes("YYYY-MM-DD");
const isUnfilledRow = (cells) => cells.some(isUnfilledCell) || cells.every((c) => c === "");

const unquote = (value) => {
  const match = /^`([^`]*)`$/.exec(value.trim());
  return match ? match[1].trim() : value.trim();
};

// "FROM -> TO" (or "→"); returns { from, to } or null.
function parseTransition(raw) {
  const match = /^(\S+)\s*(?:->|→)\s*(\S+)$/.exec(stripMarkup(raw));
  return match ? { from: match[1], to: match[2] } : null;
}

const transitionKey = (from, to) => `${from} -> ${to}`;

function findSection(sections, pattern) {
  return sections.find((section) => pattern.test(section.title));
}

// Rows keyed by lower-cased header, unfilled template rows skipped.
function tableRows(section) {
  const table = parseTable(section);
  if (!table.found) {
    return { found: false, rows: [], headerLine: section.startLine };
  }
  const header = table.header.map((h) => stripMarkup(h).toLowerCase());
  const rows = [];
  for (const row of table.rows) {
    const cells = row.cells.map(unquote);
    if (isUnfilledRow(cells)) {
      continue;
    }
    const record = { line: row.line, cells: {} };
    header.forEach((name, index) => {
      record.cells[name] = cells[index] ?? "";
    });
    rows.push(record);
  }
  return { found: true, rows, headerLine: table.headerLine, header };
}

function matchesFrom(pattern, from) {
  if (pattern === "*") {
    return STATES.has(from) && from !== "DEPRECATED";
  }
  return pattern === from;
}

function matchesTo(pattern, to) {
  return pattern === "*" ? STATES.has(to) : pattern === to;
}

export function catalogMatches(entry, from, to) {
  return matchesFrom(entry.from, from) && matchesTo(entry.to, to);
}

// Parses the "Gate Catalog" table. Returns { entries, diagnostics }.
export function parseGateCatalog(source, file) {
  const diagnostics = [];
  const sections = splitSections(source);
  const section = findSection(sections, /^gate catalog\b/i);
  if (!section) {
    return {
      entries: [],
      diagnostics: [diagnostic(GATE_CODES.catalog, file, 1, 'gate catalog has no "Gate Catalog" section')],
    };
  }
  const table = tableRows(section);
  const needed = ["gate id", "transition", "kind", "signer"];
  if (!table.found || needed.some((column) => !table.header.includes(column))) {
    return {
      entries: [],
      diagnostics: [
        diagnostic(
          GATE_CODES.catalog,
          file,
          table.headerLine,
          "Gate Catalog needs a table with Gate ID | Transition | Kind | Signer columns",
        ),
      ],
    };
  }
  const entries = [];
  for (const row of table.rows) {
    const gate = stripMarkup(row.cells["gate id"]);
    const transition = parseTransition(row.cells.transition);
    const kind = stripMarkup(row.cells.kind).toUpperCase();
    const problems = [];
    if (!GATE_ID.test(gate)) problems.push(`gate ID "${gate}" is not GATE-...`);
    if (
      !transition ||
      !(transition.from === "-" || transition.from === "*" || STATES.has(transition.from)) ||
      !(transition.to === "*" || STATES.has(transition.to))
    ) {
      problems.push(`transition "${row.cells.transition}" is not "FROM -> TO"`);
    }
    if (!KINDS.has(kind)) problems.push(`kind "${kind}" must be H, D or R`);
    if (problems.length > 0) {
      diagnostics.push(diagnostic(GATE_CODES.catalog, file, row.line, `catalog row: ${problems.join("; ")}`));
      continue;
    }
    const signerCell = stripMarkup(row.cells.signer);
    const signers = NO_SIGNER.test(signerCell)
      ? []
      : signerCell.split(/\s+\/\s+/).map((role) => role.trim().toLowerCase()).filter(Boolean);
    entries.push({ gate, from: transition.from, to: transition.to, kind, signers, line: row.line });
  }
  if (entries.length === 0 && diagnostics.length === 0) {
    diagnostics.push(diagnostic(GATE_CODES.catalog, file, table.headerLine, "Gate Catalog table has no gates"));
  }
  return { entries, diagnostics };
}

// "<Name> (<Role>)" -> lower-cased role, or null.
function signerRole(value) {
  const match = /^(.+?)\s*\(([^()]+)\)\s*$/.exec(value);
  return match && match[1].trim() !== "" ? match[2].trim().toLowerCase() : null;
}

function readGateRows(section, file, catalog, out) {
  const table = tableRows(section);
  if (!table.found) {
    out.push(
      diagnostic(
        GATE_CODES.malformed,
        file,
        section.startLine,
        "Gate Evidence section has no table (Transition | Gate | Kind | Result | Evidence | Signed by | Date)",
      ),
    );
    return [];
  }
  const rows = [];
  for (const row of table.rows) {
    const c = row.cells;
    const problems = [];
    const transition = parseTransition(c.transition ?? "");
    if (
      !transition ||
      !(transition.from === "-" || STATES.has(transition.from)) ||
      !STATES.has(transition.to)
    ) {
      problems.push(`transition "${c.transition ?? ""}" must be "FROM -> TO" with concrete lifecycle states`);
    } else if (transition.from === "-" && transition.to !== "DISCOVERED") {
      problems.push(`"-" as FROM is only valid for "- -> DISCOVERED"`);
    }
    const gate = stripMarkup(c.gate ?? "");
    const gateEntries = catalog.filter((entry) => entry.gate === gate);
    if (gateEntries.length === 0) {
      problems.push(`gate "${gate}" is not in the gate catalog`);
    }
    const matching = transition
      ? gateEntries.filter((entry) => catalogMatches(entry, transition.from, transition.to))
      : [];
    if (transition && gateEntries.length > 0 && matching.length === 0) {
      problems.push(`gate ${gate} does not apply to transition ${transitionKey(transition.from, transition.to)}`);
    }
    const kind = stripMarkup(c.kind ?? "").toUpperCase();
    const catalogKind = (matching[0] ?? gateEntries[0])?.kind;
    if (!KINDS.has(kind)) {
      problems.push(`kind "${c.kind ?? ""}" must be H, D or R`);
    } else if (catalogKind && kind !== catalogKind) {
      problems.push(`kind ${kind} does not match catalog kind ${catalogKind} for ${gate}`);
    }
    const result = stripMarkup(c.result ?? "").toUpperCase();
    if (!RESULTS.has(result)) {
      problems.push(`result "${c.result ?? ""}" must be PASS, FAIL, WAIVED or N/A`);
    }
    const evidence = (c.evidence ?? "").trim();
    if (evidence === "") {
      problems.push("evidence must not be empty");
    }
    const signer = stripMarkup(c["signed by"] ?? "");
    const role = signerRole(signer);
    const roles = (matching[0] ?? gateEntries[0])?.signers ?? [];
    if (result !== "WAIVED") {
      if (kind === "H" && result === "PASS") {
        if (!role) {
          problems.push(`signed by "${signer}" must be "<Name> (<Signer role>)" for a human gate`);
        } else if (roles.length > 0 && !roles.includes(role)) {
          problems.push(`signer role "${role}" is not allowed for ${gate} (allowed: ${roles.join(" / ")})`);
        }
      } else if (kind !== "H" && !NO_SIGNER.test(signer)) {
        problems.push(`signed by must be "-" for a ${kind} gate`);
      }
    }
    const date = stripMarkup(c.date ?? "");
    if (!DATE.test(date)) {
      problems.push(`date "${date}" must be YYYY-MM-DD`);
    }
    for (const problem of problems) {
      out.push(diagnostic(GATE_CODES.malformed, file, row.line, `Gate Evidence row: ${problem}`));
    }
    if (transition) {
      rows.push({
        key: transitionKey(transition.from, transition.to),
        gate,
        result,
        evidence,
        role,
        signer,
        date,
        line: row.line,
      });
    }
  }
  return rows;
}

function readHistory(sections) {
  const section = findSection(sections, /^transition history\b/i);
  if (!section) {
    return null;
  }
  return tableRows(section).rows.map((row) => ({
    date: stripMarkup(row.cells.date ?? ""),
    from: stripMarkup(row.cells.from ?? ""),
    to: stripMarkup(row.cells.to ?? ""),
    line: row.line,
  }));
}

function readLifecycle(status) {
  const match = /^lifecycle:\s*(\S+)/im.exec(status);
  if (!match) {
    return { value: null, line: 1 };
  }
  return {
    value: match[1].replace(/[`"']/g, ""),
    line: status.slice(0, match.index).split("\n").length,
  };
}

// Validates one BC's status.md. Returns { errors, warnings }.
export function checkGates({ status, file, catalog }) {
  const errors = [];
  const warnings = [];
  if (status === null) {
    warnings.push(
      diagnostic(GATE_CODES.legacy, file, 1, "status.md is missing; gate evidence cannot be checked"),
    );
    return { errors, warnings };
  }
  const sections = splitSections(status);
  const gateSection = findSection(sections, /^gate evidence\b/i);
  if (!gateSection) {
    warnings.push(
      diagnostic(
        GATE_CODES.legacy,
        file,
        1,
        'status.md has no "## Gate Evidence" section; migrate it (see skills/bc-refinement/assets/status-template.md) so lifecycle gates can be checked',
      ),
    );
    return { errors, warnings };
  }
  const rows = readGateRows(gateSection, file, catalog, errors);

  // Rule 1: the current transition is the last history row into `lifecycle:`.
  const lifecycle = readLifecycle(status);
  if (!lifecycle.value || !STATES.has(lifecycle.value)) {
    errors.push(
      diagnostic(
        GATE_CODES.transition,
        file,
        lifecycle.line,
        `lifecycle ${lifecycle.value ?? "(missing)"} is not a lifecycle state; current transition cannot be determined`,
      ),
    );
    return { errors, warnings };
  }
  const history = readHistory(sections);
  const current = (history ?? []).filter((row) => row.to === lifecycle.value).at(-1);
  if (!current) {
    errors.push(
      diagnostic(
        GATE_CODES.transition,
        file,
        lifecycle.line,
        `no Transition History row has To = ${lifecycle.value}; current transition cannot be determined`,
      ),
    );
    return { errors, warnings };
  }
  if (!(current.from === "-" || STATES.has(current.from)) || !DATE.test(current.date)) {
    errors.push(
      diagnostic(
        GATE_CODES.transition,
        file,
        current.line,
        `Transition History row needs a lifecycle state (or "-") in From and a YYYY-MM-DD Date`,
      ),
    );
    return { errors, warnings };
  }
  const key = transitionKey(current.from, current.to);
  const currentRows = rows.filter((row) => row.key === key && DATE.test(row.date) && row.date >= current.date);

  // Rule 2: every matching catalog gate is required, except optional ones.
  const applicable = [];
  for (const entry of catalog) {
    if (catalogMatches(entry, current.from, current.to) && !applicable.includes(entry.gate)) {
      applicable.push(entry.gate);
    }
  }
  const where = `${key} (Transition History line ${current.line})`;
  for (const gate of applicable) {
    const latest = currentRows.filter((row) => row.gate === gate).at(-1);
    if (OPTIONAL_GATES.has(gate)) {
      // Rule 5: optional rows may be omitted; when present PASS or N/A.
      if (latest && !OPTIONAL_RESULTS.has(latest.result)) {
        errors.push(
          diagnostic(GATE_CODES.unsatisfied, file, latest.line, `optional gate ${gate} for ${key} is ${latest.result}; use PASS or N/A`),
        );
      }
      continue;
    }
    if (!latest) {
      errors.push(
        diagnostic(GATE_CODES.missing, file, current.line, `required gate ${gate} has no Gate Evidence row for current transition ${where}`),
      );
      continue;
    }
    // Rule 3: PASS, or WAIVED with a Tech lead signer and a reason.
    if (latest.result === "PASS") {
      continue;
    }
    if (latest.result === "WAIVED") {
      if (latest.role !== WAIVER_ROLE) {
        errors.push(
          diagnostic(GATE_CODES.waiver, file, latest.line, `gate ${gate} for ${key} is WAIVED but not signed by a Tech lead ("${latest.signer}")`),
        );
      } else if (latest.evidence === "") {
        errors.push(diagnostic(GATE_CODES.waiver, file, latest.line, `gate ${gate} for ${key} is WAIVED without a reason in Evidence`));
      }
      continue;
    }
    errors.push(
      diagnostic(GATE_CODES.unsatisfied, file, latest.line, `required gate ${gate} for ${key} is ${latest.result || "(no result)"}; lifecycle ${lifecycle.value} is not valid`),
    );
  }
  return { errors, warnings };
}
