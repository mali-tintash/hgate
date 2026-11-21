import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generate, buildProjection, validateSchema, ProjectionError } from "../generate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures/example");
const repoRoot = path.resolve(here, "../../..");
const cli = path.join(here, "../generate.mjs");

async function workspace() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hgate-projection-"));
  await cp(fixture, dir, { recursive: true });
  return dir;
}

const run = (root, ...args) =>
  spawnSync(process.execPath, [cli, "--root", root, ...args], { encoding: "utf8" });

test("generator reproduces docs/hgate-project.example.json byte-for-byte", async () => {
  const root = await workspace();
  try {
    await generate({ root });
    const generated = await readFile(path.join(root, "docs/hgate-project.json"), "utf8");
    const example = await readFile(path.join(repoRoot, "docs/hgate-project.example.json"), "utf8");
    assert.equal(generated, example);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repeated runs are idempotent", async () => {
  const root = await workspace();
  try {
    assert.equal((await generate({ root })).status, "written");
    const first = await readFile(path.join(root, "docs/hgate-project.json"), "utf8");
    assert.equal((await generate({ root })).status, "unchanged");
    const second = await readFile(path.join(root, "docs/hgate-project.json"), "utf8");
    assert.equal(first, second);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--check exits 0 when in sync, 1 when missing or stale", async () => {
  const root = await workspace();
  try {
    assert.equal(run(root, "--check").status, 1, "missing file is drift");
    assert.equal(run(root).status, 0);
    assert.equal(run(root, "--check").status, 0);

    const status = path.join(root, ".github/skills/catalog/status.md");
    const text = await readFile(status, "utf8");
    await writeFile(status, text.replace("VERIFIED", "CHANGING"));
    const stale = run(root, "--check");
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /HGP001/);
    assert.match(stale.stderr, /CHANGING/);
    assert.equal(run(root).status, 0);
    assert.equal(run(root, "--check").status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lifecycle comes from status.md, not from any hand-edited JSON", async () => {
  const root = await workspace();
  try {
    await writeFile(
      path.join(root, ".github/skills/orders/status.md"),
      "---\nlifecycle: REFINING\n---\n",
    );
    const projection = await buildProjection(root);
    assert.equal(projection.boundedContexts[1].lifecycle, "REFINING");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generation fails with all problems when sources are inconsistent", async () => {
  const root = await workspace();
  try {
    await rm(path.join(root, ".github/skills/orders/status.md"));
    const map = path.join(root, "docs/context-map.md");
    await writeFile(map, (await readFile(map, "utf8")).replace("`ordering` | Selected", "`ghost` | Selected"));
    await assert.rejects(buildProjection(root), (error) => {
      assert.ok(error instanceof ProjectionError);
      assert.ok(error.problems.some((p) => /status\.md not found/.test(p)));
      assert.ok(error.problems.some((p) => /unknown BC "ghost"/.test(p)));
      return true;
    });
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /HGP002/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("schema validator rejects invalid enum and unexpected properties", async () => {
  const schema = JSON.parse(
    await readFile(path.join(repoRoot, "docs/hgate-project.schema.json"), "utf8"),
  );
  const projection = await buildProjection(fixture);
  assert.deepEqual(validateSchema(projection, schema), []);
  projection.boundedContexts[0].lifecycle = "NOPE";
  projection.extra = true;
  const errors = validateSchema(projection, schema);
  assert.ok(errors.some((e) => /lifecycle/.test(e)));
  assert.ok(errors.some((e) => /unexpected "extra"/.test(e)));
});

test("usage errors exit 2", () => {
  assert.equal(spawnSync(process.execPath, [cli, "--bogus"]).status, 2);
});

// ------------------------------------------------------------ schema v2 lifecycle record

const statusOf = (root, bc) => path.join(root, `.github/skills/${bc}/status.md`);
const bcById = (projection, id) => projection.boundedContexts.find((bc) => bc.id === id);

test("buildProjection should emit schemaVersion 2 with gates, transitions and open items when status.md has them", async () => {
  const projection = await buildProjection(fixture);
  const catalog = bcById(projection, "catalog");
  assert.equal(projection.schemaVersion, 2);
  assert.equal(catalog.transitions.length, 6);
  assert.deepEqual(
    catalog.transitions.map((t) => t.to),
    ["DISCOVERED", "REFINING", "REFINED", "IMPLEMENTING", "IMPLEMENTED", "VERIFIED"],
  );
  assert.equal(catalog.gates.length, 8);
  assert.deepEqual(
    catalog.gates.slice(2, 4).map((g) => g.result),
    ["FAIL", "PASS"],
    "gate rows keep file order (history), not sorted",
  );
  assert.equal(catalog.gates[0].signedBy, "A. Reviewer (Tech lead)");
  assert.equal(catalog.gates[1].signedBy, null);
  assert.deepEqual(
    catalog.openItems.map((item) => item.id),
    ["G3", "G11", "G12", "G13", "OI-1"],
  );
});

test("buildProjection should emit transitions chronologically when Transition History is newest-first", async () => {
  const root = await workspace();
  try {
    const status = path.join(root, ".github/skills/catalog/status.md");
    const text = await readFile(status, "utf8");
    const lines = text.split("\n");
    const start = lines.indexOf("## Transition History") + 4;
    let end = start;
    while (lines[end] && lines[end].startsWith("|")) end += 1;
    const reversed = [...lines.slice(0, start), ...lines.slice(start, end).reverse(), ...lines.slice(end)];
    await writeFile(status, reversed.join("\n"));
    const original = bcById(await buildProjection(fixture), "catalog");
    const catalog = bcById(await buildProjection(root), "catalog");
    assert.deepEqual(catalog.transitions, original.transitions);
    assert.equal(catalog.transitions.at(-1).to, "VERIFIED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildProjection should parse blockers and nextSkill when Current State has them", async () => {
  const projection = await buildProjection(fixture);
  const catalog = bcById(projection, "catalog");
  const ordering = bcById(projection, "ordering");
  assert.deepEqual(catalog.blockers, [
    "Awaiting eCommerce Core sandbox credentials for contract tests",
    "G3 channel fallback owner not named",
  ]);
  assert.equal(catalog.nextSkill, "bc-enhancement", "backticks stripped");
  assert.deepEqual(ordering.blockers, [], '"None" is not a blocker');
  assert.equal(ordering.nextSkill, "bc-review");
});

test("buildProjection should still generate legacy status.md when Gate Evidence and Open Items ID are absent", async () => {
  const projection = await buildProjection(fixture);
  const ordering = bcById(projection, "ordering");
  assert.deepEqual(ordering.gates, []);
  assert.equal(ordering.transitions.length, 2);
  assert.deepEqual(ordering.openItems, [
    { id: null, item: "OMS retry policy for timeouts", owner: "OMS team", disposition: "Open" },
  ]);
});

test("buildProjection should yield empty lifecycle fields when status.md has only frontmatter", async () => {
  const root = await workspace();
  try {
    await writeFile(statusOf(root, "orders"), "---\nlifecycle: REFINING\n---\n");
    const ordering = bcById(await buildProjection(root), "ordering");
    assert.equal(ordering.nextSkill, null);
    assert.deepEqual(ordering.blockers, []);
    assert.deepEqual(ordering.transitions, []);
    assert.deepEqual(ordering.gates, []);
    assert.deepEqual(ordering.openItems, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildProjection should skip unfilled template rows when cells are placeholders", async () => {
  const root = await workspace();
  try {
    const template = await readFile(
      path.join(repoRoot, "skills/bc-refinement/assets/status-template.md"),
      "utf8",
    );
    await writeFile(statusOf(root, "orders"), template);
    const ordering = bcById(await buildProjection(root), "ordering");
    assert.deepEqual(ordering.transitions, [], "YYYY-MM-DD and [...] rows skipped");
    assert.deepEqual(ordering.gates, [], "rows with placeholder signer/date skipped");
    assert.deepEqual(ordering.openItems, [], "[G<n> or OI-<n>] row skipped");
    assert.deepEqual(ordering.blockers, []);
    assert.equal(ordering.nextSkill, "bc-refinement");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildProjection should treat placeholder nextSkill and blockers as absent", async () => {
  const root = await workspace();
  try {
    await writeFile(
      statusOf(root, "orders"),
      [
        "---",
        "lifecycle: IMPLEMENTED",
        "---",
        "",
        "## Current State",
        "",
        "**Blockers:** None",
        "",
        "**Recommended next skill:** `<skill-name>`",
        "",
      ].join("\n"),
    );
    const ordering = bcById(await buildProjection(root), "ordering");
    assert.deepEqual(ordering.blockers, []);
    assert.equal(ordering.nextSkill, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generation should fail with HGP002 listing every problem when gate rows are malformed", async () => {
  const root = await workspace();
  try {
    const file = statusOf(root, "catalog");
    const text = await readFile(file, "utf8");
    const broken = text
      .replace("| - -> DISCOVERED | GATE-DISC-BOUNDARY | H |", "| - -> DISCOVERED | GATE-DISC-BOUNDARY | X |")
      .replace("| GATE-REF-APPROVAL | H | PASS |", "| GATE-REF-APPROVAL | H | MAYBE |")
      .replace("| IMPLEMENTED -> VERIFIED | GATE-VER-REPORT |", "| IMPLEMENTED to VERIFIED | GATE-VER-REPORT |")
      .replace("| IMPLEMENTING -> IMPLEMENTED | GATE-IMPL-PROPS |", "| IMPLEMENTING -> DONE | GATE-IMPL-PROPS |");
    await writeFile(file, broken);
    await assert.rejects(buildProjection(root), (error) => {
      assert.ok(error instanceof ProjectionError);
      assert.equal(error.code, "HGP002");
      assert.ok(error.problems.some((p) => /kind "X"/.test(p)));
      assert.ok(error.problems.some((p) => /result "MAYBE"/.test(p)));
      assert.ok(error.problems.some((p) => /transition "IMPLEMENTED to VERIFIED"/.test(p)));
      assert.ok(error.problems.some((p) => /transition "IMPLEMENTING -> DONE"/.test(p)));
      assert.ok(error.problems.every((p) => /catalog\/status\.md:\d+ Gate Evidence/.test(p)));
      return true;
    });
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /HGP002/);
    assert.equal((result.stderr.match(/^  - /gm) ?? []).length, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildProjection should normalise unicode arrows in gate transitions", async () => {
  const root = await workspace();
  try {
    const file = statusOf(root, "catalog");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replace("| REFINING -> REFINED | GATE-REF-APPROVAL |", "| REFINING → REFINED | GATE-REF-APPROVAL |"));
    const catalog = bcById(await buildProjection(root), "catalog");
    assert.equal(catalog.gates[4].transition, "REFINING -> REFINED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generate should fail with HGP003 upgrade message when the local schema is version 1", async () => {
  const root = await workspace();
  try {
    const schema = JSON.parse(
      await readFile(path.join(repoRoot, "docs/hgate-project.schema.json"), "utf8"),
    );
    schema.properties.schemaVersion.const = 1;
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "docs/hgate-project.schema.json"), JSON.stringify(schema));
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /HGP003/);
    assert.match(result.stderr, /schemaVersion 1/);
    assert.match(result.stderr, /upgrade/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validateSchema should accept type arrays when value matches one of them", () => {
  const schema = { type: "object", properties: { a: { type: ["string", "null"] } } };
  assert.deepEqual(validateSchema({ a: null }, schema), []);
  assert.deepEqual(validateSchema({ a: "x" }, schema), []);
  assert.equal(validateSchema({ a: 1 }, schema).length, 1);
});

// ------------------------------------------------------------ gateStatus
// Per-BC gateStatus applies the Validity Rules of lifecycle-gates.md through
// tools/shared/gate-rules.mjs (the same code verify-spec uses).

const VER_REPORT_ROW =
  "| IMPLEMENTED -> VERIFIED | GATE-VER-REPORT | H | PASS | `docs/verification/bc-reviews/catalog/2026-11-20-full.md` | A. Reviewer (Tech lead) | 2026-11-20 |";
const VER_SYNC_ROW = "| IMPLEMENTED -> VERIFIED | GATE-PROJ-SYNC | D | PASS | `npm run project:check` in-sync | - | 2026-11-20 |";

async function catalogGateStatus(edit) {
  const root = await workspace();
  try {
    const file = path.join(root, ".github/skills/catalog/status.md");
    const text = await readFile(file, "utf8");
    const edited = edit(text);
    assert.notEqual(edited, text, "edit must change status.md");
    await writeFile(file, edited);
    const projection = await buildProjection(root);
    return projection.boundedContexts.find((bc) => bc.id === "catalog").gateStatus;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const gateOf = (status, gate) => status.required.find((item) => item.gate === gate);

test("gateStatus should be valid with every required gate satisfied for the current transition", async () => {
  const projection = await buildProjection(fixture);
  const catalog = projection.boundedContexts.find((bc) => bc.id === "catalog").gateStatus;
  assert.equal(catalog.transition, "IMPLEMENTED -> VERIFIED");
  assert.deepEqual(
    catalog.required.map((item) => item.gate),
    ["GATE-VER-REPORT", "GATE-PROJ-SYNC"],
  );
  assert.equal(catalog.satisfied, 2);
  assert.equal(catalog.total, 2);
  assert.equal(catalog.valid, true);
  const ordering = projection.boundedContexts.find((bc) => bc.id === "ordering").gateStatus;
  assert.equal(ordering.total, 3, "legacy status.md: required gates still counted");
  assert.equal(ordering.satisfied, 0);
  assert.equal(ordering.valid, false);
  assert.deepEqual(ordering.optional.map((item) => item.gate), ["GATE-IMPL-PROPS"]);
});

test("gateStatus should count a missing required gate row as unmet", async () => {
  const status = await catalogGateStatus((text) => text.replace(`${VER_REPORT_ROW}\n`, ""));
  assert.equal(status.total, 2);
  assert.equal(status.satisfied, 1);
  assert.equal(status.valid, false);
  assert.deepEqual(gateOf(status, "GATE-VER-REPORT"), {
    gate: "GATE-VER-REPORT",
    kind: "H",
    result: null,
    date: null,
    satisfied: false,
  });
});

test("gateStatus should treat N/A on a required gate as unmet", async () => {
  const status = await catalogGateStatus((text) =>
    text.replace(VER_SYNC_ROW, VER_SYNC_ROW.replace("| PASS |", "| N/A |")),
  );
  assert.equal(gateOf(status, "GATE-PROJ-SYNC").result, "N/A");
  assert.equal(gateOf(status, "GATE-PROJ-SYNC").satisfied, false);
  assert.equal(status.satisfied, 1);
  assert.equal(status.valid, false);
});

test("gateStatus should let a later PASS supersede an earlier FAIL", async () => {
  const fail = VER_REPORT_ROW.replace("| PASS |", "| FAIL |").replace("A. Reviewer (Tech lead)", "-");
  const status = await catalogGateStatus((text) => text.replace(VER_REPORT_ROW, `${fail}\n${VER_REPORT_ROW}`));
  assert.equal(gateOf(status, "GATE-VER-REPORT").result, "PASS");
  assert.equal(status.satisfied, 2);
  assert.equal(status.valid, true);
});

test("gateStatus should ignore a row dated before the current transition", async () => {
  const status = await catalogGateStatus((text) =>
    text.replace(VER_REPORT_ROW, VER_REPORT_ROW.replace("| 2026-11-20 |", "| 2026-11-19 |")),
  );
  assert.deepEqual(gateOf(status, "GATE-VER-REPORT"), {
    gate: "GATE-VER-REPORT",
    kind: "H",
    result: null,
    date: null,
    satisfied: false,
  });
  assert.equal(status.valid, false);
});

test("gateStatus should be null when the project has no gate catalog", async () => {
  const root = await workspace();
  try {
    await rm(path.join(root, ".github/skills/hgate-guide"), { recursive: true, force: true });
    const projection = await buildProjection(root);
    for (const bc of projection.boundedContexts) assert.equal(bc.gateStatus, null, bc.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
