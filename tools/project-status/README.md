# project-status

Builds the git-derived status report (`.hgate/status.json`). See
`docs/plans/2026-11-21-lifecycle-tracking-and-status-board.md` (Track B).

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
