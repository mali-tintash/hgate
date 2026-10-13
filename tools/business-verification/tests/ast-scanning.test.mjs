import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EXIT_INVALID, EXIT_VALID, verifyProject } from "../verify.mjs";

const property = `
# Cart Properties

## @property:CART-STATE-001 Terminal carts cannot be reopened

- **Claim:** A submitted cart never returns to ACTIVE.
- **Quantification:** For every reachable state and enabled command.
- **Preconditions:** The initial state is ACTIVE.
- **Oracle:** No transition leaves SUBMITTED for ACTIVE.
- **Oracle source:** \`STATE_INVARIANT\`
- **Oracle independence:** The invariant is derived from the approved lifecycle rule that SUBMITTED is terminal, not from the production transition table.
- **Technique:** \`FINITE_MODEL\`
- **Generator:** \`N/A\`
- **Bounds:** States ACTIVE and SUBMITTED; commands submit and reopen; depth 4.
- **Risk:** \`LOW\`
- **Sensitivity:** \`N/A\`
- **Sensitivity-Waiver:** Exhaustive model; injected reopen edge is covered by the BDD reopen scenario.
`;

async function verifyTests(testSource, extraOptions = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "hgate-ast-"));
  await symlink(
    fileURLToPath(new URL("../../../node_modules", import.meta.url)),
    path.join(root, "node_modules"),
    "dir",
  );
  const files = {
    ".github/skills/cart/properties.md": property,
    "src/cart.spec.ts": testSource,
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }
  return verifyProject({ root, ...extraOptions });
}

const body = `() => { exploreFiniteModel(model); }`;
const live = `it("[PROP:CART-STATE-001] live", ${body});`;

for (const [name, source] of [
  ["describe.skip", `describe.skip("c", () => { ${live} });`],
  ["xdescribe", `xdescribe("c", () => { ${live} });`],
  ["xit", `xit("[PROP:CART-STATE-001] a", ${body});`],
  ["xtest", `xtest("[PROP:CART-STATE-001] a", ${body});`],
  ["it.todo", `it.todo("[PROP:CART-STATE-001] a");`],
  ["describe.skip.each", `describe.skip.each([1])("c %s", () => { ${live} });`],
]) {
  test(`${name} does not count as active property coverage`, async () => {
    const report = await verifyTests(source);

    assert.equal(report.exitCode, EXIT_INVALID);
    assert.equal(report.summary.coveredProperties, 0);
    assert.equal(report.summary.activeTestReferences, 0);
  });
}

test("a regex literal with an apostrophe does not hide later property tests", async () => {
  const report = await verifyTests(`
const re = /'/;
${live}
`);

  assert.equal(report.exitCode, EXIT_VALID);
  assert.equal(report.summary.coveredProperties, 1);
});

test("template literals and comments that mimic executions or tests are ignored", async () => {
  const report = await verifyTests(`
const text = \`exploreFiniteModel(\${1})\`;
// it("[PROP:CART-STATE-001] commented", ${body});
it("[PROP:CART-STATE-001] real", () => {
  // exploreFiniteModel(model);
  const note = "exploreFiniteModel(model)";
});
`);

  assert.deepEqual(
    report.diagnostics.map(({ code }) => code),
    ["PROP006", "PROP011"],
  );
  assert.equal(report.summary.testReferences, 1);
});

test(".only fails with PROP015 and does not count as coverage by default", async () => {
  const report = await verifyTests(`
describe("a", () => { describe.only("b", () => { ${live} }); });
`);

  assert.equal(report.exitCode, 1);
  assert.ok(report.diagnostics.some(({ code }) => code === "PROP015"));
  assert.deepEqual(report.warnings, []);
});

test("allowFocused downgrades .only to a PROP015 warning and keeps coverage", async () => {
  const report = await verifyTests(`
describe("a", () => { describe.only("b", () => { ${live} }); });
`, { allowFocused: true });

  assert.equal(report.exitCode, EXIT_VALID);
  assert.deepEqual(
    report.warnings.map(({ code }) => code),
    ["PROP015"],
  );
});
