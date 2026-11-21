# Project Projection Generator

Dependency-free Node.js (18+) CLI that builds `docs/hgate-project.json`
deterministically from authoritative Markdown and validates it against
`docs/hgate-project.schema.json`. It replaces hand-syncing the JSON, so no LLM
tokens are spent on mechanical projection.

```bash
node tools/project-projection/generate.mjs --root .          # write/refresh
node tools/project-projection/generate.mjs --root . --check  # drift gate, no write
```

Recommended `package.json` scripts:

```json
{
  "scripts": {
    "project:sync": "node tools/project-projection/generate.mjs --root .",
    "project:check": "node tools/project-projection/generate.mjs --root . --check"
  }
}
```

Exit codes: `0` ok / in sync, `1` drift (`HGP001`) or unprojectable sources
(`HGP002`, all problems listed), `2` usage or generator failure (`HGP009`).
Warnings (`HGW…`) never change the exit code.

## Schema version

The generator emits `schemaVersion: 2` (ADR-009,
[`docs/adr/2026-11-21-lifecycle-gate-evidence-and-status-report.md`](../../docs/adr/2026-11-21-lifecycle-gate-evidence-and-status-report.md)).
Version 2 adds per-BC `nextSkill`, `blockers`, `transitions`, `gates`,
`openItems`, `stats` and `signoffs`, and top-level `gaps` and `diagnostics`.
If the project's `docs/hgate-project.schema.json` still declares version 1,
generation stops with `HGP003` ("projection schema upgrade required"): copy the
version 2 schema from hGATE and rerun. `status.md` files without Gate Evidence
or Open Items IDs still generate (empty arrays, `id: null`). Gate rows follow
the format in
[`skills/hgate-guide/references/lifecycle-gates.md`](../../skills/hgate-guide/references/lifecycle-gates.md).

Git history is not projected; it lives in the separate, gitignored status
report (see [`tools/project-status/README.md`](../project-status/README.md)).

## Sources

