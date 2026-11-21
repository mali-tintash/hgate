import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildReport, main, parseArgs, parseTransitionHistory, serialize, UNCOMMITTED } from "../generate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "generate.mjs");

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const gitTest = hasGit ? test : test.skip;

const GIT_ENV = {
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_NOSYSTEM: "1",
};

function git(cwd, args, date = "2026-11-01T10:00:00+00:00") {
  return execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...GIT_ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

const write = (root, rel, content) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), content);
};

const BC = ".github/skills/cart";
const HEADER = `| Date | From | To | Evidence | Actor/session |\n|---|---|---|---|---|\n`;
const status = (lifecycle, rows) =>
  `---\nbounded_context: cart\nlifecycle: ${lifecycle}\n---\n\n# Cart Lifecycle Status\n\n## Transition History\n\n${HEADER}${rows.join("\n")}\n\n## Open Items\n\n| ID | Item | Owner | Disposition |\n|---|---|---|---|\n| OI-1 | Limits | Tech lead | Open |\n`;
const ROW_DISC = "| 2026-11-01 | - | DISCOVERED | Domain exploration | domain-exploration session |";
const ROW_REFINING = "| 2026-11-05 | DISCOVERED | REFINING | Refinement started | bc-refinement session |";
const ROW_REFINED = "| 2026-11-06 | REFINING | REFINED | Spec approved | bc-refinement session |";
const ROW_IMPL = "| 2026-11-07 | REFINED | IMPLEMENTING | `verify-spec` OK | bc-implementation session |";

const SKILL = "# Cart\n\n## Purpose\nCarts.\n\n## Core Business Rules\n1. A submitted cart cannot be modified.\n2. Only the owner may submit a cart.\n";
const scenario = (id, title) => `  @scenario:${id}\n  Scenario: ${title}\n    Given a cart\n    When something happens\n    Then it is handled\n`;
const bdd = (...scenarios) => `# Cart BDD\n\n\`\`\`gherkin\nFeature: Cart\n\n${scenarios.join("\n")}\`\`\`\n`;

/** (1) DISCOVERED commit; (2) REFINING+REFINED rows plus spec files in one commit; (3) uncommitted scenario. */
function buildRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), "hgate-status-"));
  git(root, ["init", "-q", "-b", "main"]);
  write(root, `${BC}/status.md`, status("DISCOVERED", [ROW_DISC]));
  write(root, ".github/skills/hgate-guide/SKILL.md", "# workflow skill without status.md\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "docs(cart): discover cart"], "2026-11-01T10:00:00+00:00");
  write(root, `${BC}/status.md`, status("REFINED", [ROW_DISC, ROW_REFINING, ROW_REFINED]));
  write(root, `${BC}/SKILL.md`, SKILL);
  write(root, `${BC}/bdd-scenarios.md`, bdd(scenario("CART-SUBMIT-001", "Submit a cart")));
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "docs(cart): refine cart"], "2026-11-06T10:00:00+00:00");
  write(root, `${BC}/bdd-scenarios.md`, bdd(scenario("CART-SUBMIT-001", "Submit a cart"), scenario("CART-SUBMIT-002", "Submit twice")));
  return root;
}

const shas = (root) => git(root, ["log", "--format=%H", "--reverse"]).trim().split("\n");
const quiet = () => {};

test("parseArgs rejects unknown flags and missing values", () => {
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
  assert.throws(() => parseArgs(["--root"]), /requires a value/);
  assert.deepEqual(parseArgs(["--root", "x", "--bdd", "--stdout"]).root, "x");
});

test("main exits 2 on usage errors", () => {
  const sink = { write() {} };
  assert.equal(main(["--bogus"], { stdout: sink, stderr: sink }), 2);
  assert.equal(main(["--root", path.join(os.tmpdir(), "does-not-exist-hgate")], { stdout: sink, stderr: sink }), 2);
});

test("parseTransitionHistory returns rows with line numbers and skips placeholders", () => {
  const md = status("REFINED", [ROW_DISC, "| YYYY-MM-DD | [from] | [to] | ... | ... |", ROW_REFINING]);
  const rows = parseTransitionHistory(md);
  assert.deepEqual(rows.map((r) => r.to), ["DISCOVERED", "REFINING"]);
  assert.equal(md.split("\n")[rows[0].line - 1], ROW_DISC);
  assert.equal(rows[1].actor, "bc-refinement session");
});

