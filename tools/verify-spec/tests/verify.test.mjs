import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  EXIT_DISCOVERY,
  EXIT_INVALID,
  EXIT_VALID,
  formatTextReport,
  verifySpec,
} from "../verify.mjs";

const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL("../verify.mjs", import.meta.url));
const goodFixture = fileURLToPath(new URL("./fixtures/good", import.meta.url));
const CART = ".github/skills/cart";

async function brokenCopy(mutate) {
  const root = await mkdtemp(path.join(tmpdir(), "hgate-spec-"));
  await cp(goodFixture, root, { recursive: true });
  await mutate({
    edit: async (file, from, to) => {
      const target = path.join(root, file);
      const source = await readFile(target, "utf8");
      assert.ok(source.includes(from), `fixture edit target missing in ${file}: ${from}`);
      await writeFile(target, source.replace(from, to));
    },
    write: async (file, content) => {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    },
    remove: (file) => rm(path.join(root, file), { force: true }),
  });
  return root;
}

// Each defect is a deliberate break of the known-good BC and must be flagged
// with its stable code at the expected file:line.
const REFINEMENT_DEFECTS = [
  {
    name: "aggregate with no class",
    code: "VSP001",
    at: `${CART}/SKILL.md:24`,
    mutate: (f) =>
      f.edit(`${CART}/SKILL.md`, "- **Cart**:", "- **Cart**: ok\n- **Wishlist**:"),
  },
  {
    name: "event with no .event.ts file",
    code: "VSP002",
    at: `${CART}/SKILL.md:30`,
    mutate: async (f) => {
      await f.edit(`${CART}/SKILL.md`, "      cart-submitted.event.ts   # emitted when a cart is submitted\n", "");
      await f.remove("src/cart/domain/events/cart-submitted.event.ts");
    },
  },
  {
    name: "integration references a missing ACL doc",
    code: "VSP003",
    at: `${CART}/SKILL.md:26`,
    mutate: (f) => f.remove(`${CART}/payment-acl.md`),
  },
  {
    name: "integration names no ACL doc",
    code: "VSP004",
    at: `${CART}/SKILL.md:26`,
    mutate: (f) =>
      f.edit(`${CART}/SKILL.md`, "- Payment Gateway — see `payment-acl.md` (contract defined).", "- Payment Gateway"),
  },
  {
    name: "scenario uses a glossary anti-term",
    code: "VSP005",
    at: `${CART}/bdd-scenarios.md:8`,
    mutate: (f) =>
      f.edit(`${CART}/bdd-scenarios.md`, "Given a cart with one item", "Given a basket with one item"),
  },
  {
    name: "scenario with no tag",
    code: "VSP006",
    at: `${CART}/bdd-scenarios.md:6`,
    mutate: (f) =>
      f.edit(`${CART}/bdd-scenarios.md`, "  @scenario:CART-SUBMIT-001\n", ""),
  },
  {
    name: "scenario with two tags",
    code: "VSP007",
    at: `${CART}/bdd-scenarios.md:7`,
    mutate: (f) =>
      f.edit(`${CART}/bdd-scenarios.md`, "  @scenario:CART-SUBMIT-001\n", "  @scenario:CART-SUBMIT-001 @scenario:CART-SUBMIT-009\n"),
  },
  {
    name: "scenario ID with invalid format",
    code: "VSP008",
    at: `${CART}/bdd-scenarios.md:6`,
    mutate: (f) =>
      f.edit(`${CART}/bdd-scenarios.md`, "CART-SUBMIT-001", "cart_submit_1"),
  },
  {
    name: "duplicate scenario ID across BCs",
    code: "VSP009",
    mutate: (f) =>
      f.write(
        ".github/skills/orders/bdd-scenarios.md",
        "```gherkin\nFeature: Orders\n\n  @scenario:CART-SUBMIT-001\n  Scenario: Reused ID\n    Given x\n```\n",
      ),
    expectFile: ".github/skills/orders/bdd-scenarios.md",
  },
  {
    name: "duplicate scenario ID within a BC",
    code: "VSP009",
    at: `${CART}/bdd-scenarios.md:12`,
    mutate: (f) =>
      f.edit(`${CART}/bdd-scenarios.md`, "CART-SUBMIT-002", "CART-SUBMIT-001"),
  },
  {
    name: "ports table missing",
    code: "VSP010",
    mutate: (f) =>
      f.edit(`${CART}/domain-model.md`, "## Ports", "## Ports\n\nPaymentPort and a publisher.\n\n## Unused"),
  },
  {
    name: "ports table without Contract column",
    code: "VSP010",
    mutate: (f) =>
      f.edit(`${CART}/domain-model.md`, "| Name | Direction | Purpose | Contract |", "| Name | Direction | Purpose | Notes |"),
  },
  {
    name: "port with empty purpose",
    code: "VSP011",
    at: `${CART}/domain-model.md:17`,
    mutate: (f) =>
      f.edit(`${CART}/domain-model.md`, "| Authorize payment for a submitted cart |", "|  |"),
  },
  {
    name: "port with invalid direction",
    code: "VSP012",
    at: `${CART}/domain-model.md:17`,
    mutate: (f) => f.edit(`${CART}/domain-model.md`, "| OUTBOUND | Authorize", "| SIDEWAYS | Authorize"),
  },
  {
    name: "duplicate port",
    code: "VSP013",
    at: `${CART}/domain-model.md:18`,
    mutate: (f) => f.edit(`${CART}/domain-model.md`, "`CartSubmittedPublisher`", "`PaymentPort`"),
  },
  {
    name: "missing domain-model.md",
    code: "VSP014",
    mutate: (f) => f.remove(`${CART}/domain-model.md`),
  },
  {
    name: "missing Domain Events Emitted section",
    code: "VSP015",
    mutate: (f) =>
      f.edit(`${CART}/SKILL.md`, "## Domain Events Emitted", "## Events"),
  },
];

