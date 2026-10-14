#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Last commit before the large skills were split into core + references.
export const BASELINE_REF = "hgate-pre-split-baseline";
export const SPLIT_SKILLS = ["bc-enhancement", "bc-implementation", "bc-refinement", "bc-review"];

const INTRO_RE = /^Reference for the ".*" section of `SKILL\.md`\./;
const STUB_RE = /^\*\*Before doing any work in this phase, read `references\/[^`]+` in full/;

function headings(text) {
  let fence = false;
  const found = [];
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("```")) fence = !fence;
    else if (!fence && /^#{1,6} /.test(line)) found.push(line);
  }
  return found;
}

function count(lines) {
  const map = new Map();
  for (const l of lines) map.set(l, (map.get(l) ?? 0) + 1);
  return map;
}

export function verifySkillSplit(root, skill, baselineText) {
  const errors = [];
  const dir = path.join(root, "skills", skill);
  const core = readFileSync(path.join(dir, "SKILL.md"), "utf8");
  const refDir = path.join(dir, "references");
  const phaseRefs = existsSync(refDir)
    ? readdirSync(refDir).filter((f) => f.startsWith("phase-"))
    : [];
  if (phaseRefs.length === 0) errors.push(`${skill}: no phase reference files found`);

  const refTexts = phaseRefs.map((f) => readFileSync(path.join(refDir, f), "utf8"));
  // Links in moved text are re-based from SKILL.md-relative to references/-relative.
  const combined = [core, ...refTexts.map((t) => t.replaceAll("](./", "](./references/"))].join("\n");

  // Every phase reference must be instructed from the core and resolve.
  for (const f of phaseRefs) {
    if (!core.includes(`references/${f}`)) errors.push(`${skill}: SKILL.md never points to references/${f}`);
  }
  for (const m of core.matchAll(/`references\/([^`]+)`/g)) {
    if (!existsSync(path.join(refDir, m[1]))) errors.push(`${skill}: broken reference references/${m[1]}`);
  }
  for (const [file, text] of [["SKILL.md", core], ...phaseRefs.map((f, i) => [`references/${f}`, refTexts[i]])]) {
    const base = file === "SKILL.md" ? dir : refDir;
    for (const m of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(m[1])) continue;
      if (!existsSync(path.resolve(base, m[1]))) errors.push(`${skill}/${file}: broken link ${m[1]}`);
    }
  }

  // Headings: every original heading appears exactly as many times as before.
  const want = count(headings(baselineText));
  const got = count(headings(combined));
  for (const [h, n] of want) if ((got.get(h) ?? 0) !== n) errors.push(`${skill}: heading "${h}" expected ${n}x, found ${got.get(h) ?? 0}x`);
  for (const [h, n] of got) if (!want.has(h)) errors.push(`${skill}: unexpected heading "${h}" (${n}x)`);

  // Lines: nothing lost, nothing added except stubs and reference intros.
  const have = count(combined.split("\n").filter((l) => l.trim() && !INTRO_RE.test(l) && !STUB_RE.test(l)));
  const orig = count(baselineText.split("\n").filter((l) => l.trim()));
  for (const [l, n] of orig) if ((have.get(l) ?? 0) < n) errors.push(`${skill}: lost line (${n - (have.get(l) ?? 0)}x): ${l.slice(0, 80)}`);
  for (const [l, n] of have) if ((orig.get(l) ?? 0) < n) errors.push(`${skill}: added line: ${l.slice(0, 80)}`);
  return errors;
}

export function verifyAll(root, ref = BASELINE_REF) {
  return SPLIT_SKILLS.flatMap((skill) => {
    const baseline = execFileSync("git", ["show", `${ref}:skills/${skill}/SKILL.md`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
    return verifySkillSplit(root, skill, baseline);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const errors = verifyAll(root, process.argv[2] ?? BASELINE_REF);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log("Skill split verified: no content lost, all references resolve.");
}
