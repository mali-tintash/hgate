# project-status

Builds the git-derived status report (`.hgate/status.json`): for each BC, what
changed at every lifecycle transition, since the last transition, since the
previous commit, and in the uncommitted working tree. The viewer
(`tools/gherkin-viewer/index.html`) shows it as change summaries and a per-BC
timeline; without it, the timeline lists transitions only and suggests running
`npm run project:status`.

Unlike the committed projection (`docs/hgate-project.json`), this file is
derived from git, gitignored and never drift-checked. Design: ADR-009
([`docs/adr/2026-11-21-lifecycle-gate-evidence-and-status-report.md`](../../docs/adr/2026-11-21-lifecycle-gate-evidence-and-status-report.md)).

## T6a: `snapshot.mjs` (pure semantic snapshot)

No git and no filesystem access; the caller (T6b) reads file contents at a
revision and passes them in. Dependency-free (uses `node:crypto`).

### `snapshotBc(files) -> Snapshot`

`files` maps a filename relative to one `.github/skills/<bc>/` directory to its
content: `SKILL.md`, `bdd-scenarios.md`, `domain-model.md`, `decisions.md`,
`status.md`, `properties.md`, `*-acl.md`. Missing files yield empty categories.

`Snapshot = { version, lifecycle, <category>: Item[] }`, `Item = { key, label, hash }`
(`hash` = sha256 of normalised content: trailing whitespace trimmed, blank-line
runs collapsed). Lists keep document order; duplicate keys get `#2`, `#3`.

| Category | Source | Key |
|---|---|---|
| `features` | `Feature:` blocks (title, description, Background) | feature title |
| `scenarios` | Scenario / Outline incl. tags, steps, Examples (lines trimmed) | `@scenario:<ID>` (`title:<t>` if untagged) |
| `rules` | SKILL.md `## Core Business Rules` numbered items; items also carry `number` | content hash; label `#<n>: <first 80 chars>` |
| `skill` | SKILL.md `## ` sections except Core Business Rules | heading |
| `model` | domain-model.md `## ` sections | heading |
| `ports` | domain-model.md `## Ports` table rows | port name |
| `decisions` | decisions.md `## ` sections | heading |
| `acls` | each `*-acl.md`, whole file | filename |
| `aclSections` | `## ` sections of each `*-acl.md` | `<file>#<heading>` |
| `properties` | properties.md `## @property:<ID>` sections | `@property:<ID>` |
| `gates` | status.md Gate Evidence rows | `<transition>\|<gate>\|<date>` |
| `openItems` | status.md Open Items rows | ID, or item text when ID is empty/`-` |
| `lifecycle` | status.md frontmatter `lifecycle:` | scalar or `null` |

Template placeholders are ignored: `[...]`/`<...>` cells or headings, rows
containing `YYYY-MM-DD`, and scenario IDs containing `<`. Headings inside
fenced code blocks do not split sections.

### `diffSnapshots(before, after) -> Diff`

`before` may be `null` (everything added). For each category in `CATEGORIES`:
`{ added: [{key,label}], removed: [{key,label}], modified: [{key,label,hashBefore,hashAfter}] }`,
sorted by key. Adds `lifecycle: { from, to }` only when it changed, and
`summary: { added, removed, modified, moved, changed }`.

Rules (D5, content-hash identity) are matched in three passes:

1. Same content hash: unchanged. If the number differs, the rule is listed in
   `rules.moved` (`{key,label,numberBefore,numberAfter}`); pure renumbering or
   reordering is not a content change and does not set `summary.changed`.
2. Remaining rules with the same number: `modified` (key = new hash, plus
   `previousKey`, `labelBefore`, `numberBefore`, `numberAfter`).
3. The rest: `added` / `removed`.

### Other exports

`CATEGORIES`, `SNAPSHOT_VERSION`, `emptySnapshot()`, `normalize(text)`,
`hashContent(text)`, `parseFrontmatter(md)`, `splitSections(md, level = 2)`,
`parseTable(sectionBody)`, `parseGherkin(md)`, `extractRules(skillMd)`.

Output is deterministic and timestamp-free: identical input gives deep-equal
results and identical `JSON.stringify` output.

Tests: `node --test tools/project-status/tests/*.test.mjs`.

## T6b: `generate.mjs` (git walker and status report CLI)

```bash
node tools/project-status/generate.mjs --root . [--out .hgate/status.json] \
  [--skills-path .github/skills] [--bdd] [--stdout]
```

