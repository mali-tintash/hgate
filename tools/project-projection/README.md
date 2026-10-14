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

## Sources

| Projected field | Authoritative source |
|---|---|
| `project.name` / `description` | `**Project:**` / `**Description:**` lines in `docs/domain-map.md` |
| `domains` | `## Domain Inventory` table in `docs/domain-map.md` |
| BC id, name, domain, classification, role, owns, doesNotOwn | `## Bounded Context Inventory` table |
| `capabilities` | `## Business Capabilities` table (Owning BC = BC ID or name) |
| `lifecycle` | `lifecycle:` frontmatter of the BC's `status.md` |
| `purpose` | first paragraph of `## Purpose` in the BC `SKILL.md` |
| `ports` | `## Ports` table in `domain-model.md` |
| `acls` | each `*-acl.md`: frontmatter `acl`/`name`, `system`, `direction`; first paragraph of `## Purpose` |
| `sources` | existing `SKILL.md`, `domain-model.md`, `status.md`, `bdd-scenarios.md` |
| `relationships`, `journeys` | `## Context Relationships` and `## Cross-BC Journeys` in `docs/context-map.md` |

The BC directory is the dirname of the table's `Local status` path (falling
back to `.github/skills/<bc-id>`). Template placeholder rows (`[...]`) are
skipped. Cells may be wrapped in backticks; multiple `owns` entries are
separated by `;`.

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
