import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  EXIT_DISCOVERY,
  EXIT_INVALID,
  EXIT_VALID,
  formatJsonReport,
  formatTextReport,
  verifyProject,
} from "../verify.mjs";

const execFileAsync = promisify(execFile);
const verifierPath = fileURLToPath(new URL("../verify.mjs", import.meta.url));

async function createProject(files) {
  const root = await mkdtemp(path.join(tmpdir(), "hgate-properties-"));

  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const filePath = path.join(root, relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
    }),
  );

  return root;
}

const propertyFile = (body) => `
# Cart Verification Properties

${body}
`;

const generatedProperty = (id = "CART-TOTAL-001") => `
## @property:${id} Cart totals remain non-negative

- **Claim:** A valid cart total is never negative.
- **Quantification:** For every valid cart and item collection.
- **Preconditions:** Prices and quantities satisfy their domain invariants.
- **Oracle:** Recalculation returns a total greater than or equal to zero.
- **Technique:** \`PROPERTY\`
- **Generator:** validCartArbitrary
- **Bounds:** \`N/A\`
`;

const finiteModel = (id = "CART-STATE-001") => `
## @property:${id} Terminal carts cannot be reopened

- **Claim:** A submitted cart never returns to ACTIVE.
- **Quantification:** For every reachable state and enabled command.
- **Preconditions:** The initial state is ACTIVE.
- **Oracle:** No transition leaves SUBMITTED for ACTIVE.
- **Technique:** \`FINITE_MODEL\`
- **Generator:** \`N/A\`
- **Bounds:** States ACTIVE and SUBMITTED; commands submit and reopen; depth 4.
`;

test("returns valid for complete declarations covered by active Jest tests", async () => {
  const root = await createProject({
    ".github/skills/cart/properties.md": propertyFile(
      generatedProperty() + finiteModel(),
    ),
    "test/verification/cart/cart.property.spec.ts": `
it("[PROP:CART-TOTAL-001] keeps totals non-negative", () => {});
test("[PROP:CART-STATE-001] exhausts cart transitions", () => {});
`,
  });

  const report = await verifyProject({ root });

  assert.equal(report.exitCode, EXIT_VALID);
  assert.deepEqual(report.diagnostics, []);
  assert.equal(report.summary.properties, 2);
  assert.equal(report.summary.coveredProperties, 2);
  assert.equal(report.summary.propertyTests, 1);
  assert.equal(report.summary.finiteModelTests, 1);
});

test("reports missing, multiple, malformed, and duplicate property IDs", async () => {
  const root = await createProject({
    ".github/skills/cart/properties.md": propertyFile(`
## Property without a marker
${generatedProperty("cart-total-002")}
## @property:CART-TOTAL-003 @property:CART-TOTAL-004 Multiple markers
${generatedProperty("CART-TOTAL-005")}
`),
    ".github/skills/orders/properties.md": propertyFile(
      generatedProperty("CART-TOTAL-005"),
    ),
  });

  const report = await verifyProject({ root });
  const codes = report.diagnostics.map(({ code }) => code);

  assert.equal(report.exitCode, EXIT_INVALID);
  assert.ok(codes.includes("PROP001"));
  assert.ok(codes.includes("PROP002"));
  assert.ok(codes.includes("PROP003"));
  assert.equal(codes.filter((code) => code === "PROP005").length, 2);
});

test("reports incomplete declarations and invalid technique contracts", async () => {
  const root = await createProject({
    ".github/skills/cart/properties.md": propertyFile(`
## @property:CART-TOTAL-001 Missing metadata
- **Claim:** Totals are non-negative.

## @property:CART-TOTAL-002 Invalid generated property
- **Claim:** Totals are non-negative.
- **Quantification:** For every cart.
- **Preconditions:** The cart is valid.
- **Oracle:** The total is non-negative.
- **Technique:** \`PROPERTY\`
- **Generator:** \`N/A\`
- **Bounds:** \`N/A\`

## @property:CART-STATE-001 Invalid finite model
- **Claim:** Terminal states remain terminal.
- **Quantification:** For every state.
- **Preconditions:** The model starts active.
- **Oracle:** No terminal transition is enabled.
- **Technique:** \`FINITE_MODEL\`
- **Generator:** \`N/A\`
- **Bounds:** \`N/A\`
`),
  });

  const report = await verifyProject({ root });

  assert.equal(report.exitCode, EXIT_INVALID);
  assert.ok(
    report.diagnostics.filter(({ code }) => code === "PROP004").length >= 3,
  );
});

