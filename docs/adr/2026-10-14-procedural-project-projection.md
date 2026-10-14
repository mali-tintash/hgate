# ADR-008: Generate `docs/hgate-project.json` Procedurally

**Status:** Accepted
**Date:** 2026-10-14
**Decision owners:** hGATE maintainers
**Reviewers:** Project contributors
**Review trigger/date:** Revisit if the projection schema moves past version 1

## Context

Specialist skills (`bc-refinement`, `bc-review`, `bc-enhancement`,
`bc-implementation`) hand-synchronized the JSON projection from Markdown. This
is mechanical, error-prone, and spends LLM tokens on work with a single correct
answer.

## Decision

`tools/project-projection/generate.mjs` builds the projection from
`domain-map.md`, `context-map.md`, and each BC's `SKILL.md`, `status.md`,
`domain-model.md`, `*-acl.md` and `bdd-scenarios.md`, validates it against the
schema plus cross-references, and offers `--check` (non-zero on drift). Skills
run `npm run project:sync` instead of editing JSON; hooks and CI run
`project:check`. The JSON stays derived and is never edited by hand.

The CLI is dependency-free and ships a minimal schema-subset validator rather
than adding a JSON Schema library. ACL metadata that has no table home is read
from `*-acl.md` frontmatter (`acl`, `system`, `direction`).

## Consequences

- Authoritative Markdown must carry the `**Project:**` line and structured
  tables; missing data fails generation instead of being guessed.
- A regression test proves byte-for-byte reproduction of
  `docs/hgate-project.example.json` and idempotence.
