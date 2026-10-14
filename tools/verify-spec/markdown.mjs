export function stripMarkup(value) {
  return value.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
}

export function toKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

export function extractClassNames(source) {
  return [...source.matchAll(/\bclass\s+([A-Za-z_]\w*)/g)].map((m) => m[1]);
}

// Splits markdown into heading sections, ignoring headings inside code fences.
// Section lines exclude the heading; startLine is the 1-based heading line.
export function splitSections(source) {
  const sections = [];
  let current = null;
  let fence = false;
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    if (/^\s*```/.test(raw)) {
      fence = !fence;
    }
    const heading = !fence && /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    if (heading) {
      current = {
        level: heading[1].length,
        title: stripMarkup(heading[2]),
        startLine: index + 1,
        lines: [],
      };
      sections.push(current);
    } else if (current) {
      current.lines.push(raw);
    }
  }
  return sections;
}

function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let cell = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
      cell += "|";
      i += 1;
    } else if (trimmed[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += trimmed[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

// Parses the first pipe table in a section outside code fences.
export function parseTable(section) {
  const result = { found: false, header: [], headerLine: 0, rows: [] };
  let fence = false;
  for (let i = 0; i < section.lines.length; i += 1) {
    const raw = section.lines[i];
    if (/^\s*```/.test(raw)) {
      fence = !fence;
      continue;
    }
    if (fence || !raw.trim().startsWith("|")) {
      continue;
    }
    if (!result.found) {
      if (!/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(section.lines[i + 1] ?? "")) {
        continue;
      }
      result.found = true;
      result.header = splitRow(raw);
      result.headerLine = section.startLine + 1 + i;
      i += 1;
      continue;
    }
    result.rows.push({ cells: splitRow(raw), line: section.startLine + 1 + i });
  }
  return result;
}
