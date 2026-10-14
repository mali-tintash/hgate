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
  const root = await mkdtemp(path.join(tmpdir(), "hgate-bdd-reach-"));
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

const wrap = (body, helpers = "") =>
  `${helpers}\nit("[BDD:CART-SUBMIT-001] a", async () => { ${body} });`;

const weak = [
  ["literal against itself", wrap("expect(true).toBe(true);"), /tautological/],
  ["identical operands", wrap("const x = submit(); expect(x).toBe(x);"), /tautological/],
  ["identical property operands", wrap("expect(cart.total).toEqual(cart.total);"), /tautological/],
  ["toBeTruthy on a literal", wrap("expect(1).toBeTruthy();"), /tautological/],
  ["toBeDefined on a literal", wrap('expect("x").toBeDefined();'), /tautological/],
  [
    "helper declared but never called",
    wrap("function check() { expect(submit()).toBe(1); } submit();"),
    /unreachable/,
  ],
  [
    "arrow helper declared but never called",
    wrap("const check = () => { expect(submit()).toBe(1); }; submit();"),
    /unreachable/,
  ],
  ["if (false)", wrap("if (false) { expect(submit()).toBe(1); }"), /unreachable/],
  ["constant-false ternary/&&", wrap("false && expect(submit()).toBe(1);"), /unreachable/],
  ["else of a constant-true if", wrap("if (true) { submit(); } else { expect(submit()).toBe(1); }"), /unreachable/],
  ["after return", wrap("return; expect(submit()).toBe(1);"), /unreachable/],
  ["after throw", wrap('throw new Error("x"); expect(submit()).toBe(1);'), /unreachable/],
  [
    "after if/else that both return",
    wrap("if (cond) { return; } else { return; } expect(submit()).toBe(1);"),
    /unreachable/,
  ],
  ["loop over an empty array", wrap("for (const n of []) { expect(n).toBe(1); }"), /unreachable/],
  [
    "callback that never fires",
    wrap("bus.on('done', () => { expect(submit()).toBe(1); });"),
    /unreachable/,
  ],
  [
    "mock implementation that never runs",
    wrap("spy.mockImplementation(() => { expect(submit()).toBe(1); });"),
    /unreachable/,
  ],
  [
    "nested function declared and dropped",
    wrap("const unused = async () => { expect(submit()).toBe(1); };"),
    /unreachable/,
  ],
];

for (const [name, source, reason] of weak) {
  test(`${name} does not count as an assertion`, async () => {
    const report = await verifyTests(source);

    assert.equal(report.exitCode, 1);
    assert.deepEqual(
      report.diagnostics.map(({ code }) => code).sort(),
      ["BDD005", "BDD011"],
    );
    assert.match(
      report.diagnostics.find(({ code }) => code === "BDD011").message,
      reason,
    );
  });
}

const legitimate = [
  ["helper that is called", wrap("check();", "function check() { expect(submit()).toBe(1); }")],
  ["arrow helper that is called", wrap("check();", "const check = () => { expect(submit()).toBe(1); };")],
  ["awaited async helper", wrap("await check();", "async function check() { expect(await submit()).toBe(1); }")],
  ["helper called before its declaration", wrap("check(); function check() { expect(submit()).toBe(1); }")],
  ["helper called from another helper", wrap("outer();", "function inner() { expect(submit()).toBe(1); }\nfunction outer() { inner(); }")],
  ["expect.assertions alongside a real assertion", wrap("expect.assertions(1); expect(submit()).toBe(1);")],
  ["immediately invoked function", wrap("(() => { expect(submit()).toBe(1); })();")],
  ["forEach callback", wrap("[1, 2].forEach((n) => { expect(submit(n)).toBe(n); });")],
  ["map with async callback", wrap("await Promise.all([1].map(async (n) => { expect(await submit(n)).toBe(n); }));")],
  ["promise then", wrap("return submit().then((r) => { expect(r).toBe(1); });")],
  ["helper passed to forEach", wrap("[1].forEach(check);", "function check(n) { expect(submit(n)).toBe(n); }")],
  ["constant-true branch", wrap("if (true) { expect(submit()).toBe(1); }")],
  ["unknown condition", wrap("if (flag) { expect(submit()).toBe(1); }")],
  ["assertion before return", wrap("expect(submit()).toBe(1); return;")],
  ["fast-check property callback", wrap("fc.assert(fc.property(fc.integer(), (n) => { expect(submit(n)).toBe(n); }));")],
  ["rejects chain", wrap("await expect(submit()).rejects.toThrow();")],
  ["literal compared with a computed value", wrap("expect(submit()).toBe(true);")],
  [
    "it.each rows",
    `it.each([1, 2])("[BDD:CART-SUBMIT-001] a %s", (n) => { expect(submit(n)).toBe(n); });`,
  ],
  [
    "test.each template",
    "test.each`\n  n\n  ${1}\n`(\"[BDD:CART-SUBMIT-001] a\", ({ n }) => { expect(submit(n)).toBe(n); });",
  ],
];

for (const [name, source] of legitimate) {
  test(`${name} counts as an assertion`, async () => {
    const report = await verifyTests(source);

    assert.deepEqual(report.diagnostics, []);
    assert.equal(report.exitCode, 0);
  });
}
