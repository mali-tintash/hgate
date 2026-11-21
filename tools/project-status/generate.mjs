#!/usr/bin/env node
// Git-derived status report (T6b).
//
// Builds `.hgate/status.json`: per bounded context, every Transition History
// row of `status.md` attributed to the commit that introduced it (git blame),
// semantic diffs between consecutive transition snapshots, and the D1
// baselines (since last transition, since HEAD~1, uncommitted).
//
// Dependency-free (Node 18+). Git is invoked with execFileSync (no shell) and
// `--no-optional-locks`, read-only. See README.md ("T6b").

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { diffSnapshots, parseFrontmatter, snapshotBc, splitSections } from "./snapshot.mjs";

export const STATUS_SCHEMA_VERSION = 1;
export const UNCOMMITTED = "uncommitted";
const WORKTREE = "\u0000worktree";
const ZERO_SHA = /^0{40}$/;

const HELP = `Usage: node tools/project-status/generate.mjs --root <dir> [options]

Options:
  --root <dir>          Project root (default: current directory)
  --out <file>          Output file relative to root (default: .hgate/status.json)
  --skills-path <dir>   BC skills directory for discovery fallback (default: .github/skills)
  --bdd                 Embed \`verify:bdd --format json\` summary as coverage
  --stdout              Print the JSON report to stdout instead of writing it
                        (the human summary then goes to stderr)
  --help                Show this help
`;

class UsageError extends Error {}

// ------------------------------------------------------------------ args