gitTest("attributes rows to commits, shares one commit, and diffs consecutive snapshots", () => {
  const root = buildRepo();
  const [c1, c2] = shas(root);
  const report = buildReport({ root, skillsPath: ".github/skills" }, quiet);
  assert.equal(report.git.available, true);
  assert.equal(report.git.head, c2);
  assert.equal(report.git.headSubject, "docs(cart): refine cart");
  assert.equal(report.git.branch, "main");
  assert.equal(report.git.shallow, false);
  assert.deepEqual(report.boundedContexts.map((b) => b.id), ["cart"], "workflow skill dirs are skipped");

  const bc = report.boundedContexts[0];
  assert.equal(bc.lifecycle, "REFINED");
  assert.equal(bc.dir, BC);
  assert.deepEqual(bc.steps.map((s) => s.commit.sha), [c1, c2, c2]);
  assert.equal(bc.steps[0].commit.subject, "docs(cart): discover cart");
  assert.equal(bc.steps[0].commit.date, "2026-11-01T10:00:00+00:00");
  assert.deepEqual(bc.steps.map((s) => s.sharedCommit), [false, true, true]);

  // Step 1 vs null: status-only content (open item) and lifecycle DISCOVERED.
  assert.deepEqual(bc.steps[0].changes.openItems.added.map((i) => i.key), ["OI-1"]);
  assert.deepEqual(bc.steps[0].changes.lifecycle, { from: null, to: "DISCOVERED" });
  // Earlier step in the shared commit is empty; the last carries the diff.
  assert.equal(bc.steps[1].changes.summary.changed, false);
  assert.deepEqual(bc.steps[2].changes.scenarios.added.map((i) => i.key), ["@scenario:CART-SUBMIT-001"]);
  assert.equal(bc.steps[2].changes.rules.added.length, 2);
  assert.deepEqual(bc.steps[2].changes.lifecycle, { from: "DISCOVERED", to: "REFINED" });

  // Last transition is at HEAD: nothing changed since it.
  assert.equal(bc.sinceLastTransition.baseCommit.sha, c2);
  assert.equal(bc.sinceLastTransition.changes.summary.changed, false);
  // HEAD~1 -> HEAD equals the refinement diff.
  assert.equal(bc.sincePreviousCommit.baseCommit.sha, c1);
  assert.deepEqual(bc.sincePreviousCommit.changes.scenarios.added.map((i) => i.key), ["@scenario:CART-SUBMIT-001"]);
  // HEAD -> worktree: the uncommitted scenario.
  assert.deepEqual(bc.uncommitted.changes.scenarios.added.map((i) => i.key), ["@scenario:CART-SUBMIT-002"]);
  assert.deepEqual(bc.uncommitted.files, ["bdd-scenarios.md"]);
  assert.equal(report.coverage, null);
});

gitTest("uncommitted transition rows are marked and later commits show since last transition", () => {
  const root = buildRepo();
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "docs(cart): add scenario"], "2026-11-06T12:00:00+00:00");
  const [, c2, c3] = shas(root);
  write(root, `${BC}/status.md`, status("IMPLEMENTING", [ROW_DISC, ROW_REFINING, ROW_REFINED, ROW_IMPL]));
  write(root, `${BC}/notes.txt`, "untracked\n");

  const bc = buildReport({ root }, quiet).boundedContexts[0];
  assert.deepEqual(bc.steps.map((s) => (typeof s.commit === "string" ? s.commit : s.commit.sha)), [shas(root)[0], c2, c2, UNCOMMITTED]);
  assert.equal(bc.steps[3].sharedCommit, false);
  assert.deepEqual(bc.steps[3].changes.lifecycle, { from: "REFINED", to: "IMPLEMENTING" });
  assert.deepEqual(bc.steps[3].changes.scenarios.added.map((i) => i.key), ["@scenario:CART-SUBMIT-002"]);
  assert.equal(bc.sinceLastTransition.baseCommit, UNCOMMITTED);
  assert.equal(bc.sinceLastTransition.changes.summary.changed, false);
  assert.equal(bc.sincePreviousCommit.baseCommit.sha, c2);
  assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), c3);
  assert.deepEqual(bc.uncommitted.files, ["notes.txt", "status.md"]);
});

gitTest("since last transition covers commits after the transition commit", () => {
  const root = buildRepo();
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "docs(cart): add scenario"], "2026-11-06T12:00:00+00:00");
  const [, c2] = shas(root);
  const bc = buildReport({ root }, quiet).boundedContexts[0];
  assert.equal(bc.sinceLastTransition.baseCommit.sha, c2);
  assert.deepEqual(bc.sinceLastTransition.changes.scenarios.added.map((i) => i.key), ["@scenario:CART-SUBMIT-002"]);
  assert.equal(bc.uncommitted.changes.summary.changed, false);
  assert.deepEqual(bc.uncommitted.files, []);
});