for (const defect of REFINEMENT_DEFECTS) {
  test(`verify-spec flags ${defect.code}: ${defect.name}`, async () => {
    const root = await brokenCopy(defect.mutate);
    const report = await verifySpec({ root });
    const hits = report.diagnostics.filter((d) => d.code === defect.code);
    assert.ok(hits.length >= 1, `expected ${defect.code}, got ${JSON.stringify(report.diagnostics)}`);
    if (defect.at) {
      assert.ok(
        hits.some((d) => `${d.file}:${d.line}` === defect.at),
        `expected ${defect.code} at ${defect.at}, got ${hits.map((d) => `${d.file}:${d.line}`)}`,
      );
    }
    if (defect.expectFile) {
      assert.ok(hits.some((d) => d.file === defect.expectFile));
    }
    assert.equal(report.exitCode, EXIT_INVALID);
  });
}

const READINESS_DEFECTS = [
  {
    name: "event without payload",
    code: "VSP101",
    mutate: (f) => f.edit(`${CART}/SKILL.md`, "`{ cartId, ownerId, submittedAt }`", " "),
  },
  {
    name: "port contract TBD",
    code: "VSP102",
    mutate: (f) => f.edit(`${CART}/domain-model.md`, "`CartSubmitted` event", "TBD"),
  },
  {
    name: "ACL without Port Interface",
    code: "VSP103",
    mutate: (f) => f.edit(`${CART}/payment-acl.md`, "## Port Interface", "## Interface"),
  },
  {
    name: "open contract question",
    code: "VSP104",
    mutate: (f) => f.edit(`${CART}/payment-acl.md`, "## Endpoint Mapping", "## Endpoint Mapping\n[OPEN] Which auth scheme?"),
  },
  {
    name: "persistence placement not stated",
    code: "VSP105",
    mutate: (f) => f.edit(`${CART}/domain-model.md`, "⚠️ Tenant schema.", "Stored."),
  },
  {
    name: "BC not yet refined",
    code: "VSP106",
    mutate: (f) => f.edit(`${CART}/status.md`, "lifecycle: REFINED", "lifecycle: REFINING"),
  },
  {
    name: "missing status.md",
    code: "VSP106",
    mutate: (f) => f.remove(`${CART}/status.md`),
  },
];

