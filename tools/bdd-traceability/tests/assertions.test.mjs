import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { verifyProject } from "../verify.mjs";

const scenarioSource = `
# Cart BDD Scenarios

\`\`\`gherkin
@scenario:CART-SUBMIT-001
Scenario: Submit a valid cart
  Given a valid cart
  When it is submitted
  Then it is accepted
\`\`\`
`;

async function verifyTests(testSource) {
  const root = await mkdtemp(path.join(tmpdir(), "hgate-bdd-assert-"));
  await symlink(
    fileURLToPath(new URL("../../../node_modules", import.meta.url)),
    path.join(root, "node_modules"),
    "dir",
  );
  const files = {
    ".github/skills/cart/bdd-scenarios.md": scenarioSource,
    "src/cart/cart.service.spec.ts": testSource,
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }
  return verifyProject({ root });
}

const codes = (report) => report.diagnostics.map(({ code }) => code);

for (const [name, body] of [
  ["empty body", `it("[BDD:CART-SUBMIT-001] a", () => {});`],
  [
    "comment-only body",
    `it("[BDD:CART-SUBMIT-001] a", () => { // expect(submit()).toBe(1)\n  /* assert(true) */ });`,
  ],
  [
    "non-asserting body",
    `it("[BDD:CART-SUBMIT-001] a", () => { const x = submit(); console.log(x); });`,
  ],
  [
    "expect.assertions alone",
    `it("[BDD:CART-SUBMIT-001] a", () => { expect.assertions(1); expect.hasAssertions(); });`,
  ],
  [
    "assertion text in a string",
    `it("[BDD:CART-SUBMIT-001] a", () => { log("expect(submit()).toBe(1)"); });`,
  ],
  [
    "non-function second argument",
    `it("[BDD:CART-SUBMIT-001] a", runSharedTest);`,
  ],
]) {
  test(`${name} does not count as coverage and reports BDD011`, async () => {
    const report = await verifyTests(body);

    assert.equal(report.exitCode, 1);
    assert.deepEqual(codes(report).sort(), ["BDD005", "BDD011"]);
  });
}

for (const [name, body] of [
  ["expect", `it("[BDD:CART-SUBMIT-001] a", () => { expect(submit()).toBe(1); });`],
  [
    "awaited expect rejects",
    `it("[BDD:CART-SUBMIT-001] a", async () => { await expect(submit()).rejects.toThrow(); });`,
  ],
  ["assert", `it("[BDD:CART-SUBMIT-001] a", () => { assert(submit()); });`],
  [
    "assert member",
    `it("[BDD:CART-SUBMIT-001] a", () => { assert.equal(submit(), 1); });`,
  ],
  [
    "assert-prefixed helper",
    `it("[BDD:CART-SUBMIT-001] a", () => { assertCartAccepted(submit()); });`,
  ],
  [
    "supertest expect",
    `it("[BDD:CART-SUBMIT-001] a", () => request(app).post("/carts").expect(201));`,
  ],
  [
    "assertion inside a nested callback",
    `it("[BDD:CART-SUBMIT-001] a", () => { [1].forEach((n) => { expect(n).toBe(1); }); });`,
  ],
]) {
  test(`${name} counts as an assertion`, async () => {
    const report = await verifyTests(body);

    assert.equal(report.exitCode, 0);
    assert.deepEqual(report.diagnostics, []);
  });
}

test("skipped and todo tests are not reported for missing assertions", async () => {
  const report = await verifyTests(
    `it.todo("[BDD:CART-SUBMIT-001] a");\nit.skip("[BDD:CART-SUBMIT-001] b", () => {});`,
  );

  assert.deepEqual(codes(report), ["BDD005"]);
});

test("a sibling asserting test still covers a scenario next to an empty one", async () => {
  const report = await verifyTests(`
it("[BDD:CART-SUBMIT-001] empty", () => {});
it("[BDD:CART-SUBMIT-001] real", () => { expect(submit()).toBe(1); });
`);

  assert.deepEqual(codes(report), ["BDD011"]);
  assert.equal(report.summary.coveredScenarios, 1);
});
