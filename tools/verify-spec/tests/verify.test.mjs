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
  formatGithubAnnotations,
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

// ---------------------------------------------------------------------------
// Gate validation (lifecycle-gates.md Validity Rules). The good fixture carries
// a copy of the gate catalog and a fully gated REFINING -> REFINED transition.

const STATUS = `${CART}/status.md`;
const REPO_CATALOG = fileURLToPath(
  new URL("../../../skills/hgate-guide/references/lifecycle-gates.md", import.meta.url),
);

function statusFile(lifecycle, history, gates) {
  return [
    "---",
    "bounded_context: cart",
    `lifecycle: ${lifecycle}`,
    "---",
    "",
    "# Cart Lifecycle Status",
    "",
    "## Transition History",
    "",
    "| Date | From | To | Evidence | Actor/session |",
    "|---|---|---|---|---|",
    ...history.map(([date, from, to]) => `| ${date} | ${from} | ${to} | recorded | test |`),
    "",
    "## Gate Evidence",
    "",
    "| Transition | Gate | Kind | Result | Evidence | Signed by | Date |",
    "|---|---|---|---|---|---|---|",
    ...gates.map((row) => `| ${row.join(" | ")} |`),
    "",
  ].join("\n");
}

const IMPLEMENTED_HISTORY = [
  ["2026-10-14", "REFINING", "REFINED"],
  ["2026-10-20", "REFINED", "IMPLEMENTING"],
  ["2026-11-01", "IMPLEMENTING", "IMPLEMENTED"],
];
const IMPLEMENTED_GATES = [
  ["IMPLEMENTING -> IMPLEMENTED", "GATE-IMPL-BDD", "D", "PASS", "`verify:bdd` exit 0", "-", "2026-11-01"],
  ["IMPLEMENTING -> IMPLEMENTED", "GATE-IMPL-SIGNOFF", "H", "PASS", "`docs/verification/bdd-signoffs/cart/2026-11-01.md`", "A. Lead (Tech lead)", "2026-11-01"],
  ["IMPLEMENTING -> IMPLEMENTED", "GATE-PROJ-SYNC", "D", "PASS", "`npm run project:check` in-sync", "-", "2026-11-01"],
];

const codes = (report, list = "diagnostics") => report[list].map((d) => `${d.code} ${d.file}:${d.line}`);

