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
  const root = await mkdtemp(path.join(tmpdir(), "hgate-bdd-"));

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
it("[BDD:CART-SUBMIT-001] submits a valid cart", async () => {});
test.each<{ problem: string }>([{ problem: "empty" }, { problem: "expired" }])(
  \`[BDD:CART-SUBMIT-002] rejects %s carts\`,
  async () => {},
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
it("[BDD:ORDER-CREATE-999] creates an order", () => {});
it("[BDD:cart-submit-001] uses a malformed marker", () => {});
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
// it("[BDD:CART-SUBMIT-001] commented out", () => {});
const title = "[BDD:CART-SUBMIT-001] helper";
describe("[BDD:CART-SUBMIT-001] suite", () => {});
runner.test("[BDD:CART-SUBMIT-001] non-Jest method", () => {});
it(title, () => {});
it.skip("[BDD:CART-SUBMIT-001] skipped", () => {});
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
it("[BDD:CART-SUBMIT-001] [BDD:ORDER-CREATE-001] completes checkout", () => {});
test.concurrent('[BDD:CART-SUBMIT-001] remains idempotent', () => {});
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
it("[BDD:PAYMENT-CAPTURE-001] captures payment", () => {});
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
it("[BDD:CART-SUBMIT-001] submits a valid cart", () => {});
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
