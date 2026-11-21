import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildProjection } from "../generate.mjs";
import {
  classifyDisposition,
  compareGapIds,
  formatWarnings,
  gapIdFromText,
  mergeGaps,
} from "../../shared/gaps.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures/example");
const cli = path.join(here, "../generate.mjs");

async function workspace() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hgate-gaps-"));
  await cp(fixture, dir, { recursive: true });
  return dir;
}

const run = (root, env = {}, ...args) =>
  spawnSync(process.execPath, [cli, "--root", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_ACTIONS: "", ...env },
  });

const bcById = (projection, id) => projection.boundedContexts.find((bc) => bc.id === id);
const gapById = (projection, id) => projection.gaps.find((gap) => gap.id === id);

// ------------------------------------------------------------ shared gap logic

test("classifyDisposition should map resolved, partial, deferred and other text to states", () => {
  assert.equal(classifyDisposition("Resolved (no forgetting)"), "RESOLVED");
  assert.equal(classifyDisposition("Resolved for Pet Mind (synchronous); Companion to confirm"), "RESOLVED");
  assert.equal(classifyDisposition("Out of scope"), "RESOLVED");
  assert.equal(classifyDisposition("Deferred to bc-refinement"), "DEFERRED");
  assert.equal(classifyDisposition("Open"), "OPEN");
  assert.equal(classifyDisposition(""), "OPEN");
  assert.equal(classifyDisposition(undefined), "OPEN");
});

test("gapIdFromText should return a leading G<n> when present and null otherwise", () => {
  assert.equal(gapIdFromText("G11 Personality trait list"), "G11");
  assert.equal(gapIdFromText("`G7` Something"), "G7");
  assert.equal(gapIdFromText("Cross-BC needs for G11"), null);
  assert.equal(gapIdFromText("OI-1 cache"), null);
});

test("compareGapIds should order gap IDs naturally", () => {
  assert.deepEqual(["G11", "G2", "OI-1", "G3"].sort(compareGapIds), ["G2", "G3", "G11", "OI-1"]);
});

test("mergeGaps should return empty ledger when there are no sources", () => {
  assert.deepEqual(mergeGaps([]), { gaps: [], diagnostics: [] });
});

test("mergeGaps should derive state and emit HGW001 when sources disagree", () => {
  const { gaps, diagnostics } = mergeGaps([
    { id: "G1", gap: "A", affected: "Both", file: "docs/domain-map.md", line: 5, disposition: "Deferred" },
    { id: "G1", gap: "A again", file: "s/status.md", line: 9, bc: "mind", disposition: "Resolved for Mind" },
    { id: "G2", gap: "B", file: "docs/domain-map.md", line: 6, disposition: "Open" },
    { id: "G2", gap: "", file: "docs/context-map.md", line: 3, disposition: "Open" },
  ]);
  assert.deepEqual(gaps.map((g) => [g.id, g.state]), [["G1", "MIXED"], ["G2", "OPEN"]]);
  assert.equal(gaps[0].gap, "A", "text from the first source that has it");
  assert.equal(gaps[0].affected, "Both");
  assert.equal(gaps[1].affected, null);
  assert.deepEqual(gaps[0].sources[1], {
    file: "s/status.md",
    line: 9,
    bc: "mind",
    owner: "",
    disposition: "Resolved for Mind",
  });
  assert.equal(diagnostics.length, 1);
  assert.deepEqual(
    { ...diagnostics[0], message: undefined },
    { code: "HGW001", severity: "warning", message: undefined, file: "docs/domain-map.md", line: 5, bcId: null, gapId: "G1" },
  );
});

test("mergeGaps should emit HGW002 per BC source when a gap is absent from the maps", () => {
  const { gaps, diagnostics } = mergeGaps([
    { id: "G9", gap: "X", file: "b/status.md", line: 4, bc: "b", disposition: "Open" },
    { id: "G9", gap: "X", file: "a/status.md", line: 7, bc: "a", disposition: "Open" },
  ]);
  assert.equal(gaps[0].state, "OPEN");
  assert.deepEqual(
    diagnostics.map((d) => [d.code, d.file, d.bcId]),
    [["HGW002", "a/status.md", "a"], ["HGW002", "b/status.md", "b"]],
    "sorted by code, file, line",
  );
});

test("formatWarnings should return nothing when there are no diagnostics", () => {
  assert.deepEqual(formatWarnings([]), []);
  assert.deepEqual(formatWarnings([], { github: true }), []);
});