const GATE_DEFECTS = [
  {
    name: "missing required gate (GATE-REF-APPROVAL)",
    code: "HGS001",
    at: `${STATUS}:26`,
    message: /GATE-REF-APPROVAL .*REFINING -> REFINED/,
    mutate: (f) => f.edit(STATUS, "| REFINING -> REFINED | GATE-REF-APPROVAL |", "| REFINING -> REFINED | GATE-NOT-A-ROW |"),
  },
  {
    name: "missing GATE-PROJ-SYNC required by the * -> * pattern",
    code: "HGS001",
    at: `${STATUS}:26`,
    message: /GATE-PROJ-SYNC/,
    mutate: (f) =>
      f.edit(STATUS, "| REFINING -> REFINED | GATE-PROJ-SYNC | D | PASS | `npm run project:check` in-sync | - | 2026-10-14 |\n", ""),
  },
  {
    name: "required gate recorded as FAIL",
    code: "HGS002",
    at: `${STATUS}:35`,
    message: /GATE-REF-SPEC .* is FAIL/,
    mutate: (f) => f.edit(STATUS, "| GATE-REF-SPEC | D | PASS |", "| GATE-REF-SPEC | D | FAIL |"),
  },
  {
    name: "required gate recorded as N/A",
    code: "HGS002",
    at: `${STATUS}:35`,
    mutate: (f) => f.edit(STATUS, "| GATE-REF-SPEC | D | PASS |", "| GATE-REF-SPEC | D | N/A |"),
  },
  {
    name: "gate row dated before the current transition does not count",
    code: "HGS001",
    at: `${STATUS}:26`,
    message: /GATE-REF-SPEC/,
    mutate: (f) =>
      f.edit(STATUS, "| `verify-spec` OK (refinement) | - | 2026-10-14 |", "| `verify-spec` OK (refinement) | - | 2026-10-13 |"),
  },
  {
    name: "WAIVED without a Tech lead signer",
    code: "HGS003",
    at: `${STATUS}:35`,
    mutate: (f) =>
      f.edit(
        STATUS,
        "| GATE-REF-SPEC | D | PASS | `verify-spec` OK (refinement) | - |",
        "| GATE-REF-SPEC | D | WAIVED | Tool outage; rerun scheduled | P. Manager (Technical PM) |",
      ),
  },
  {
    name: "malformed row: kind differs from the catalog",
    code: "HGS004",
    at: `${STATUS}:35`,
    message: /kind H does not match catalog kind D/,
    mutate: (f) => f.edit(STATUS, "| GATE-REF-SPEC | D | PASS |", "| GATE-REF-SPEC | H | PASS |"),
  },
  {
    name: "malformed row: gate not in the catalog",
    code: "HGS004",
    at: `${STATUS}:36`,
    message: /not in the gate catalog/,
    mutate: (f) => f.edit(STATUS, "| REFINING -> REFINED | GATE-REF-APPROVAL |", "| REFINING -> REFINED | GATE-NOT-A-ROW |"),
  },
  {
    name: "malformed row: gate does not apply to the transition",
    code: "HGS004",
    at: `${STATUS}:34`,
    message: /does not apply to transition DISCOVERED -> REFINING/,
    mutate: (f) => f.edit(STATUS, "| DISCOVERED -> REFINING | GATE-PROJ-SYNC |", "| DISCOVERED -> REFINING | GATE-REF-SPEC |"),
  },
  {
    name: "malformed row: human gate PASS without a signer",
    code: "HGS004",
    at: `${STATUS}:36`,
    message: /must be "<Name> \(<Signer role>\)"/,
    mutate: (f) =>
      f.edit(STATUS, "| A. Reviewer (Technical PM) | 2026-10-14 |", "| - | 2026-10-14 |"),
  },
  {
    name: "malformed row: empty evidence and bad date",
    code: "HGS004",
    at: `${STATUS}:33`,
    message: /date "14\/10\/2026" must be YYYY-MM-DD/,
    mutate: (f) =>
      f.edit(STATUS, "| `npm run project:check` in-sync | - | 2026-10-01 |", "|  | - | 14/10/2026 |"),
  },
  {
    name: "malformed row: signer role not allowed by the catalog",
    code: "HGS004",
    at: `${STATUS}:36`,
    message: /signer role "product owner" is not allowed/,
    mutate: (f) =>
      f.edit(STATUS, "| A. Reviewer (Technical PM) | 2026-10-14 |", "| A. Owner (Product owner) | 2026-10-14 |"),
  },
  {
    name: "lifecycle with no matching Transition History row",
    code: "HGS005",
    at: `${STATUS}:4`,
    mutate: (f) => f.edit(STATUS, "lifecycle: REFINED", "lifecycle: SPEC_REVIEWED"),
  },
  {
    name: "optional GATE-IMPL-PROPS recorded as FAIL",
    code: "HGS002",
    message: /optional gate GATE-IMPL-PROPS/,
    mutate: (f) =>
      f.write(
        STATUS,
        statusFile("IMPLEMENTED", IMPLEMENTED_HISTORY, [
          ...IMPLEMENTED_GATES,
          ["IMPLEMENTING -> IMPLEMENTED", "GATE-IMPL-PROPS", "H", "FAIL", "Properties failed", "A. Lead (Tech lead)", "2026-11-01"],
        ]),
      ),
  },
];

for (const defect of GATE_DEFECTS) {
  test(`verify-spec gate check flags ${defect.code}: ${defect.name}`, async () => {
    const root = await brokenCopy(defect.mutate);
    for (const phase of ["refinement", "implementation"]) {
      const report = await verifySpec({ root, phase });
      const hits = report.diagnostics.filter((d) => d.code === defect.code);
      assert.ok(hits.length >= 1, `${phase}: expected ${defect.code}, got ${JSON.stringify(report.diagnostics)}`);
      if (defect.at) {
        assert.ok(
          hits.some((d) => `${d.file}:${d.line}` === defect.at),
          `expected ${defect.code} at ${defect.at}, got ${hits.map((d) => `${d.file}:${d.line}`)}`,
        );
      }
      if (defect.message) {
        assert.ok(hits.some((d) => defect.message.test(d.message)), JSON.stringify(hits));
      }
      assert.equal(report.exitCode, EXIT_INVALID);
    }
  });
}

test("verify-spec gate check passes the good fixture with no warnings, also against the repo catalog", async () => {
  for (const gates of [undefined, REPO_CATALOG]) {
    const report = await verifySpec({ root: goodFixture, gates });
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(report.notes, []);
  }
});

test("verify-spec gate check accepts a later PASS row superseding a FAIL row", async () => {
  const root = await brokenCopy((f) =>
    f.edit(
      STATUS,
      "| REFINING -> REFINED | GATE-REF-SPEC | D | PASS |",
      "| REFINING -> REFINED | GATE-REF-SPEC | D | FAIL | `verify-spec` reported VSP005 | - | 2026-10-14 |\n| REFINING -> REFINED | GATE-REF-SPEC | D | PASS |",
    ),
  );
  assert.deepEqual((await verifySpec({ root })).diagnostics, []);
});