gitTest("CLI output is deterministic and written only when changed", () => {
  const root = buildRepo();
  const run = () => execFileSync(process.execPath, [cli, "--root", root, "--stdout"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const a = run();
  const b = run();
  assert.equal(a, b);
  assert.ok(a.endsWith("}\n"));
  assert.ok(!/generatedAt|timestamp/i.test(a));
  assert.equal(JSON.parse(a).schemaVersion, 1);

  const first = execFileSync(process.execPath, [cli, "--root", root], { encoding: "utf8" });
  assert.match(first, /wrote \.hgate\/status\.json/);
  assert.match(first, /cart \[REFINED\] steps 3/);
  const out = path.join(root, ".hgate", "status.json");
  assert.equal(readFileSync(out, "utf8"), a);
  const mtime = statSync(out).mtimeMs;
  const second = execFileSync(process.execPath, [cli, "--root", root], { encoding: "utf8" });
  assert.match(second, /unchanged \.hgate\/status\.json/);
  assert.equal(statSync(out).mtimeMs, mtime);
});

gitTest("discovers BCs from the projection when present", () => {
  const root = buildRepo();
  write(root, "docs/hgate-project.json", JSON.stringify({ boundedContexts: [{ id: "cart", sources: { status: `${BC}/status.md` } }] }));
  const report = buildReport({ root }, quiet);
  assert.deepEqual(report.boundedContexts.map((b) => [b.id, b.dir]), [["cart", BC]]);
});

test("--bdd failures are recorded, never thrown", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hgate-status-bdd-"));
  write(root, `${BC}/status.md`, status("DISCOVERED", [ROW_DISC]));
  const report = buildReport({ root, bdd: true }, quiet);
  assert.ok(report.coverage && typeof report.coverage.status === "string");
});

gitTest("falls back to the working tree without git", () => {
  const repo = buildRepo();
  const root = mkdtempSync(path.join(os.tmpdir(), "hgate-status-nogit-"));
  cpSync(path.join(repo, ".github"), path.join(root, ".github"), { recursive: true });
  const warnings = [];
  const report = buildReport({ root }, (w) => warnings.push(w));
  assert.equal(report.git.available, false);
  assert.equal(report.git.head, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /working tree only/);
  const bc = report.boundedContexts[0];
  assert.deepEqual(bc.steps.map((s) => [s.to, s.commit, s.changes]), [
    ["DISCOVERED", null, null],
    ["REFINING", null, null],
    ["REFINED", null, null],
  ]);
  assert.equal(bc.sinceLastTransition.baseCommit, null);
  assert.equal(bc.sinceLastTransition.changes.scenarios.added.length, 2);
  assert.equal(bc.sincePreviousCommit.changes, null);
  assert.deepEqual(bc.uncommitted, { changes: null, files: [] });

  const sink = { write() {} };
  assert.equal(main(["--root", root, "--stdout"], { stdout: sink, stderr: sink }), 0);
});

gitTest("detects shallow clones and leaves steps unattributed", () => {
  const repo = buildRepo();
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "docs(cart): add scenario"], "2026-11-06T12:00:00+00:00");
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), "hgate-status-shallow-")), "clone");
  git(path.dirname(root), ["clone", "-q", "--depth", "1", `file://${repo}`, root]);
  const warnings = [];
  const report = buildReport({ root }, (w) => warnings.push(w));
  assert.equal(report.git.available, true);
  assert.equal(report.git.shallow, true);
  assert.match(warnings.join("\n"), /shallow clone/);
  const bc = report.boundedContexts[0];
  assert.ok(bc.steps.every((s) => s.commit === null && s.changes === null));
  assert.equal(bc.uncommitted.changes.summary.changed, false);
});

gitTest("untracked status.md marks every row uncommitted", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hgate-status-untracked-"));
  git(root, ["init", "-q", "-b", "main"]);
  write(root, "README.md", "x\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "chore: init"]);
  write(root, `${BC}/status.md`, status("REFINING", [ROW_DISC, ROW_REFINING]));
  const bc = buildReport({ root }, quiet).boundedContexts[0];
  assert.deepEqual(bc.steps.map((s) => s.commit), [UNCOMMITTED, UNCOMMITTED]);
  assert.deepEqual(bc.steps.map((s) => s.sharedCommit), [true, true]);
  assert.equal(bc.steps[1].changes.openItems.added.length, 1);
  assert.deepEqual(bc.uncommitted.files, ["status.md"]);
  assert.equal(serialize(buildReport({ root }, quiet)), serialize(buildReport({ root }, quiet)));
});

