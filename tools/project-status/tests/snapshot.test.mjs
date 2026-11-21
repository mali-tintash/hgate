import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  snapshotBc,
  diffSnapshots,
  normalize,
  hashContent,
  CATEGORIES,
} from "../snapshot.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, "fixtures", "cart");
const loadFixture = () =>
  Object.fromEntries(
    readdirSync(fixtureDir).map((name) => [name, readFileSync(path.join(fixtureDir, name), "utf8")]),
  );

const edit = (files, name, from, to) => {
  assert.ok(files[name].includes(from), `fixture ${name} must contain ${from}`);
  return { ...files, [name]: files[name].replace(from, to) };
};

const changedCategories = (diff) =>
  CATEGORIES.filter((c) => {
    const d = diff[c];
    return d.added.length || d.removed.length || d.modified.length;
  });

test("normalize trims trailing whitespace and collapses blank-line runs", () => {
  assert.equal(normalize("a  \r\n\n\n\nb\t\n\n"), "a\n\nb");
  assert.equal(hashContent("x \n\n\ny"), hashContent("x\n\ny\n"));
});

test("snapshotBc extracts every category from the fixture", () => {
  const snap = snapshotBc(loadFixture());
  assert.equal(snap.lifecycle, "REFINED");
  assert.deepEqual(snap.scenarios.map((s) => s.key), [
    "@scenario:CART-SUBMIT-001",
    "@scenario:CART-SUBMIT-002",
    "@scenario:CART-LIMIT-001",
  ]);
  assert.equal(snap.scenarios[2].label, "Item quantity limit");
  assert.deepEqual(snap.features.map((f) => f.key), ["Submit a cart", "Cart limits"]);
  assert.deepEqual(snap.rules.map((r) => r.number), [1, 2, 3]);
  assert.match(snap.rules[1].label, /^#2: A cart holds at most 50 items/);
  assert.ok(snap.rules[1].label.length <= "#2: ".length + 80);
  assert.equal(snap.rules[0].key, snap.rules[0].hash);
  assert.ok(!snap.skill.some((s) => s.key === "Core Business Rules"));
  assert.ok(snap.skill.some((s) => s.key === "Purpose"));
  assert.deepEqual(snap.model.map((m) => m.key), ["Cart (Aggregate Root)", "Ports"]);
  assert.deepEqual(snap.ports.map((p) => p.key), ["PaymentPort", "CartSubmittedPublisher"]);
  assert.deepEqual(snap.decisions.map((d) => d.key), ["Idempotent submission"]);
  assert.deepEqual(snap.acls.map((a) => a.key), ["payment-acl.md"]);
  assert.deepEqual(snap.aclSections.map((a) => a.key), [
    "payment-acl.md#Purpose",
    "payment-acl.md#Port Interface",
  ]);
  assert.deepEqual(snap.properties.map((p) => p.key), ["@property:CART-LIMIT-001"]);
  assert.deepEqual(snap.gates.map((g) => g.key), [
    "- -> DISCOVERED|GATE-DISC-BOUNDARY|2026-11-01",
    "- -> DISCOVERED|GATE-PROJ-SYNC|2026-11-01",
    "REFINING -> REFINED|GATE-REF-SPEC|2026-11-09",
    "REFINING -> REFINED|GATE-REF-SPEC|2026-11-09#2",
  ]);
  assert.deepEqual(snap.openItems.map((o) => o.key), ["G1", "Legacy item without id"]);
});

test("placeholder rows, headings and scenarios are ignored", () => {
  const snap = snapshotBc(loadFixture());
  const allKeys = CATEGORIES.flatMap((c) => snap[c].map((i) => i.key)).join("\n");
  assert.ok(!allKeys.includes("YYYY-MM-DD"));
  assert.ok(!allKeys.includes("[...]"));
  assert.ok(!allKeys.includes("<"));
});

test("diffSnapshots of identical inputs is empty", () => {
  const files = loadFixture();
  const diff = diffSnapshots(snapshotBc(files), snapshotBc({ ...files }));
  assert.deepEqual(changedCategories(diff), []);
  assert.equal(diff.lifecycle, undefined);
  assert.deepEqual(diff.summary, { added: 0, removed: 0, modified: 0, moved: 0, changed: false });
});

test("whitespace-only edits are not changes", () => {
  const files = loadFixture();
  const after = edit(files, "SKILL.md", "## Purpose\n", "## Purpose   \n\n\n");
  const reindented = edit(after, "bdd-scenarios.md", "    Then the cart is submitted", "      Then the cart is submitted  ");
  assert.equal(diffSnapshots(snapshotBc(files), snapshotBc(reindented)).summary.changed, false);
});

test("scenario step edit is modified; feature is not", () => {
  const files = loadFixture();
  const after = edit(files, "bdd-scenarios.md", "Then the cart is submitted", "Then the cart is submitted once");
  const diff = diffSnapshots(snapshotBc(files), snapshotBc(after));
  assert.deepEqual(diff.scenarios.modified.map((m) => m.key), ["@scenario:CART-SUBMIT-001"]);
  assert.deepEqual(changedCategories(diff), ["scenarios"]);
});

test("scenario examples edit is modified", () => {
  const files = loadFixture();
  const after = edit(files, "bdd-scenarios.md", "| 51       |", "| 52       |");
  const diff = diffSnapshots(snapshotBc(files), snapshotBc(after));
  assert.deepEqual(diff.scenarios.modified.map((m) => m.key), ["@scenario:CART-LIMIT-001"]);
});

test("new scenario is added", () => {
  const files = loadFixture();
  const after = edit(
    files,
    "bdd-scenarios.md",
    "    Then the cart stays submitted\n",
    "    Then the cart stays submitted\n\n  @scenario:CART-SUBMIT-003\n  Scenario: Empty cart is rejected\n    Given an empty cart\n    When the shopper submits the cart\n    Then submission is rejected\n",
  );
  const diff = diffSnapshots(snapshotBc(files), snapshotBc(after));
  assert.deepEqual(diff.scenarios.added, [
    { key: "@scenario:CART-SUBMIT-003", label: "Empty cart is rejected" },
  ]);
  assert.deepEqual(changedCategories(diff), ["scenarios"]);
  assert.equal(diff.summary.added, 1);
});

test("rule edit is modified, matched by number", () => {
  const files = loadFixture();
  const after = edit(files, "SKILL.md", "at most 50 items", "at most 60 items");
  const diff = diffSnapshots(snapshotBc(files), snapshotBc(after));
  assert.equal(diff.rules.modified.length, 1);
  const [m] = diff.rules.modified;
  assert.equal(m.numberBefore, 2);
  assert.equal(m.numberAfter, 2);
  assert.match(m.label, /60 items/);
  assert.match(m.labelBefore, /50 items/);
  assert.notEqual(m.key, m.previousKey);
  assert.deepEqual(diff.rules.added, []);
  assert.deepEqual(diff.rules.removed, []);
  assert.deepEqual(changedCategories(diff), ["rules"]);
});

test("pure renumbering is unchanged with moved numbers", () => {
  const files = loadFixture();
  const rule2 = /2\. (A cart holds[^\n]*)\n/.exec(files["SKILL.md"])[1];
  const rule3 = /3\. (Only the owner[^\n]*)\n/.exec(files["SKILL.md"])[1];
  const skill = files["SKILL.md"]
    .replace(`2. ${rule2}\n3. ${rule3}\n`, `2. ${rule3}\n3. ${rule2}\n`);
  assert.notEqual(skill, files["SKILL.md"]);
  const diff = diffSnapshots(snapshotBc(files), snapshotBc({ ...files, "SKILL.md": skill }));
  assert.deepEqual(diff.rules.added, []);
  assert.deepEqual(diff.rules.removed, []);
  assert.deepEqual(diff.rules.modified, []);
  assert.deepEqual(
    diff.rules.moved.map((m) => [m.numberBefore, m.numberAfter]).sort(),
    [[2, 3], [3, 2]],
  );
  assert.equal(diff.summary.moved, 2);
  assert.equal(diff.summary.changed, false);
});

test("inserted rule is added and later rules are moved, not modified", () => {
  const files = loadFixture();
  const after = edit(
    files,
    "SKILL.md",
    "2. A cart holds at most 50 items",
    "2. A cart has exactly one owner.\n3. A cart holds at most 50 items",
  );
  const skill = after["SKILL.md"].replace("3. Only the owner", "4. Only the owner");
  const diff = diffSnapshots(snapshotBc(files), snapshotBc({ ...after, "SKILL.md": skill }));
  assert.deepEqual(diff.rules.added.map((a) => a.label), ["#2: A cart has exactly one owner."]);
  assert.deepEqual(diff.rules.modified, []);
  assert.deepEqual(diff.rules.removed, []);
  assert.equal(diff.rules.moved.length, 2);
});

test("removed rule is removed", () => {
  const files = loadFixture();
  const after = edit(files, "SKILL.md", "3. Only the owner may submit a cart.\n", "");
  const diff = diffSnapshots(snapshotBc(files), snapshotBc(after));
  assert.deepEqual(diff.rules.removed.map((r) => r.label), ["#3: Only the owner may submit a cart."]);
});

test("decision added", () => {
  const files = loadFixture();
  const after = {
    ...files,
    "decisions.md": `${files["decisions.md"]}\n## Cart expiry\n\n- **Asked:** Do carts expire?\n- **Findings:** No requirement.\n- **Decision/Action:** No expiry.\n`,
  };
  const diff = diffSnapshots(snapshotBc(files), snapshotBc(after));
  assert.deepEqual(diff.decisions.added, [{ key: "Cart expiry", label: "Cart expiry" }]);
  assert.deepEqual(changedCategories(diff), ["decisions"]);
});

test("gate row added and lifecycle change reported", () => {
  const files = loadFixture();
  const row =
    "| REFINING -> REFINED | GATE-REF-APPROVAL | H | PASS | `SKILL.md` | A. Reviewer (Tech lead) | 2026-11-10 |\n";
  let status = files["status.md"].replace(
    "| REFINING -> REFINED | GATE-REF-SPEC | D | PASS |",
    `${row}| REFINING -> REFINED | GATE-REF-SPEC | D | PASS |`,
  );
  status = status.replace("lifecycle: REFINED", "lifecycle: SPEC_REVIEWED");
  const diff = diffSnapshots(snapshotBc(files), snapshotBc({ ...files, "status.md": status }));
  assert.deepEqual(diff.gates.added.map((g) => g.key), [
    "REFINING -> REFINED|GATE-REF-APPROVAL|2026-11-10",
  ]);
  assert.deepEqual(diff.lifecycle, { from: "REFINED", to: "SPEC_REVIEWED" });
  assert.equal(diff.summary.changed, true);
});

test("port, ACL and open item edits are detected", () => {
  const files = loadFixture();
  let after = edit(files, "domain-model.md", "Authorize payment", "Authorize and capture payment");
  after = edit(after, "payment-acl.md", "authorize(cartId", "authorise(cartId");
  after = edit(after, "status.md", "| Open |", "| Deferred |");
  const diff = diffSnapshots(snapshotBc(files), snapshotBc(after));
  assert.deepEqual(diff.ports.modified.map((p) => p.key), ["PaymentPort"]);
  assert.deepEqual(diff.model.modified.map((p) => p.key), ["Ports"]);
  assert.deepEqual(diff.acls.modified.map((p) => p.key), ["payment-acl.md"]);
  assert.deepEqual(diff.aclSections.modified.map((p) => p.key), ["payment-acl.md#Port Interface"]);
  assert.deepEqual(diff.openItems.modified.map((p) => p.key), ["G1"]);
});

test("missing files produce empty categories and null lifecycle", () => {
  const snap = snapshotBc({});
  assert.equal(snap.lifecycle, null);
  for (const c of CATEGORIES) assert.deepEqual(snap[c], []);
  const partial = snapshotBc({ "SKILL.md": loadFixture()["SKILL.md"] });
  assert.equal(partial.rules.length, 3);
  assert.deepEqual(partial.scenarios, []);
});

test("before = null reports everything as added, sorted by key", () => {
  const files = loadFixture();
  const snap = snapshotBc(files);
  const diff = diffSnapshots(null, snap);
  assert.deepEqual(diff.lifecycle, { from: null, to: "REFINED" });
  for (const c of CATEGORIES) {
    assert.equal(diff[c].added.length, snap[c].length, c);
    const keys = diff[c].added.map((i) => i.key);
    assert.deepEqual(keys, [...keys].sort(), c);
  }
  assert.equal(diff.summary.removed, 0);
});

test("removing everything reports removals", () => {
  const files = loadFixture();
  const diff = diffSnapshots(snapshotBc(files), snapshotBc({}));
  assert.equal(diff.scenarios.removed.length, 3);
  assert.deepEqual(diff.lifecycle, { from: "REFINED", to: null });
});

test("snapshot and diff are deterministic", () => {
  const files = loadFixture();
  const a = snapshotBc(files);
  const b = snapshotBc(loadFixture());
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const after = edit(files, "SKILL.md", "at most 50 items", "at most 60 items");
  const d1 = diffSnapshots(a, snapshotBc(after));
  const d2 = diffSnapshots(b, snapshotBc(after));
  assert.deepEqual(d1, d2);
  assert.equal(JSON.stringify(d1), JSON.stringify(d2));
});