Writes `.hgate/status.json` (gitignored, D2) only when its content changed and
prints a one-line-per-BC summary. `--stdout` prints the JSON instead and moves
the summary to stderr. Exit 0 on success, including the degraded modes below;
exit 2 on usage errors (unknown flag, missing value, `--root` not a directory).
Git runs read-only through `execFileSync` with `--no-optional-locks`.

**BC discovery:** `docs/hgate-project.json` `boundedContexts[].id` with the
directory of `sources.status` (else `<skills-path>/<id>`); without a readable
projection, every `<skills-path>/*/status.md` (workflow skills have none and are
skipped).

**Attribution:** `git blame --porcelain` on `status.md` maps every Transition
History row (by line) to the commit that introduced it (renames followed by
blame's default rename detection). Rows blamed to the all-zero sha, or a
`status.md` not tracked at `HEAD`, are `"uncommitted"`. Limitation: a row edited
later (for example its evidence text) is attributed to the editing commit; a
squash merge collapses all its transitions into one commit.

**Snapshots:** `snapshotBc` over the BC files read with `git ls-tree` /
`git show <sha>:<path>` at each distinct transition commit, `HEAD`, `HEAD~1` and
the working tree; each revision is snapshotted once.

### Output (`schemaVersion: 1`)

```text
{ schemaVersion, git: { available, head, headSubject, shallow, branch|null },
  boundedContexts: [ { id, dir, lifecycle,
    steps: [ { from, to, date, actor, evidence, line,
               commit: {sha, shortSha, date, subject} | "uncommitted" | null,
               sharedCommit, changes: Diff | null } ],
    sinceLastTransition: { baseCommit, changes },   // last transition commit -> HEAD
    sincePreviousCommit: { baseCommit, changes },   // HEAD~1 -> HEAD
    uncommitted: { changes, files: [..] } } ],      // HEAD -> working tree
  coverage: null | { status, exitCode, summary, diagnosticCodes, scenarioCount } }
```

`Diff` is `diffSnapshots` output. BCs are sorted by id; steps keep document
order; no timestamps besides commit author dates, so the same repo state gives
identical bytes.

- **Shared commits:** consecutive steps attributed to the same commit (or all
  uncommitted) get `sharedCommit: true`. The diff from the previous commit's
  snapshot is attached to the **last** step of the group; earlier steps of the
  group carry an empty diff (`summary.changed: false`).
- `sinceLastTransition.baseCommit` is `"uncommitted"` (empty diff) when the last
  transition is not committed yet; `null` with a diff from nothing when there
  are no transitions. `sincePreviousCommit.baseCommit` is `null` (diff from
  nothing) when `HEAD` has no parent. `uncommitted.files` lists BC files that
  differ from `HEAD` (tracked or untracked, not ignored), relative to `dir`.
- `--bdd` runs `tools/bdd-traceability/verify.mjs --root <root> --format json`
  (the root's copy, else the one beside this tool). `status` is `ok`, `failed`,
  `error` (no JSON) or `unavailable`; it never fails the report.

### Degraded modes (one-line `WARNING` on stderr, exit 0)

| Situation | `git` | Steps | Baselines |
|---|---|---|---|
| No git / not a repository | `available: false` | `commit: null`, `changes: null` | `sinceLastTransition` = working tree vs nothing; others `changes: null`, `files: []` |
| Shallow clone | `shallow: true` | `commit: null`, `changes: null` | `HEAD~1` and uncommitted computed when available |
| Repository without commits | `head: null` | all `"uncommitted"` | uncommitted = working tree vs nothing |

CI needs full history (`fetch-depth: 0`).

## npm scripts, CI and hooks (T8)

```bash
npm run project:status   # node tools/project-status/generate.mjs --root .
npm test                 # every tool suite, including tools/project-status/tests
```

- **Output is derived and gitignored.** `.hgate/` is in `.gitignore`; never
  commit `.hgate/status.json`. Regenerate it on demand or in CI.
- **Full history required.** Use `fetch-depth: 0` (GitHub Actions
  `actions/checkout`) or `clone: depth: full` (Bitbucket Pipelines). A shallow
  clone degrades the report (`git.shallow: true`, step commits `null`).
- **CI templates.** `templates/ci/hgate-verify.yml` (GitHub Actions) and
  `templates/ci/bitbucket-pipelines.hgate.yml` run `project:check` and
  `verify:spec`, then an optional `project:status` step that uploads
  `.hgate/status.json` as a build artifact (`hgate-status`) and never fails the
  build. Warnings from `verify:spec` (HGS006, HGW001/HGW002) print last and do
  not change the exit code.
- **Hooks.** `templates/hooks/pre-commit` and the Stop hook run `verify:spec`
  (gate checks and gap drift) but never `project:status`.
