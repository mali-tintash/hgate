import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
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

async function createProject(files, { withTypescript = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "hgate-bdd-"));
  if (withTypescript) {
    await symlink(
      fileURLToPath(new URL("../../../node_modules", import.meta.url)),
      path.join(root, "node_modules"),
      "dir",
    );
  }

  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const filePath = path.join(root, relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
    }),
  );

  return root;
}

const scenarioFile = (body) => `
# Cart BDD Scenarios

\`\`\`gherkin
Feature: Cart submission
${body}
\`\`\`
`;

test("returns valid for unique scenarios covered by active Jest tests", async () => {
  const root = await createProject({
    ".github/skills/cart/bdd-scenarios.md": scenarioFile(`
  @critical @scenario:CART-SUBMIT-001
  Scenario: Submit a valid cart
    Given a valid cart
    When it is submitted
    Then an order is created

  @scenario:CART-SUBMIT-002
  Scenario Outline: Reject invalid carts
    Given a cart with <problem>
    When it is submitted
    Then submission is rejected
`),
    "src/cart/cart.service.spec.ts": `
it("[BDD:CART-SUBMIT-001] submits a valid cart", async () => { expect(1).toBe(1); });
test.each<{ problem: string }>([{ problem: "empty" }, { problem: "expired" }])(
  \`[BDD:CART-SUBMIT-002] rejects %s carts\`,
  async () => { expect(1).toBe(1); },
);
`,
  });

  const report = await verifyProject({ root });

  assert.equal(report.exitCode, EXIT_VALID);
  assert.deepEqual(report.diagnostics, []);
  assert.equal(report.summary.scenarios, 2);
  assert.equal(report.summary.coveredScenarios, 2);
  assert.equal(report.summary.testReferences, 2);
});

test("reports missing, multiple, malformed, and duplicate scenario IDs", async () => {
  const root = await createProject({
    ".github/skills/cart/bdd-scenarios.md": scenarioFile(`
  Scenario: Missing identifier
    Given a cart
    Then it is invalid

  @scenario:cart-submit-002
  Scenario: Malformed identifier
    Given a cart
    Then it is invalid

  @scenario:CART-SUBMIT-003 @scenario:CART-SUBMIT-004
  Scenario: Multiple identifiers
    Given a cart
    Then it is invalid

  @scenario:CART-SUBMIT-005
  Scenario: First duplicate
    Given a cart
    Then it is invalid
`),
    ".github/skills/orders/bdd-scenarios.md": scenarioFile(`
  @scenario:CART-SUBMIT-005
  Scenario: Second duplicate
    Given a cart
    Then it is invalid
`),
  });

  const report = await verifyProject({ root });
  const codes = report.diagnostics.map(({ code }) => code);

  assert.equal(report.exitCode, EXIT_INVALID);
  assert.ok(codes.includes("BDD001"));
  assert.ok(codes.includes("BDD002"));
  assert.ok(codes.includes("BDD003"));
  assert.equal(codes.filter((code) => code === "BDD004").length, 2);
});

test("reports uncovered scenarios and orphaned or malformed Jest references", async () => {
  const root = await createProject({
    ".github/skills/cart/bdd-scenarios.md": scenarioFile(`
  @scenario:CART-SUBMIT-001
  Scenario: Submit a valid cart
    Given a cart
    Then it is submitted
`),
    "src/cart/cart.service.spec.ts": `
it("[BDD:ORDER-CREATE-999] creates an order", () => { expect(1).toBe(1); });
it("[BDD:cart-submit-001] uses a malformed marker", () => { expect(1).toBe(1); });
`,
  });

  const report = await verifyProject({ root });
  const codes = report.diagnostics.map(({ code }) => code);

  assert.equal(report.exitCode, EXIT_INVALID);
  assert.ok(codes.includes("BDD005"));
  assert.ok(codes.includes("BDD006"));
  assert.ok(codes.includes("BDD007"));
});