test("verify-spec gate check accepts WAIVED signed by a Tech lead with a reason", async () => {
  const root = await brokenCopy((f) =>
    f.edit(
      STATUS,
      "| GATE-REF-SPEC | D | PASS | `verify-spec` OK (refinement) | - |",
      "| GATE-REF-SPEC | D | WAIVED | Tool outage; rerun scheduled | A. Lead (Tech lead) |",
    ),
  );
  const report = await verifySpec({ root });
  assert.deepEqual(report.diagnostics, []);
  assert.equal(report.exitCode, EXIT_VALID);
});

test("verify-spec gate check treats GATE-IMPL-PROPS as optional (absent or N/A)", async () => {
  const absent = await brokenCopy((f) => f.write(STATUS, statusFile("IMPLEMENTED", IMPLEMENTED_HISTORY, IMPLEMENTED_GATES)));
  assert.deepEqual((await verifySpec({ root: absent })).diagnostics, []);
  const notApplicable = await brokenCopy((f) =>
    f.write(
      STATUS,
      statusFile("IMPLEMENTED", IMPLEMENTED_HISTORY, [
        ...IMPLEMENTED_GATES,
        ["IMPLEMENTING -> IMPLEMENTED", "GATE-IMPL-PROPS", "H", "N/A", "Goal 3 declined in `decisions.md`", "-", "2026-11-01"],
      ]),
    ),
  );
  assert.deepEqual((await verifySpec({ root: notApplicable })).diagnostics, []);
  const missingSignoff = await brokenCopy((f) =>
    f.write(STATUS, statusFile("IMPLEMENTED", IMPLEMENTED_HISTORY, IMPLEMENTED_GATES.slice(0, 1).concat(IMPLEMENTED_GATES.slice(2)))),
  );
  assert.ok(codes(await verifySpec({ root: missingSignoff })).includes(`HGS001 ${STATUS}:14`));
});

test("verify-spec gate check: leaving BLOCKED needs only GATE-PROJ-SYNC (* -> * pattern)", async () => {
  const history = [
    ["2026-10-14", "REFINING", "REFINED"],
    ["2026-10-15", "REFINED", "BLOCKED"],
    ["2026-10-20", "BLOCKED", "REFINED"],
  ];
  const blocked = [
    ["REFINED -> BLOCKED", "GATE-BLOCK", "R", "PASS", "Waiting on payment contract; owner A. Lead; return REFINED", "-", "2026-10-15"],
    ["REFINED -> BLOCKED", "GATE-PROJ-SYNC", "D", "PASS", "in-sync", "-", "2026-10-15"],
  ];
  const ok = await brokenCopy((f) =>
    f.write(STATUS, statusFile("REFINED", history, [...blocked, ["BLOCKED -> REFINED", "GATE-PROJ-SYNC", "D", "PASS", "in-sync", "-", "2026-10-20"]])),
  );
  assert.deepEqual((await verifySpec({ root: ok })).diagnostics, []);
  const missing = await brokenCopy((f) => f.write(STATUS, statusFile("REFINED", history, blocked)));
  const report = await verifySpec({ root: missing });
  assert.deepEqual(codes(report), [`HGS001 ${STATUS}:14`]);
  assert.match(report.diagnostics[0].message, /GATE-PROJ-SYNC .*BLOCKED -> REFINED/);
});

test("verify-spec gate check warns once per legacy status.md without failing", async () => {
  const root = await brokenCopy((f) =>
    f.write(STATUS, "---\nbounded_context: cart\nlifecycle: REFINED\n---\n\n# Cart Lifecycle Status\n"),
  );
  const report = await verifySpec({ root, phase: "implementation" });
  assert.deepEqual(report.diagnostics, []);
  assert.equal(report.exitCode, EXIT_VALID);
  assert.deepEqual(codes(report, "warnings"), [`HGS006 ${STATUS}:1`]);
  const text = formatTextReport(report);
  const lines = text.trimEnd().split("\n");
  assert.equal(lines[0], "verify-spec OK (implementation): 1 BC(s)");
  assert.equal(lines[1], "WARNINGS (1)");
  assert.match(lines[2], /^HGS006 \.github\/skills\/cart\/status\.md:1 .*Gate Evidence/);
  assert.equal(lines.length, 3);
  assert.match(formatGithubAnnotations(report), /^::warning file=\.github\/skills\/cart\/status\.md,line=1::HGS006 /);
  const cli = await execFileAsync(process.execPath, [fileURLToPath(new URL("../verify.mjs", import.meta.url)), "--root", root], {
    env: { ...process.env, GITHUB_ACTIONS: "true" },
  });
  const out = cli.stdout.trimEnd().split("\n");
  assert.match(out[0], /^::warning file=/);
  assert.equal(out.at(-2), "WARNINGS (1)");
});