| Projected field | Authoritative source |
|---|---|
| `project.name` / `description` | `**Project:**` / `**Description:**` lines in `docs/domain-map.md` |
| `domains` | `## Domain Inventory` table in `docs/domain-map.md` |
| BC id, name, domain, classification, role, owns, doesNotOwn | `## Bounded Context Inventory` table |
| `capabilities` | `## Business Capabilities` table (Owning BC = BC ID or name) |
| `lifecycle` | `lifecycle:` frontmatter of the BC's `status.md` |
| `nextSkill` | `**Recommended next skill:**` in `status.md` (backticks stripped; `None`/placeholder → `null`) |
| `blockers` | bullets (or inline value) after `**Blockers:**` in `status.md` `## Current State`, excluding `None` |
| `transitions` | `## Transition History` table in `status.md` (`date`, `from`, `to`, `evidence`, `actor`), chronological order (newest-first or oldest-first tables are normalised by `tools/shared/transitions.mjs`) |
| `gates` | `## Gate Evidence` table in `status.md` (`transition` as `FROM -> TO`, `gate`, `kind` H/D/R, `result` PASS/FAIL/WAIVED/N/A, `evidence`, `signedBy` or `null`, `date`), file order; malformed rows fail with `HGP002` |
| `openItems` | `## Open Items` table in `status.md` (`id` or `null` when the table has no ID column, `item`, `owner`, `disposition`), file order |
| `purpose` | first paragraph of `## Purpose` in the BC `SKILL.md` |
| `ports` | `## Ports` table in `domain-model.md` |
| `acls` | each `*-acl.md`: frontmatter `acl`/`name`, `system`, `direction`; first paragraph of `## Purpose` |
| `sources` | existing `SKILL.md`, `domain-model.md`, `status.md`, `bdd-scenarios.md` |
| `relationships`, `journeys` | `## Context Relationships` and `## Cross-BC Journeys` in `docs/context-map.md` |
| `stats` | Markdown counts per BC, see [Artifact stats](#artifact-stats) |
| `signoffs` | files under `docs/verification/{bdd-signoffs,property-signoffs,bc-reviews}/<bc>/`, see [Sign-off index](#sign-off-index) |
| `gaps`, `diagnostics` | merged gap ledger, see [Gap ledger and warnings](#gap-ledger-and-warnings) |

The BC directory is the dirname of the table's `Local status` path (falling
back to `.github/skills/<bc-id>`). Template placeholder rows (`[...]`) are
skipped; in `status.md` tables a row is skipped when any cell is a whole
`[...]` or `<...>` cell or contains `YYYY-MM-DD`. Missing `status.md` sections
project as empty arrays / `null`. Cells may be wrapped in backticks; multiple `owns` entries are
separated by `;`.

## Gap ledger and warnings

Top-level `gaps[]` joins gaps by ID across three sources, in this order:

1. `## Open Boundary Gaps` in `docs/domain-map.md` (`ID`, `Gap`, `Affected BCs`, `Owner`, `Disposition`)
2. `## Open Relationship Gaps` in `docs/context-map.md` (`ID`, `Relationship`, `Gap`, `Owner`, `Disposition`)
3. `## Open Items` in each BC `status.md`, in BC ID order. A row joins when its
   `ID` is a gap ID (`G<n>`) or appears in a map; local `OI-<n>` items stay out.
   Legacy tables without an `ID` column join on a leading `G<n>` in the item text.

Each entry: `id`, `gap` (text from the first source that has it), `affected`
(map `Affected BCs`, else context-map `Relationship`, else `null`), `state`, and
`sources[]` of `{file, line, bc (null for maps), owner, disposition}`.
Gaps are ordered naturally by ID (`G2` before `G11`).

Each disposition is classified: contains "Resolved" or "Out of scope" →
`RESOLVED`, unless the resolution is scoped ("Resolved for X") or the text also
says "to confirm", "pending" or "deferred for" → `PARTIAL`; contains "Deferred"
→ `DEFERRED`; anything else → `OPEN`. `state` is the shared class; `PARTIAL`
when sources mix only `PARTIAL` and `RESOLVED` (one side resolved, the rest to
confirm: consistent, not drift); otherwise `MIXED` when sources disagree (for
example `DEFERRED` vs `RESOLVED`, or `PARTIAL` vs `OPEN`).

`diagnostics[]` entries are `{code, severity: "warning", message, file, line,
bcId, gapId}`, sorted by code, file, line, gap ID:

| Code | Meaning | Location |
|---|---|---|
| `HGW001` | Gap disposition drift: sources classify differently (`state` is `MIXED`) | first source (usually the domain map) |
| `HGW002` | Gap ID in a BC `status.md` but in neither map | each BC row |

When diagnostics exist, `project:sync` and `project:check` print a
`WARNINGS (n)` block as the last lines of output (after the success line, or
after the `HGP001` report), one line per warning with `file:line`, and still exit
0. With `GITHUB_ACTIONS=true`, `::warning file=…,line=…,title=HGW…::` annotations
are printed just before that block. No block is printed when there are no
warnings. The merge and formatting logic lives in `tools/shared/gaps.mjs`
(pure, no file access) for reuse by other tools.

## Artifact stats

`stats` per BC, counted from Markdown only (no git, no test runs):

| Field | Rule |
|---|---|
| `rules` | unindented numbered items (`1.` or `1)`) under `## Core Business Rules` in `SKILL.md` |
| `features` | `Feature:` lines in `bdd-scenarios.md` |
| `scenarios` | distinct `@scenario:<ID>` tags in `bdd-scenarios.md` |
| `decisions` | `## ` headings in `decisions.md`, excluding headings starting with "Related" |
| `properties` | distinct `@property:<ID>` markers in `properties.md` (0 if absent) |
| `acls`, `ports` | length of the projected `acls` and `ports` |
| `openItems` | Open Items rows whose disposition is not classified `RESOLVED` (`PARTIAL` counts as open) |
| `openGaps` | ledger gaps with a source in this BC's `status.md` whose `state` is not `RESOLVED` (`PARTIAL` counts as open) |

## Sign-off index

`signoffs[]` per BC lists `*.md` files (non-recursive) in
`docs/verification/bdd-signoffs/<slug>/` (`kind: bdd`),
`docs/verification/property-signoffs/<slug>/` (`kind: business`) and
`docs/verification/bc-reviews/<slug>/` (`kind: review`), where `<slug>` is the
BC folder name (dirname of `Local status`) and, if different, the BC ID.
Each entry: `kind`, `file`, `date` (leading `YYYY-MM-DD` of the filename, else
`null`), plus `status` and `outcome` from frontmatter when present. Ordered by
file path.

## Determinism

Output has no timestamps, is ordered by stable ID (capabilities, ports and ACLs
by name), uses a fixed two-space layout with primitive arrays inline, and ends
with a newline. Runs are idempotent: an unchanged result is not rewritten.
Cross-references (domain IDs, relationship and journey BC IDs, duplicate IDs)
are checked in addition to the schema.

The projection cannot decide anything: undecided values must be fixed in the
Markdown, or use the schema's `UNCONFIRMED` value there.

## Example regression

`tests/fixtures/example/` holds Markdown sources whose output is asserted
byte-for-byte equal to `docs/hgate-project.example.json`. No documented diffs
remain.
