# Specification Verifier (`verify-spec`)

Dependency-free Node.js CLI (Node 18+) that deterministically checks a bounded
context's specification files, so agents run a tool instead of re-reading files
against an LLM checklist. It covers the mechanical checks of `bc-refinement`
Phase 6 (items 1, 2, 4, 6, 11, 12) and the consistency part of
`bc-implementation` Phase 1. Judgment checks (ambiguity, YAGNI, BC isolation,
rule-to-scenario coverage, VO discipline) stay with the agent.

## Run

```bash
node tools/verify-spec/verify.mjs --root .                      # refinement gate, all BCs
node tools/verify-spec/verify.mjs --bc cart                     # one BC
node tools/verify-spec/verify.mjs --bc cart --phase implementation
```

Recommended script: `"verify:spec": "node tools/verify-spec/verify.mjs --root ."`.

Options: `--skills-path` (default `.github/skills`), `--src-path` (default `src`,
searched for `*.event.ts`), `--require-source` (events must exist on disk, not
just in the SKILL.md module tree; use after the build), `--format text|json`.

A BC is any `--skills-path` subdirectory with a `domain-model.md` or
`bdd-scenarios.md`. Output is failures only, one line each, plus a summary:

```text
VSP005 .github/skills/cart/bdd-scenarios.md:8 uses anti-term "basket" from the SKILL.md glossary; use the ubiquitous term
verify-spec FAILED (refinement): 1 issue(s)
```

Success prints a single `verify-spec OK` line. Exit codes: `0` clean, `1`
defects, `2` usage/discovery error (`VSP900`).

## Codes

| Code | Check |
|---|---|
| VSP001 | `Key Aggregates` entry has no `class` in `domain-model.md` |
| VSP002 | `Domain Events Emitted` event has no `<kebab-name>.event.ts` in the module tree (or source with `--require-source`) |
| VSP003 | `External Integrations` names an `*-acl.md` that does not exist |
| VSP004 | `External Integrations` entry names no `*-acl.md` |
| VSP005 | Scenario text uses an anti-term from the glossary's `NOT:` column |
| VSP006 / 007 / 008 | Scenario has no / multiple / malformed `@scenario:<ID>` tag |
| VSP009 | Scenario ID duplicated anywhere in the repository |
| VSP010 | `domain-model.md` Ports table missing or lacks Name/Direction/Purpose/Contract |
| VSP011 / 012 / 013 | Port has an empty field / invalid direction / is listed twice |
| VSP014 | `SKILL.md`, `domain-model.md` or `bdd-scenarios.md` missing |
| VSP015 | Required `SKILL.md` section missing (Key Aggregates, Domain Events Emitted, External Integrations) |

`--phase implementation` adds readiness gaps: `VSP101` event without payload,
`VSP102` port contract `TBD`, `VSP103` ACL without `Port Interface`, `VSP104`
unresolved `[OPEN]` question, `VSP105` persistence placement (tenant/public) not
stated, `VSP106` `status.md` missing or lifecycle not
`REFINED`/`SPEC_REVIEWED`/`IMPLEMENTING`.

Scenario-ID uniqueness (`VSP009`) always considers every BC, even with `--bc`.

## Tests and golden fixtures

`tests/fixtures/good` is a known-good BC that must stay clean in both phases.
`tests/verify.test.mjs` copies it, applies one deliberate defect per case (no
class, missing event file, missing ACL doc, duplicate scenario ID, ...), and
asserts the stable code and `file:line`. Run `npm test`.