test("verify-spec skips gate checks with one INFO line when no catalog exists", async () => {
  const root = await brokenCopy((f) => f.remove(".github/skills/hgate-guide/references/lifecycle-gates.md"));
  await writeFile(path.join(root, STATUS), "---\nlifecycle: REFINED\n---\n\n## Gate Evidence\n\nnot a table\n");
  const report = await verifySpec({ root });
  assert.deepEqual(report.diagnostics, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.notes.length, 1);
  assert.equal(
    formatTextReport(report),
    `INFO ${report.notes[0]}\nverify-spec OK (refinement): 1 BC(s)\n`,
  );
  assert.ok(codes(await verifySpec({ root, gates: REPO_CATALOG })).includes(`HGS004 ${STATUS}:5`));
  await assert.rejects(verifySpec({ root, gates: "missing/lifecycle-gates.md" }), /gate catalog not found/);
});

test("verify-spec gate check respects --bc and reports a broken catalog", async () => {
  const root = await brokenCopy(async (f) => {
    await f.write(
      ".github/skills/orders/bdd-scenarios.md",
      "```gherkin\n  @scenario:ORDERS-PLACE-001\n  Scenario: Unrelated\n    Given x\n```\n",
    );
    await f.write(".github/skills/orders/status.md", "---\nlifecycle: REFINED\n---\n\n## Gate Evidence\n\nnot a table\n");
  });
  assert.deepEqual((await verifySpec({ root, bcs: ["cart"] })).diagnostics, []);
  assert.ok(codes(await verifySpec({ root, bcs: ["orders"] })).includes("HGS004 .github/skills/orders/status.md:5"));
  const broken = await brokenCopy((f) =>
    f.edit(".github/skills/hgate-guide/references/lifecycle-gates.md", "| GATE-BLOCK | * -> BLOCKED |", "| GATE-BLOCK | * BLOCKED |"),
  );
  assert.ok((await verifySpec({ root: broken })).diagnostics.some((d) => d.code === "HGS007"));
});

// ------------------------------------------------------------ gap drift (HGW)

test("verify-spec warns HGW001 on gap disposition drift without changing the exit code", async () => {
  const root = await brokenCopy(async (f) => {
    await f.write(
      "docs/domain-map.md",
      [
        "# Domain Map",
        "",
        "## Bounded Context Inventory",
        "",
        "| BC ID | Bounded Context | Local Status |",
        "|---|---|---|",
        `| cart | Cart | ${STATUS} |`,
        "",
        "## Open Boundary Gaps",
        "",
        "| ID | Gap | Affected BCs | Owner | Disposition |",
        "|---|---|---|---|---|",
        "| G1 | Payment retries | cart | A. Lead | Deferred to v2 |",
        "",
      ].join("\n"),
    );
    await f.edit(
      STATUS,
      "| OI-1 | Confirm payment retry policy | A. Reviewer | Deferred |",
      "| OI-1 | Confirm payment retry policy | A. Reviewer | Deferred |\n| G1 | Payment retries | A. Lead | Resolved in decisions.md |\n| G9 | Not in any map | A. Lead | Open |",
    );
  });
  const report = await verifySpec({ root });
  assert.deepEqual(report.diagnostics, []);
  assert.equal(report.exitCode, EXIT_VALID);
  const hgw = codes(report, "warnings").filter((c) => c.startsWith("HGW"));
  // Warnings are ordered by file:line like every other verify-spec warning.
  assert.deepEqual(hgw, [`HGW002 ${STATUS}:45`, "HGW001 docs/domain-map.md:13"]);
  const lines = formatTextReport(report).trimEnd().split("\n");
  assert.equal(lines[1], `WARNINGS (${report.warnings.length})`);
  assert.ok(lines.some((l) => /^HGW001 docs\/domain-map\.md:13 gap G1 dispositions disagree: DEFERRED .* RESOLVED /.test(l)));
});

test("verify-spec gap warnings match the projection generator on its drift fixture", async () => {
  const { buildProjection } = await import("../../project-projection/generate.mjs");
  const example = fileURLToPath(new URL("../../project-projection/tests/fixtures/example", import.meta.url));
  const expected = (await buildProjection(example)).diagnostics.map((d) => `${d.code} ${d.file}:${d.line} ${d.message}`);
  const report = await verifySpec({ root: example });
  const actual = report.warnings.filter((w) => w.code.startsWith("HGW")).map((w) => `${w.code} ${w.file}:${w.line} ${w.message}`);
  assert.ok(expected.length > 0);
  assert.deepEqual(actual, expected);
});
