import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