test("does not count comments, describe blocks, helpers, dynamic titles, skipped tests, or todo tests", async () => {
  const root = await createProject({
    ".github/skills/cart/bdd-scenarios.md": scenarioFile(`
  @scenario:CART-SUBMIT-001
  Scenario: Submit a valid cart
    Given a cart
    Then it is submitted
`),
    "src/cart/cart.service.spec.ts": `
// it("[BDD:CART-SUBMIT-001] commented out", () => { expect(1).toBe(1); });
const title = "[BDD:CART-SUBMIT-001] helper";
describe("[BDD:CART-SUBMIT-001] suite", () => { expect(1).toBe(1); });
runner.test("[BDD:CART-SUBMIT-001] non-Jest method", () => { expect(1).toBe(1); });
it(title, () => {});
it.skip("[BDD:CART-SUBMIT-001] skipped", () => { expect(1).toBe(1); });
test.todo("[BDD:CART-SUBMIT-001] todo");
`,
  });

  const report = await verifyProject({ root });

  assert.equal(report.exitCode, EXIT_INVALID);
  assert.ok(report.diagnostics.some(({ code }) => code === "BDD005"));
  assert.equal(report.summary.coveredScenarios, 0);
  assert.equal(report.summary.testReferences, 2);
  assert.ok(report.testReferences.every(({ active }) => !active));
});

test("supports multiple IDs per test, multiple tests per ID, and stable reports", async () => {
  const root = await createProject({
    ".github/skills/cart/bdd-scenarios.md": scenarioFile(`
  @scenario:CART-SUBMIT-001
  Scenario: Submit a valid cart
    Given a cart
    Then it is submitted

  @scenario:ORDER-CREATE-001
  Scenario: Create an order
    Given a submitted cart
    Then an order is created
`),
    "src/cart/cart.service.spec.ts": `
it("[BDD:CART-SUBMIT-001] [BDD:ORDER-CREATE-001] completes checkout", () => { expect(1).toBe(1); });
test.concurrent('[BDD:CART-SUBMIT-001] remains idempotent', () => { expect(1).toBe(1); });
`,
  });

  const first = await verifyProject({ root });
  const second = await verifyProject({ root });

  assert.equal(first.exitCode, EXIT_VALID);
  assert.equal(first.summary.testReferences, 3);
  assert.equal(formatTextReport(first), formatTextReport(second));
  assert.equal(formatJsonReport(first), formatJsonReport(second));
});

test("supports explicit downstream scenario and test paths", async () => {
  const root = await createProject({
    "specifications/payments/behaviour.md": scenarioFile(`
  @scenario:PAYMENT-CAPTURE-001
  Scenario: Capture payment
    Given an authorized payment
    Then it is captured
`),
    "acceptance/payment.spec.ts": `
it("[BDD:PAYMENT-CAPTURE-001] captures payment", () => { expect(1).toBe(1); });
`,
  });

  const defaultReport = await verifyProject({ root });
  const configuredReport = await verifyProject({
    root,
    scenarioPaths: ["specifications"],
    testPaths: ["acceptance"],
  });

  assert.equal(defaultReport.exitCode, EXIT_DISCOVERY);
  assert.equal(configuredReport.exitCode, EXIT_VALID);
});

test("returns discovery failure when no scenario specification files exist", async () => {
  const root = await createProject({
    "src/example.spec.ts": `it("works", () => {});`,
  });

  const report = await verifyProject({ root });

  assert.equal(report.exitCode, EXIT_DISCOVERY);
  assert.ok(report.diagnostics.some(({ code }) => code === "BDD008"));
});

