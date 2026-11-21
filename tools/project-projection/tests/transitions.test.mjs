import assert from "node:assert/strict";
import test from "node:test";

import { isNewestFirst, orderTransitions } from "../../shared/transitions.mjs";

const row = (date, from, to) => ({ date, from, to });
const keys = (rows) => rows.map((r) => `${r.from}->${r.to}@${r.date}`);

const OLDEST_FIRST = [
  row("2026-10-14", "-", "DISCOVERED"),
  row("2026-10-20", "DISCOVERED", "REFINING"),
  row("2026-11-01", "REFINING", "REFINED"),
];

test("orderTransitions should keep an oldest-first table unchanged", () => {
  assert.deepEqual(keys(orderTransitions(OLDEST_FIRST)), keys(OLDEST_FIRST));
  assert.equal(isNewestFirst(OLDEST_FIRST), false);
});

test("orderTransitions should sort a newest-first table by date", () => {
  const newest = OLDEST_FIRST.slice().reverse();
  assert.equal(isNewestFirst(newest), true);
  assert.deepEqual(keys(orderTransitions(newest)), keys(OLDEST_FIRST));
  assert.deepEqual(newest.map((r) => r.to), ["REFINED", "REFINING", "DISCOVERED"], "input is not mutated");
});

test("orderTransitions should chain same-date rows from '-' and From = previous To", () => {
  const sameDay = [
    row("2026-10-14", "REFINING", "REFINED"),
    row("2026-10-14", "DISCOVERED", "REFINING"),
    row("2026-10-14", "-", "DISCOVERED"),
  ];
  assert.deepEqual(orderTransitions(sameDay).map((r) => r.to), ["DISCOVERED", "REFINING", "REFINED"]);
  // Mixed: chaining continues across a date boundary.
  const mixed = [
    row("2026-10-15", "REFINED", "BLOCKED"),
    row("2026-10-14", "DISCOVERED", "REFINING"),
    row("2026-10-14", "REFINING", "REFINED"),
    row("2026-10-14", "-", "DISCOVERED"),
  ];
  assert.deepEqual(orderTransitions(mixed).map((r) => r.to), ["DISCOVERED", "REFINING", "REFINED", "BLOCKED"]);
});

test("orderTransitions should reverse an ambiguous newest-first same-date group", () => {
  // REFINED -> BLOCKED and BLOCKED -> REFINED on one day after the initial row:
  // chaining alone cannot pick a start; the file is newest-first so it is reversed.
  const newest = [
    row("2026-10-14", "BLOCKED", "REFINED"),
    row("2026-10-14", "REFINED", "BLOCKED"),
    row("2026-10-14", "REFINING", "REFINED"),
    row("2026-10-14", "DISCOVERED", "REFINING"),
    row("2026-10-14", "-", "DISCOVERED"),
  ];
  assert.deepEqual(
    keys(orderTransitions(newest)),
    keys(newest.slice().reverse()),
  );
});

test("orderTransitions should keep file order stable for invalid dates and carry extra fields", () => {
  const rows = [
    { ...row("soon", "-", "DISCOVERED"), line: 12 },
    { ...row("2026-10-14", "DISCOVERED", "REFINING"), line: 13 },
  ];
  assert.deepEqual(orderTransitions(rows), rows);
  assert.deepEqual(orderTransitions([]), []);
  assert.deepEqual(orderTransitions(undefined), []);
  assert.deepEqual(orderTransitions([OLDEST_FIRST[0]]), [OLDEST_FIRST[0]]);
});