test("formatWarnings should put GitHub annotations before the trailing WARNINGS block", () => {
  const lines = formatWarnings(
    [{ code: "HGW001", file: "docs/a,b.md", line: 3, message: "50% done\nnext" }],
    { github: true },
  );
  assert.deepEqual(lines, [
    "::warning file=docs/a%2Cb.md,line=3,title=HGW001::50%25 done%0Anext",
    "WARNINGS (1)",
    "  HGW001 docs/a,b.md:3 50% done\nnext",
  ]);
});

// ------------------------------------------------------------ projection ledger

test("buildProjection should reproduce the live-pet G11-G13 drift as HGW001 warnings", async () => {
  const projection = await buildProjection(fixture);
  for (const id of ["G11", "G12", "G13"]) {
    const gap = gapById(projection, id);
    assert.equal(gap.state, "MIXED", id);
    assert.deepEqual(
      gap.sources.map((s) => [s.file, s.bc]),
      [["docs/domain-map.md", null], [".github/skills/catalog/status.md", "catalog"]],
    );
    assert.match(gap.sources[0].disposition, /^Deferred to /);
    assert.match(gap.sources[1].disposition, /^Resolved/);
  }
  assert.deepEqual(
    projection.diagnostics.map((d) => [d.code, d.gapId, d.file, d.line]),
    [
      ["HGW001", "G11", "docs/domain-map.md", 31],
      ["HGW001", "G12", "docs/domain-map.md", 32],
      ["HGW001", "G13", "docs/domain-map.md", 33],
    ],
  );
  assert.equal(gapById(projection, "G3").state, "DEFERRED", "agreeing sources are not drift");
  assert.equal(gapById(projection, "G14").state, "OPEN");
  assert.equal(gapById(projection, "G14").affected, "catalog-to-ordering-product-selection");
  assert.equal(gapById(projection, "G15").state, "RESOLVED", "partial resolution counts as resolved");
  assert.equal(projection.gaps.some((g) => g.id === "OI-1"), false, "local items stay out of the ledger");
});

