// Pure Transition History ordering shared by tools/project-projection,
// tools/verify-spec and tools/project-status. The gherkin viewer carries a
// copy (it runs in the browser without imports); keep the two in step.
//
// status.md files list Transition History rows newest-first or oldest-first.
// orderTransitions returns them in chronological order:
//   1. sort by Date ascending (stable);
//   2. within one date, chain the rows: a "-" (initial) row first, then the row
//      whose From equals the previous row's To;
//   3. where chaining cannot decide, keep file order, reversed first when the
//      file is detectably newest-first (first Date >= last Date and the
//      "- -> ..." row is last).
// Rows only need `date`, `from` and `to`; other fields are carried unchanged.
// When any Date is not YYYY-MM-DD, date sorting is skipped (file order, with
// the newest-first reversal, is kept) so the order stays well defined.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value) => String(value ?? "").replace(/`/g, "").trim();

export function isNewestFirst(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const first = rows[0];
  const last = rows[rows.length - 1];
  return clean(first.date) >= clean(last.date) && clean(last.from) === "-" && clean(first.from) !== "-";
}

export function orderTransitions(rows) {
  const list = Array.isArray(rows) ? rows.filter((row) => row) : [];
  if (list.length < 2) return list.slice();
  const base = isNewestFirst(list) ? list.slice().reverse() : list.slice();
  if (!base.every((row) => DATE.test(clean(row.date)))) return base;

  // Stable sort by date, then chain each same-date group.
  const sorted = base
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (clean(a.row.date) < clean(b.row.date) ? -1 : clean(a.row.date) > clean(b.row.date) ? 1 : a.index - b.index))
    .map((entry) => entry.row);

  const result = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && clean(sorted[j + 1].date) === clean(sorted[i].date)) j += 1;
    const pending = sorted.slice(i, j + 1);
    let previousTo = result.length ? clean(result[result.length - 1].to) : null;
    while (pending.length) {
      let pick = pending.findIndex((row) => clean(row.from) === "-");
      if (pick === -1 && previousTo !== null) pick = pending.findIndex((row) => clean(row.from) === previousTo);
      if (pick === -1) {
        // Prefer a row nothing else in the group leads into (a chain start).
        pick = pending.findIndex((row) => !pending.some((other) => other !== row && clean(other.to) === clean(row.from)));
      }
      if (pick === -1) pick = 0;
      const [row] = pending.splice(pick, 1);
      result.push(row);
      previousTo = clean(row.to);
    }
    i = j + 1;
  }
  return result;
}