test("rejects empty specifications, repeated fields, and technique metadata mismatches", async () => {
  const emptyRoot = await createProject({
    ".github/skills/cart/properties.md": "# Cart Verification Properties\n",
  });
  const invalidRoot = await createProject({
    ".github/skills/cart/properties.md": propertyFile(`
## @property:CART-TOTAL-001
- **Claim:** Totals are non-negative.
- **Claim:** Totals are always valid.
- **Quantification:** For every cart.
- **Preconditions:** The cart is valid.
- **Oracle:** The total is non-negative.
- **Technique:** \`PROPERTY\`
- **Generator:** validCartArbitrary
- **Bounds:** 100 generated runs.

## @property:CART-STATE-001 Terminal states remain terminal
- **Claim:** Terminal states remain terminal.
- **Quantification:** For every reachable state.
- **Preconditions:** The model starts active.
- **Oracle:** No terminal transition is enabled.
- **Technique:** \`FINITE_MODEL\`
- **Generator:** stateArbitrary
- **Bounds:** States ACTIVE and SUBMITTED; commands submit; depth 2.
`),
  });

  const emptyReport = await verifyProject({ root: emptyRoot });
  const invalidReport = await verifyProject({ root: invalidRoot });

  assert.equal(emptyReport.exitCode, EXIT_INVALID);
  assert.ok(
    emptyReport.diagnostics.some(
      ({ code, message }) =>
        code === "PROP004" && message.includes("no property declarations"),
    ),
  );
  assert.equal(invalidReport.exitCode, EXIT_INVALID);
  assert.ok(
    invalidReport.diagnostics.filter(({ code }) => code === "PROP004").length >=
      4,
  );
});

test("reports uncovered properties and orphaned or malformed Jest references", async () => {
  const root = await createProject({
    ".github/skills/cart/properties.md": propertyFile(generatedProperty()),
    "test/verification/cart/cart.property.spec.ts": `
it("[PROP:ORDER-TOTAL-999] references an unknown property", () => {});
it("[PROP:cart-total-001] uses a malformed marker", () => {});
`,
  });

  const report = await verifyProject({ root });
  const codes = report.diagnostics.map(({ code }) => code);

  assert.equal(report.exitCode, EXIT_INVALID);
  assert.ok(codes.includes("PROP006"));
  assert.ok(codes.includes("PROP007"));
  assert.ok(codes.includes("PROP008"));
});

test("does not count comments, helpers, dynamic titles, skipped tests, or todo tests", async () => {
  const root = await createProject({
    ".github/skills/cart/properties.md": propertyFile(generatedProperty()),
    "test/verification/cart/cart.property.spec.ts": `
// it("[PROP:CART-TOTAL-001] commented out", () => {});
const title = "[PROP:CART-TOTAL-001] helper";
describe("[PROP:CART-TOTAL-001] suite", () => {});
runner.test("[PROP:CART-TOTAL-001] non-Jest method", () => {});
it(title, () => {});
it.skip("[PROP:CART-TOTAL-001] skipped", () => {});
test.todo("[PROP:CART-TOTAL-001] todo");
`,
  });

  const report = await verifyProject({ root });

  assert.equal(report.exitCode, EXIT_INVALID);
  assert.ok(report.diagnostics.some(({ code }) => code === "PROP006"));
  assert.equal(report.summary.coveredProperties, 0);
  assert.equal(report.summary.testReferences, 2);
  assert.ok(report.testReferences.every(({ active }) => !active));
});

test("supports configured property and test paths with stable reports", async () => {
  const root = await createProject({
    "specifications/cart/invariants.md": propertyFile(generatedProperty()),
    "acceptance/cart.property.spec.ts": `
it("[PROP:CART-TOTAL-001] checks totals", () => {});
`,
  });

  const defaultReport = await verifyProject({ root });
  const configuredReport = await verifyProject({
    root,
    propertyPaths: ["specifications"],
    testPaths: ["acceptance"],
  });
  const repeatedReport = await verifyProject({
    root,
    propertyPaths: ["specifications"],
    testPaths: ["acceptance"],
  });

  assert.equal(defaultReport.exitCode, EXIT_DISCOVERY);
  assert.equal(configuredReport.exitCode, EXIT_VALID);
  assert.equal(
    formatTextReport(configuredReport),
    formatTextReport(repeatedReport),
  );
  assert.equal(
    formatJsonReport(configuredReport),
    formatJsonReport(repeatedReport),
  );
});

test("CLI emits versioned JSON and documented exit codes", async () => {
  const validRoot = await createProject({
    ".github/skills/cart/properties.md": propertyFile(generatedProperty()),
    "test/verification/cart/cart.property.spec.ts": `
it("[PROP:CART-TOTAL-001] checks totals", () => {});
`,
  });
  const emptyRoot = await createProject({
    "src/example.spec.ts": `it("works", () => {});`,
  });

  const validResult = await execFileAsync(process.execPath, [
    verifierPath,
    "--root",
    validRoot,
    "--format",
    "json",
  ]);
  const validReport = JSON.parse(validResult.stdout);

  assert.equal(validReport.schemaVersion, 1);
  assert.equal(validReport.exitCode, EXIT_VALID);

  await assert.rejects(
    execFileAsync(process.execPath, [verifierPath, "--root", emptyRoot]),
    (error) =>
      error.code === EXIT_DISCOVERY &&
      error.stdout.includes("PROP009") &&
      error.stderr === "",
  );
});