for (const defect of READINESS_DEFECTS) {
  test(`verify-spec implementation phase flags ${defect.code}: ${defect.name}`, async () => {
    const root = await brokenCopy(defect.mutate);
    const refinement = await verifySpec({ root });
    assert.equal(refinement.exitCode, EXIT_VALID, "readiness-only defects pass the refinement phase");
    const report = await verifySpec({ root, phase: "implementation" });
    assert.ok(
      report.diagnostics.some((d) => d.code === defect.code),
      `expected ${defect.code}, got ${JSON.stringify(report.diagnostics)}`,
    );
    assert.equal(report.exitCode, EXIT_INVALID);
  });
}

test("verify-spec accepts the golden known-good BC in both phases", async () => {
  for (const phase of ["refinement", "implementation"]) {
    const report = await verifySpec({ root: goodFixture, phase });
    assert.deepEqual(report.diagnostics, []);
    assert.equal(report.exitCode, EXIT_VALID);
    assert.deepEqual(report.checked, ["cart"]);
  }
});

test("verify-spec --require-source demands event files on disk", async () => {
  const root = await brokenCopy((f) => f.remove("src/cart/domain/events/cart-submitted.event.ts"));
  assert.equal((await verifySpec({ root })).exitCode, EXIT_VALID);
  const report = await verifySpec({ root, requireSource: true });
  assert.equal(report.diagnostics[0].code, "VSP002");
});

test("verify-spec text report is failures-only with code and file:line", async () => {
  const root = await brokenCopy((f) =>
    f.edit(`${CART}/bdd-scenarios.md`, "Given a cart with one item", "Given a basket with one item"),
  );
  const text = formatTextReport(await verifySpec({ root }));
  assert.equal(
    text,
    `VSP005 ${CART}/bdd-scenarios.md:8 uses anti-term "basket" from the SKILL.md glossary; use the ubiquitous term\n` +
      "verify-spec FAILED (refinement): 1 issue(s)\n",
  );
  assert.equal(formatTextReport(await verifySpec({ root: goodFixture })), "verify-spec OK (refinement): 1 BC(s)\n");
});

test("verify-spec --bc limits checks but still enforces repo-wide ID uniqueness", async () => {
  const root = await brokenCopy((f) =>
    f.write(
      ".github/skills/orders/bdd-scenarios.md",
      "```gherkin\n  @scenario:ORDERS-PLACE-001\n  Scenario: Unrelated\n    Given x\n```\n",
    ),
  );
  const report = await verifySpec({ root, bcs: ["cart"] });
  assert.deepEqual(report.checked, ["cart"]);
  assert.equal(report.exitCode, EXIT_VALID);
  await assert.rejects(verifySpec({ root, bcs: ["nope"] }), /bounded context not found/);
});

test("verify-spec CLI exits 1 on defects, 0 when clean, 2 on bad usage", async () => {
  const root = await brokenCopy((f) => f.remove(`${CART}/payment-acl.md`));
  await assert.rejects(execFileAsync(process.execPath, [cli, "--root", root]), (error) => {
    assert.equal(error.code, EXIT_INVALID);
    assert.match(error.stdout, /^VSP003 /);
    return true;
  });
  const clean = await execFileAsync(process.execPath, [cli, "--root", goodFixture, "--format", "json"]);
  assert.equal(JSON.parse(clean.stdout).exitCode, 0);
  await assert.rejects(execFileAsync(process.execPath, [cli, "--root", goodFixture, "--bogus"]), (error) => {
    assert.equal(error.code, EXIT_DISCOVERY);
    return true;
  });
  await assert.rejects(
    execFileAsync(process.execPath, [cli, "--root", goodFixture, "--skills-path", "missing"]),
    (error) => error.code === EXIT_DISCOVERY && /VSP900/.test(error.stderr),
  );
});
