// Pure gap-ledger logic shared by tools/project-projection and tools/verify-spec.
// No file system access: callers parse Markdown tables and pass rows in.

export const GAP_STATES = ["RESOLVED", "DEFERRED", "OPEN", "MIXED"];

// Gap IDs shared between domain-map.md, context-map.md and status.md Open Items.
// Local BC items use OI-<n> and are not part of the ledger.
export const GAP_ID_PATTERN = /^G\d+$/;

export const DIAGNOSTIC_CODES = {
  HGW001: "gap disposition drift",
  HGW002: "gap referenced in a BC status.md but missing from the maps",
};

// RESOLVED when the text mentions "resolved" (including partial "Resolved for X;
// Y to confirm") or marks the gap closed as "out of scope"; DEFERRED when it
// mentions "deferred"; anything else (including empty) is OPEN.
export function classifyDisposition(text) {
  const value = String(text ?? "").toLowerCase();
  if (/\bresolved\b/.test(value) || /\bout of scope\b/.test(value)) return "RESOLVED";
  if (/\bdeferred\b/.test(value)) return "DEFERRED";
  return "OPEN";
}

// Legacy Open Items tables have no ID column; a leading "G<n>" in the item text
// still names the gap ("G11 Personality trait list").
export function gapIdFromText(text) {
  const match = /^\s*`?(G\d+)`?\b/.exec(String(text ?? ""));
  return match ? match[1] : null;
}

// Natural order: prefix, then number, then full text ("G2" < "G11" < "RG-1").
export function compareGapIds(left, right) {
  const parse = (id) => {
    const match = /^(\D*)(\d+)(.*)$/.exec(id);
    return match ? [match[1], Number(match[2]), match[3]] : [id, -1, ""];
  };
  const [lp, ln, lr] = parse(left);
  const [rp, rn, rr] = parse(right);
  if (lp !== rp) return lp < rp ? -1 : 1;
  if (ln !== rn) return ln - rn;
  if (lr !== rr) return lr < rr ? -1 : 1;
  return 0;
}

const text = (value) => (value === undefined || value === null ? "" : String(value).trim());

/**
 * Joins gap sources by ID.
 *
 * @param {Array<{id: string, gap?: string, affected?: string, file: string,
 *   line: number, bc?: string|null, owner?: string, disposition?: string}>} sources
 *   in priority order (domain map, context map, then BC status files). A source
 *   with `bc` null/undefined is a map source.
 * @returns {{gaps: object[], diagnostics: object[]}} gaps ordered by ID
 *   (natural), sources in input order; diagnostics sorted deterministically.
 */
export function mergeGaps(sources) {
  const byId = new Map();
  for (const source of sources) {
    const id = text(source.id);
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(source);
  }
  const gaps = [];
  const diagnostics = [];
  for (const id of [...byId.keys()].sort(compareGapIds)) {
    const group = byId.get(id);
    const entries = group.map((source) => ({
      file: source.file,
      line: source.line,
      bc: source.bc ?? null,
      owner: text(source.owner),
      disposition: text(source.disposition),
    }));
    const categories = entries.map((entry) => classifyDisposition(entry.disposition));
    const distinct = [...new Set(categories)];
    const state = distinct.length === 1 ? distinct[0] : "MIXED";
    const firstGap = group.find((source) => text(source.gap));
    const firstAffected = group.find((source) => text(source.affected));
    gaps.push({
      id,
      gap: firstGap ? text(firstGap.gap) : "",
      affected: firstAffected ? text(firstAffected.affected) : null,
      state,
      sources: entries,
    });
    if (state === "MIXED") {
      const detail = entries
        .map((entry, index) => `${categories[index]} at ${entry.file}:${entry.line}`)
        .join(", ");
      diagnostics.push({
        code: "HGW001",
        severity: "warning",
        message: `gap ${id} dispositions disagree: ${detail}`,
        file: entries[0].file,
        line: entries[0].line,
        bcId: null,
        gapId: id,
      });
    }
    if (entries.every((entry) => entry.bc !== null)) {
      for (const entry of entries) {
        diagnostics.push({
          code: "HGW002",
          severity: "warning",
          message: `gap ${id} is listed in BC ${entry.bc} Open Items but in neither docs/domain-map.md nor docs/context-map.md`,
          file: entry.file,
          line: entry.line,
          bcId: entry.bc,
          gapId: id,
        });
      }
    }
  }
  diagnostics.sort(compareDiagnostics);
  return { gaps, diagnostics };
}

export function compareDiagnostics(left, right) {
  const keys = [
    [left.code, right.code],
    [left.file, right.file],
  ];
  for (const [a, b] of keys) if (a !== b) return a < b ? -1 : 1;
  if (left.line !== right.line) return (left.line ?? 0) - (right.line ?? 0);
  const ga = left.gapId ?? "";
  const gb = right.gapId ?? "";
  if (ga !== gb) return compareGapIds(ga, gb);
  return left.message < right.message ? -1 : left.message > right.message ? 1 : 0;
}

const escapeData = (value) =>
  String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProperty = (value) =>
  escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");

/**
 * Lines for the trailing warnings block (§3.1 of the lifecycle plan). Returns
 * [] when there are no diagnostics. With `github: true`, GitHub Actions
 * `::warning` annotations come first so the human-readable block stays last.
 */
export function formatWarnings(diagnostics, { github = false } = {}) {
  if (!diagnostics.length) return [];
  const lines = [];
  if (github) {
    for (const d of diagnostics) {
      lines.push(
        `::warning file=${escapeProperty(d.file)},line=${d.line},title=${escapeProperty(d.code)}::${escapeData(d.message)}`,
      );
    }
  }
  lines.push(`WARNINGS (${diagnostics.length})`);
  for (const d of diagnostics) lines.push(`  ${d.code} ${d.file}:${d.line} ${d.message}`);
  return lines;
}