test("CLI emits versioned JSON and uses the documented exit codes", async () => {
  const validRoot = await createProject({
    ".github/skills/cart/bdd-scenarios.md": scenarioFile(`
  @scenario:CART-SUBMIT-001
  Scenario: Submit a valid cart
    Given a cart
    Then it is submitted
`),
    "src/cart/cart.service.spec.ts": `
it("[BDD:CART-SUBMIT-001] submits a valid cart", () => { expect(1).toBe(1); });
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
      error.stdout.includes("BDD008") &&
      error.stderr === "",
  );
});

const singleScenario = {
  ".github/skills/cart/bdd-scenarios.md": scenarioFile(`
  @scenario:CART-SUBMIT-001
  Scenario: Submit a valid cart
    Given a valid cart
    When it is submitted
    Then an order is created
`),
};

async function verifyTests(testSource, extraOptions = {}) {
  const root = await createProject({
    ...singleScenario,
    "src/cart/cart.service.spec.ts": testSource,
  });
  return verifyProject({ root, ...extraOptions });
}

for (const [name, source] of [
  ["describe.skip", `describe.skip("cart", () => { it("[BDD:CART-SUBMIT-001] a", () => { expect(1).toBe(1); }); });`],
  ["xdescribe", `xdescribe("cart", () => { it("[BDD:CART-SUBMIT-001] a", () => { expect(1).toBe(1); }); });`],
  ["xit", `xit("[BDD:CART-SUBMIT-001] a", () => { expect(1).toBe(1); });`],
  ["xtest", `xtest("[BDD:CART-SUBMIT-001] a", () => { expect(1).toBe(1); });`],
  ["it.todo", `it.todo("[BDD:CART-SUBMIT-001] a");`],
  ["test.todo", `test.todo("[BDD:CART-SUBMIT-001] a");`],
  ["describe.each skip", `describe.skip.each([1, 2])("cart %s", () => { it("[BDD:CART-SUBMIT-001] a", () => { expect(1).toBe(1); }); });`],
  ["nested skipped describe", `describe("outer", () => { describe.skip("inner", () => { it("[BDD:CART-SUBMIT-001] a", () => { expect(1).toBe(1); }); }); });`],
]) {
  test(`${name} does not count as active BDD coverage`, async () => {
    const report = await verifyTests(source);

    assert.equal(report.exitCode, EXIT_INVALID);
    assert.deepEqual(
      report.diagnostics.map(({ code }) => code),
      ["BDD005"],
    );
  });
}

test("a sibling active test still covers a scenario next to a skipped describe", async () => {
  const report = await verifyTests(`
describe.skip("old", () => { it("[BDD:CART-SUBMIT-001] a", () => { expect(1).toBe(1); }); });
describe("current", () => { it("[BDD:CART-SUBMIT-001] b", () => { expect(1).toBe(1); }); });
`);

  assert.equal(report.exitCode, EXIT_VALID);
});

test("a regex literal containing an apostrophe does not hide later tests", async () => {
  const report = await verifyTests(`
const re = /'/;
const quote = "it's";
it("[BDD:CART-SUBMIT-001] a", () => { expect(1).toBe(1); });
`);

  assert.equal(report.exitCode, EXIT_VALID);
  assert.equal(report.summary.coveredScenarios, 1);
});

test("template literals, comments and strings that mimic tests are ignored", async () => {
  const report = await verifyTests(`
// it("[BDD:CART-SUBMIT-001] in a line comment", () => { expect(1).toBe(1); });
/* it("[BDD:CART-SUBMIT-001] in a block comment", () => { expect(1).toBe(1); }); */
const text = \`it("[BDD:CART-SUBMIT-001] in a template \${1 + 1}", () => { expect(1).toBe(1); })\`;
const other = 'it("[BDD:CART-SUBMIT-001] in a string", () => { expect(1).toBe(1); })';
`);

  assert.equal(report.testReferences.length, 0);
  assert.deepEqual(
    report.diagnostics.map(({ code }) => code),
    ["BDD005"],
  );
});

test("tests nested inside several describes are discovered with their lines", async () => {
  const report = await verifyTests(`
describe("a", () => {
  describe("b", () => {
    it(\`[BDD:CART-SUBMIT-001] nested\`, () => { expect(1).toBe(1); });
  });
});
`);

  assert.equal(report.exitCode, EXIT_VALID);
  assert.equal(report.testReferences[0].line, 4);
});

test(".only fails with BDD010 and does not count as coverage by default", async () => {
  const report = await verifyTests(`
describe.only("cart", () => { it("[BDD:CART-SUBMIT-001] a", () => { expect(1).toBe(1); }); });
`);

  assert.equal(report.exitCode, EXIT_INVALID);
  assert.deepEqual(
    report.diagnostics.map(({ code }) => code),
    ["BDD005", "BDD010"],
  );
  assert.deepEqual(report.warnings, []);
});

test("allowFocused downgrades .only to a BDD010 warning and keeps coverage", async () => {
  const report = await verifyTests(`
describe.only("cart", () => { it("[BDD:CART-SUBMIT-001] a", () => { expect(1).toBe(1); }); });
`, { allowFocused: true });

  assert.equal(report.exitCode, EXIT_VALID);
  assert.deepEqual(
    report.warnings.map(({ code }) => code),
    ["BDD010"],
  );
  assert.match(formatTextReport(report), /BDD010 .* warning: /);
});

test("a missing typescript package fails with a BDD009 diagnostic and exit 2", async () => {
  const root = await createProject(
    {
      ...singleScenario,
      "src/cart/cart.service.spec.ts": `it("[BDD:CART-SUBMIT-001] a", () => { expect(1).toBe(1); });`,
    },
    { withTypescript: false },
  );

  await assert.rejects(
    execFileAsync(process.execPath, [verifierPath, "--root", root]),
    (error) =>
      error.code === EXIT_DISCOVERY &&
      error.stderr.includes("BDD009") &&
      error.stderr.includes("typescript"),
  );
});