export function parseArgs(argv) {
  const opts = { root: ".", out: ".hgate/status.json", skillsPath: ".github/skills", bdd: false, stdout: false, help: false };
  const value = (i, flag) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new UsageError(`${flag} requires a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") opts.root = value(i++, arg);
    else if (arg === "--out") opts.out = value(i++, arg);
    else if (arg === "--skills-path") opts.skillsPath = value(i++, arg);
    else if (arg === "--bdd") opts.bdd = true;
    else if (arg === "--stdout") opts.stdout = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new UsageError(`unknown argument: ${arg}`);
  }
  return opts;
}

// ------------------------------------------------------------------- git

const toPosix = (p) => p.split(path.sep).join("/");

function makeGit(root) {
  const run = (args, { allowFail = false } = {}) => {
    try {
      return execFileSync("git", ["--no-optional-locks", ...args], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C", GIT_PAGER: "cat" },
      });
    } catch (error) {
      if (allowFail) return null;
      throw error;
    }
  };
  return run;
}

/** Inspect the repository at `root`. Never throws. */
export function gitContext(root) {
  const git = makeGit(root);
  const ctx = { git, available: false, head: null, headSubject: null, shallow: false, branch: null, prefix: "", parent: null, warning: null };
  let inside;
  try {
    inside = git(["rev-parse", "--is-inside-work-tree"], { allowFail: true });
  } catch {
    inside = null;
  }
  if (inside === null || inside.trim() !== "true") {
    ctx.warning = "git unavailable or not a repository: report built from the working tree only (no commit attribution)";
    return ctx;
  }
  ctx.available = true;
  ctx.prefix = (git(["rev-parse", "--show-prefix"], { allowFail: true }) ?? "").trim();
  ctx.shallow = (git(["rev-parse", "--is-shallow-repository"], { allowFail: true }) ?? "").trim() === "true";
  const branch = git(["symbolic-ref", "--short", "-q", "HEAD"], { allowFail: true });
  ctx.branch = branch && branch.trim() ? branch.trim() : null;
  const head = git(["rev-parse", "--verify", "-q", "HEAD^{commit}"], { allowFail: true });
  if (head && head.trim()) {
    ctx.head = head.trim();
    ctx.headSubject = commitInfo(ctx, ctx.head)?.subject ?? null;
    const parent = git(["rev-parse", "--verify", "-q", "HEAD~1^{commit}"], { allowFail: true });
    ctx.parent = parent && parent.trim() ? parent.trim() : null;
  } else {
    ctx.warning = "repository has no commits yet: every transition is reported as uncommitted";
  }
  if (ctx.shallow) {
    ctx.warning =
      "shallow clone detected: transition commits cannot be attributed reliably; fetch full history (fetch-depth: 0)";
  }
  return ctx;
}

function commitInfo(ctx, sha) {
  ctx.commitCache ??= new Map();
  if (ctx.commitCache.has(sha)) return ctx.commitCache.get(sha);
  const out = ctx.git(["show", "-s", "--format=%H%x00%h%x00%aI%x00%s", sha, "--"], { allowFail: true });
  let info = null;
  if (out) {
    const [full, short, date, subject] = out.replace(/\n$/, "").split("\u0000");
    info = { sha: full, shortSha: short, date, subject };
  }
  ctx.commitCache.set(sha, info);
  return info;
}

// ------------------------------------------------------------ BC files

const SNAPSHOT_FILE = /^(SKILL\.md|bdd-scenarios\.md|domain-model\.md|decisions\.md|status\.md|properties\.md|.+-acl\.md)$/;

function readWorktreeFiles(root, dir) {
  const abs = path.join(root, dir);
  const files = {};
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return files;
  for (const name of readdirSync(abs).sort()) {
    if (!SNAPSHOT_FILE.test(name)) continue;
    const file = path.join(abs, name);
    if (statSync(file).isFile()) files[name] = readFileSync(file, "utf8");
  }
  return files;
}

function listTree(ctx, rev, dir, recursive) {
  const out = ctx.git(["ls-tree", ...(recursive ? ["-r"] : []), "--name-only", "--full-name", rev, "--", `${dir}/`], {
    allowFail: true,
  });
  if (!out) return [];
  const base = `${ctx.prefix}${dir}/`;
  return out
    .split("\n")
    .filter((p) => p.startsWith(base))
    .map((p) => p.slice(base.length))
    .sort();
}

function readBlob(ctx, rev, relPath) {
  return ctx.git(["show", `${rev}:${ctx.prefix}${relPath}`], { allowFail: true });
}

function readRevisionFiles(ctx, rev, dir) {
  const files = {};
  for (const name of listTree(ctx, rev, dir, false)) {
    if (!SNAPSHOT_FILE.test(name)) continue;
    const content = readBlob(ctx, rev, `${dir}/${name}`);
    if (content !== null) files[name] = content;
  }
  return files;
}

/** BC files that differ between HEAD and the working tree (tracked + untracked, not ignored). */
function uncommittedFiles(ctx, root, dir) {
  const headFiles = new Set(ctx.head ? listTree(ctx, ctx.head, dir, true) : []);
  const lsArgs = (extra) => ["ls-files", ...extra, "--", `${dir}/`];
  const listed = [
    ...(ctx.git(lsArgs([]), { allowFail: true }) ?? "").split("\n"),
    ...(ctx.git(lsArgs(["--others", "--exclude-standard"]), { allowFail: true }) ?? "").split("\n"),
  ]
    .filter(Boolean)
    .map((p) => toPosix(p))
    .filter((p) => p.startsWith(`${dir}/`))
    .map((p) => p.slice(dir.length + 1));
  const candidates = new Set([...headFiles, ...listed]);
  const changed = [];
  for (const name of candidates) {
    const abs = path.join(root, dir, name);
    const onDisk = existsSync(abs) && statSync(abs).isFile();
    if (!headFiles.has(name)) {
      if (onDisk) changed.push(name);
      continue;
    }
    if (!onDisk) {
      changed.push(name);
      continue;
    }
    const blob = execBlobBuffer(ctx, `${dir}/${name}`);
    if (blob === null || !blob.equals(readFileSync(abs))) changed.push(name);
  }
  return changed.sort();
}

function execBlobBuffer(ctx, relPath) {
  try {
    return execFileSync("git", ["--no-optional-locks", "show", `${ctx.head}:${ctx.prefix}${relPath}`], {
      cwd: ctx.root,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------- transition history

const stripTicks = (v) => {
  const t = String(v ?? "").trim();
  const m = /^`([^`]*)`$/.exec(t);
  return m ? m[1].trim() : t;
};

function splitRow(line) {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|")) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

const isPlaceholder = (v) => {
  const t = stripTicks(v);
  return t === "" || t === "..." || /^\[.*\]$/.test(t) || /^<.*>$/.test(t) || t.includes("YYYY-MM-DD");
};

/**
 * Transition History rows with their 1-based line numbers.
 * Returns [{ line, date, from, to, evidence, actor }] in document order.
 */
export function parseTransitionHistory(statusMd) {
  const all = String(statusMd ?? "").replace(/\r\n?/g, "\n").split("\n");
  const rows = [];
  let inSection = false;
  let header = null;
  let fence = false;
  for (let i = 0; i < all.length; i += 1) {
    const line = all[i];
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      if (h[1].length <= 2) {
        inSection = h[1].length === 2 && h[2].trim().toLowerCase() === "transition history";
        header = null;
      }
      continue;
    }
    if (!inSection || !line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (!header) {
      header = cells.map((c) => c.toLowerCase());
      continue;
    }
    if (/^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes("-") && cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const get = (pred) => {
      const idx = header.findIndex(pred);
      return idx === -1 ? "" : cells[idx] ?? "";
    };
    const row = {
      line: i + 1,
      date: stripTicks(get((c) => c === "date")),
      from: stripTicks(get((c) => c === "from")),
      to: stripTicks(get((c) => c === "to")),
      evidence: get((c) => c.startsWith("evidence")),
      actor: get((c) => c.startsWith("actor") || c === "session"),
    };
    if (cells.every((c) => c.trim() === "") || isPlaceholder(row.to) || isPlaceholder(row.date)) continue;
    rows.push(row);
  }
  return rows;
}

/** Map of final line number -> commit sha (or null for uncommitted) from `git blame --porcelain`. */
function blameLines(ctx, relPath) {
  const out = ctx.git(["blame", "--porcelain", "--", relPath], { allowFail: true });
  if (out === null) return null;
  const lines = new Map();
  for (const line of out.split("\n")) {
    const m = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/.exec(line);
    if (m) lines.set(Number(m[2]), ZERO_SHA.test(m[1]) ? null : m[1]);
  }
  return lines;
}

// ---------------------------------------------------------------- BCs

/** Discover BCs: projection first (`docs/hgate-project.json`), else `<skills-path>/*\/status.md`. */
export function discoverBoundedContexts(root, skillsPath, warn = () => {}) {
  const projectionFile = path.join(root, "docs", "hgate-project.json");
  if (existsSync(projectionFile)) {
    try {
      const projection = JSON.parse(readFileSync(projectionFile, "utf8"));
      if (Array.isArray(projection.boundedContexts)) {
        return projection.boundedContexts
          .filter((bc) => bc && typeof bc.id === "string" && bc.id)
          .map((bc) => ({
            id: bc.id,
            dir: bc.sources?.status ? path.posix.dirname(toPosix(bc.sources.status)) : `${trimSlash(skillsPath)}/${bc.id}`,
          }))
          .sort((a, b) => cmp(a.id, b.id));
      }
    } catch (error) {
      warn(`docs/hgate-project.json unreadable (${error.message}); scanning ${skillsPath} instead`);
    }
  }
  const skillsDir = path.join(root, skillsPath);
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter((name) => existsSync(path.join(skillsDir, name, "status.md")))
    .sort(cmp)
    .map((name) => ({ id: name, dir: `${trimSlash(toPosix(skillsPath))}/${name}` }));
}

const trimSlash = (p) => p.replace(/^\.\//, "").replace(/\/+$/, "");
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function buildBc(ctx, root, bc) {
  const dir = trimSlash(bc.dir);
  const cache = new Map();
  const snapshotAt = (rev) => {
    const key = rev ?? "\u0000none";
    if (!cache.has(key)) {
      let files;
      if (rev === null) files = null;
      else if (rev === WORKTREE) files = readWorktreeFiles(root, dir);
      else files = readRevisionFiles(ctx, rev, dir);
      cache.set(key, files === null ? null : snapshotBc(files));
    }
    return cache.get(key);
  };

  const worktree = snapshotAt(WORKTREE);
  const statusRel = `${dir}/status.md`;
  const statusAbs = path.join(root, statusRel);
  const statusMd = existsSync(statusAbs) ? readFileSync(statusAbs, "utf8") : "";
  const rows = parseTransitionHistory(statusMd);

  const attribute = ctx.available && !ctx.shallow;
  let blame = null;
  if (attribute && rows.length) {
    blame = ctx.head ? blameLines(ctx, statusRel) : new Map();
    if (blame === null) {
      const tracked = ctx.head && readBlob(ctx, ctx.head, statusRel) !== null;
      if (tracked) ctx.warnings.push(`${bc.id}: git blame failed for ${statusRel}; steps left unattributed`);
      else blame = new Map(); // untracked file: every row uncommitted
    }
  }

  // Revision per row: sha | WORKTREE | null (unknown).
  const revs = rows.map((row) => {
    if (!attribute || blame === null) return null;
    const sha = blame.get(row.line);
    return sha ? sha : WORKTREE;
  });

  const steps = [];
  if (revs.every((r) => r !== null)) {
    let previous = null;
    let i = 0;
    while (i < rows.length) {
      let j = i;
      while (j + 1 < rows.length && revs[j + 1] === revs[i]) j += 1;
      const current = snapshotAt(revs[i]);
      const groupDiff = diffSnapshots(previous, current);
      const empty = diffSnapshots(current, current);
      for (let k = i; k <= j; k += 1) {
        steps.push(stepRecord(ctx, rows[k], revs[k], j > i, k === j ? groupDiff : empty));
      }
      previous = current;
      i = j + 1;
    }
  } else {
    for (const row of rows) steps.push(stepRecord(ctx, row, null, false, null));
  }

  const headSnap = ctx.available && ctx.head ? snapshotAt(ctx.head) : null;
  let sinceLastTransition;
  let sincePreviousCommit;
  let uncommitted;
  if (ctx.available && ctx.head) {
    const lastRev = revs.length ? revs[revs.length - 1] : undefined;
    if (lastRev === undefined || lastRev === null) {
      sinceLastTransition =
        lastRev === undefined
          ? { baseCommit: null, changes: diffSnapshots(null, headSnap) }
          : { baseCommit: null, changes: null };
    } else if (lastRev === WORKTREE) {
      sinceLastTransition = { baseCommit: UNCOMMITTED, changes: diffSnapshots(worktree, worktree) };
    } else {
      sinceLastTransition = { baseCommit: commitInfo(ctx, lastRev), changes: diffSnapshots(snapshotAt(lastRev), headSnap) };
    }
    sincePreviousCommit = ctx.parent
      ? { baseCommit: commitInfo(ctx, ctx.parent), changes: diffSnapshots(snapshotAt(ctx.parent), headSnap) }
      : { baseCommit: null, changes: diffSnapshots(null, headSnap) };
    uncommitted = { changes: diffSnapshots(headSnap, worktree), files: uncommittedFiles(ctx, root, dir) };
  } else if (ctx.available) {
    // Repository without commits: everything is uncommitted.
    sinceLastTransition = { baseCommit: rows.length ? UNCOMMITTED : null, changes: rows.length ? diffSnapshots(worktree, worktree) : diffSnapshots(null, worktree) };
    sincePreviousCommit = { baseCommit: null, changes: null };
    uncommitted = { changes: diffSnapshots(null, worktree), files: uncommittedFiles(ctx, root, dir) };
  } else {
    // No git: only the working tree is known; its whole content counts as "since last transition".
    sinceLastTransition = { baseCommit: null, changes: diffSnapshots(null, worktree) };
    sincePreviousCommit = { baseCommit: null, changes: null };
    uncommitted = { changes: null, files: [] };
  }

  return {
    id: bc.id,
    dir,
    lifecycle: worktree?.lifecycle ?? parseFrontmatter(statusMd).lifecycle ?? null,
    steps,
    sinceLastTransition,
    sincePreviousCommit,
    uncommitted,
  };
}

function stepRecord(ctx, row, rev, sharedCommit, changes) {
  let commit = null;
  if (rev === WORKTREE) commit = UNCOMMITTED;
  else if (rev) commit = commitInfo(ctx, rev);
  return {
    from: row.from,
    to: row.to,
    date: row.date,
    actor: row.actor,
    evidence: row.evidence,
    line: row.line,
    commit,
    sharedCommit,
    changes,
  };
}

// --------------------------------------------------------------- coverage

function runBddCoverage(root) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(root, "tools", "bdd-traceability", "verify.mjs"), path.join(here, "..", "bdd-traceability", "verify.mjs")];
  const verifier = candidates.find((c) => existsSync(c));
  if (!verifier) return { status: "unavailable", exitCode: null, summary: null, error: "tools/bdd-traceability/verify.mjs not found" };
  let stdout = "";
  let exitCode = 0;
  try {
    stdout = execFileSync(process.execPath, [verifier, "--root", root, "--format", "json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    exitCode = typeof error.status === "number" ? error.status : 2;
    stdout = typeof error.stdout === "string" ? error.stdout : "";
  }
  try {
    const report = JSON.parse(stdout);
    const scenarios = Array.isArray(report.scenarios) ? report.scenarios : [];
    return {
      status: exitCode === 0 ? "ok" : "failed",
      exitCode,
      summary: report.summary ?? null,
      diagnosticCodes: [...new Set((report.diagnostics ?? []).map((d) => d.code).filter(Boolean))].sort(),
      scenarioCount: scenarios.length,
    };
  } catch {
    return { status: "error", exitCode, summary: null, error: "verify:bdd did not produce JSON output" };
  }
}

// ---------------------------------------------------------------- report

/** Build the report object. `warn` receives one-line warnings. */
export function buildReport(opts, warn = () => {}) {
  const root = path.resolve(opts.root);
  const ctx = gitContext(root);
  ctx.root = root;
  ctx.warnings = [];
  if (ctx.warning) warn(ctx.warning);
  const bcs = discoverBoundedContexts(root, opts.skillsPath ?? ".github/skills", warn);
  const boundedContexts = bcs.map((bc) => buildBc(ctx, root, bc));
  for (const w of ctx.warnings) warn(w);
  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    git: {
      available: ctx.available,
      head: ctx.head,
      headSubject: ctx.headSubject,
      shallow: ctx.shallow,
      branch: ctx.branch,
    },
    boundedContexts,
    coverage: opts.bdd ? runBddCoverage(root) : null,
  };
}

export const serialize = (report) => `${JSON.stringify(report, null, 2)}\n`;

const countOf = (changes) => {
  if (changes === null || changes === undefined) return "n/a";
  const s = changes.summary;
  return `+${s.added} -${s.removed} ~${s.modified}${s.moved ? ` moved ${s.moved}` : ""}`;
};

export function humanSummary(report) {
  const out = [];
  const g = report.git;
  out.push(
    `project-status: git ${g.available ? `${g.head ? g.head.slice(0, 12) : "(no commits)"}${g.branch ? ` on ${g.branch}` : ""}${g.shallow ? " (shallow)" : ""}` : "unavailable"}; ${report.boundedContexts.length} bounded context(s)`,
  );
  for (const bc of report.boundedContexts) {
    const uncommittedSteps = bc.steps.filter((s) => s.commit === UNCOMMITTED).length;
    out.push(
      `  ${bc.id} [${bc.lifecycle ?? "?"}] steps ${bc.steps.length}${uncommittedSteps ? ` (${uncommittedSteps} uncommitted)` : ""}; since last transition ${countOf(bc.sinceLastTransition.changes)}; since previous commit ${countOf(bc.sincePreviousCommit.changes)}; uncommitted ${countOf(bc.uncommitted.changes)} in ${bc.uncommitted.files.length} file(s)`,
    );
  }
  if (report.coverage) {
    const c = report.coverage;
    out.push(
      `  coverage: ${c.status}${c.summary ? ` (${c.summary.coveredScenarios}/${c.summary.scenarios} scenarios covered, ${c.summary.errors} error(s))` : c.error ? ` (${c.error})` : ""}`,
    );
  }
  return out.join("\n");
}

export function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`project-status: ${error.message}\n${HELP}`);
    return 2;
  }
  if (opts.help) {
    io.stdout.write(HELP);
    return 0;
  }
  const root = path.resolve(opts.root);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    io.stderr.write(`project-status: --root ${opts.root} is not a directory\n`);
    return 2;
  }
  const report = buildReport(opts, (message) => io.stderr.write(`project-status: WARNING ${message}\n`));
  const text = serialize(report);
  const summary = `${humanSummary(report)}\n`;
  if (opts.stdout) {
    io.stdout.write(text);
    io.stderr.write(summary);
    return 0;
  }
  const outFile = path.resolve(root, opts.out);
  const previous = existsSync(outFile) ? readFileSync(outFile, "utf8") : null;
  if (previous !== text) {
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, text);
  }
  io.stdout.write(summary);
  io.stdout.write(`${previous === text ? "unchanged" : "wrote"} ${toPosix(path.relative(root, outFile))}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