test("buildProjection should join legacy item-text gap IDs and flag gaps missing from the maps", async () => {
  const root = await workspace();
  try {
    await writeFile(
      path.join(root, ".github/skills/orders/status.md"),
      [
        "---",
        "lifecycle: DISCOVERED",
        "---",
        "",
        "## Open Items",
        "",
        "| Item | Owner | Disposition |",
        "|---|---|---|",
        "| G15 Sync vs async product lookup | Product owner | Deferred |",
        "| G20 Order numbering | Product owner | Open |",
        "| Cross-BC needs for G15 | Product owner | See decisions |",
        "",
      ].join("\n"),
    );
    const projection = await buildProjection(root);
    const g15 = gapById(projection, "G15");
    assert.equal(g15.state, "MIXED", "Resolved for Catalog vs Deferred is drift");
    assert.deepEqual(g15.sources.map((s) => s.bc), [null, "ordering"]);
    assert.equal(gapById(projection, "G20").state, "OPEN");
    const codes = projection.diagnostics.map((d) => [d.code, d.gapId, d.bcId]);
    assert.ok(codes.some(([c, g]) => c === "HGW001" && g === "G15"));
    assert.deepEqual(codes.filter(([c]) => c === "HGW002"), [["HGW002", "G20", "ordering"]]);
    assert.equal(bcById(projection, "ordering").stats.openGaps, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildProjection should emit empty gaps and diagnostics when no gap tables exist", async () => {
  const root = await workspace();
  try {
    const strip = async (file, heading) => {
      const full = path.join(root, file);
      const text = await readFile(full, "utf8");
      await writeFile(full, text.slice(0, text.indexOf(heading)));
    };
    await strip("docs/domain-map.md", "## Open Boundary Gaps");
    await strip("docs/context-map.md", "## Open Relationship Gaps");
    await strip(".github/skills/catalog/status.md", "## Open Items");
    const projection = await buildProjection(root);
    assert.deepEqual(projection.gaps, []);
    assert.deepEqual(projection.diagnostics, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI should print the WARNINGS block last and exit 0 for sync and check", async () => {
  const root = await workspace();
  try {
    const sync = run(root);
    assert.equal(sync.status, 0);
    const lines = sync.stdout.trimEnd().split("\n");
    assert.equal(lines[0], "docs/hgate-project.json: written");
    assert.equal(lines[1], "WARNINGS (3)");
    assert.equal(lines.length, 5);
    assert.match(lines[2], /^  HGW001 docs\/domain-map\.md:31 gap G11 /);
    assert.doesNotMatch(sync.stdout, /::warning/);

    const check = run(root, {}, "--check");
    assert.equal(check.status, 0);
    assert.match(check.stdout, /in-sync\nWARNINGS \(3\)\n/);
    assert.match(check.stdout.trimEnd().split("\n").at(-1), /G13/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI should emit ::warning annotations when running in GitHub Actions", async () => {
  const root = await workspace();
  try {
    const result = run(root, { GITHUB_ACTIONS: "true" });
    assert.equal(result.status, 0);
    const lines = result.stdout.trimEnd().split("\n");
    assert.equal(lines.filter((l) => l.startsWith("::warning file=docs/domain-map.md,line=")).length, 3);
    assert.equal(lines.at(-4), "WARNINGS (3)", "human-readable block stays last");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI should print no WARNINGS block when there are no diagnostics", async () => {
  const root = await workspace();
  try {
    const map = path.join(root, "docs/domain-map.md");
    const text = await readFile(map, "utf8");
    await writeFile(map, text.replace(/Deferred to [a-z-]+/g, "Resolved"));
    const result = run(root);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "docs/hgate-project.json: written\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI should append warnings after the HGP001 drift report", async () => {
  const root = await workspace();
  try {
    const result = run(root, {}, "--check");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /HGP001[\s\S]*WARNINGS \(3\)\n(  HGW001 .*\n){3}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------ stats and sign-offs

test("buildProjection should report zero stats and no sign-offs when artifacts are absent", async () => {
  const ordering = bcById(await buildProjection(fixture), "ordering");
  assert.deepEqual(ordering.stats, {
    rules: 0,
    features: 0,
    scenarios: 0,
    decisions: 0,
    properties: 0,
    acls: 0,
    ports: 1,
    openItems: 1,
    openGaps: 0,
  });
  assert.deepEqual(ordering.signoffs, []);
});

test("buildProjection should count many artifacts and index sign-offs by path", async () => {
  const catalog = bcById(await buildProjection(fixture), "catalog");
  assert.deepEqual(catalog.stats, {
    rules: 3,
    features: 2,
    scenarios: 3,
    decisions: 2,
    properties: 1,
    acls: 1,
    ports: 1,
    openItems: 2,
    openGaps: 4,
  });
  assert.deepEqual(catalog.signoffs, [
    { kind: "review", file: "docs/verification/bc-reviews/catalog/2026-11-12-spec-only.md", date: "2026-11-12", outcome: "FAIL" },
    { kind: "review", file: "docs/verification/bc-reviews/catalog/2026-11-20-full.md", date: "2026-11-20", outcome: "PASS" },
    { kind: "bdd", file: "docs/verification/bdd-signoffs/catalog/2026-11-18-initial-implementation.md", date: "2026-11-18", status: "SIGNED_OFF" },
  ]);
});

test("buildProjection should count one of each artifact and find sign-offs by BC folder name", async () => {
  const root = await workspace();
  try {
    const dir = path.join(root, ".github/skills/orders");
    await writeFile(path.join(dir, "SKILL.md"), "# Ordering\n\n## Purpose\nSubmit orders.\n\n## Core Business Rules\n\n1. Orders need an approved cart.\n");
    await writeFile(path.join(dir, "bdd-scenarios.md"), "Feature: Create order\n\n  @scenario:ORD-CREATE-001\n  Scenario: Create\n    Given x\n");
    await writeFile(path.join(dir, "decisions.md"), "# Decisions\n\n## 2026-10-01 OMS owns orders\n\nDecision.\n");
    await writeFile(path.join(dir, "properties.md"), "## @property:ORD-TOTAL-001 Totals non-negative\n");
    const verification = path.join(root, "docs/verification");
    for (const [sub, name, body] of [
      ["bdd-signoffs/orders", "2026-10-20-initial.md", "---\nstatus: SIGNED_OFF\n---\n"],
      ["property-signoffs/orders", "2026-10-21-props.md", "---\nstatus: SIGNED_OFF\n---\n"],
      ["bc-reviews/ordering", "notes.md", "# no frontmatter\n"],
    ]) {
      await mkdir(path.join(verification, sub), { recursive: true });
      await writeFile(path.join(verification, sub, name), body);
    }
    await writeFile(path.join(verification, "bdd-signoffs/orders/README.txt"), "ignored");
    const ordering = bcById(await buildProjection(root), "ordering");
    assert.deepEqual(
      [ordering.stats.rules, ordering.stats.features, ordering.stats.scenarios, ordering.stats.decisions, ordering.stats.properties],
      [1, 1, 1, 1, 1],
    );
    assert.deepEqual(ordering.signoffs, [
      { kind: "review", file: "docs/verification/bc-reviews/ordering/notes.md", date: null },
      { kind: "bdd", file: "docs/verification/bdd-signoffs/orders/2026-10-20-initial.md", date: "2026-10-20", status: "SIGNED_OFF" },
      { kind: "business", file: "docs/verification/property-signoffs/orders/2026-10-21-props.md", date: "2026-10-21", status: "SIGNED_OFF" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
