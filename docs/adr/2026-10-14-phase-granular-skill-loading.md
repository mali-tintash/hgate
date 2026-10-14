# Phase-granular skill loading

## Asked

`bc-enhancement`, `bc-implementation`, `bc-refinement` and `bc-review` had
`SKILL.md` files of 21-27 KB that are loaded whole into agent context at skill
start, although most of the text applies only to a later phase.

## Findings

Phase bodies are only needed when the phase is reached. Rules, gates, golden
and standing rules must be visible from the start.

## Decision

Keep in `SKILL.md`: overview, inputs/outputs, Non-Negotiable/Golden/Standing
Rules, gates (Triviality Gate, Specification Readiness Gate), cross-cutting
sections, small phases, and every phase heading. Move the verbatim body of large
phases to `references/phase-*.md`; each moved phase keeps its heading in the core
followed by a mandatory "read this file in full before doing any work in this
phase" instruction. No rule text was rewritten.

`tools/skill-split/verify.mjs` (run by `npm test`) compares against the
pre-split baseline commit `hgate-pre-split-baseline` (a git tag: the unsplit skills plus the generator and verify-spec changes, derived from `c2aa637`): every original line and heading must appear
exactly once across core and references, nothing else may be added except the
stub and reference-intro lines, and all links and reference pointers must resolve.

| Skill | Before (bytes) | After core (bytes) |
| --- | --- | --- |
| bc-enhancement | 27037 | 12132 |
| bc-implementation | 26139 | 15212 |
| bc-refinement | 25826 | 13737 |
| bc-review | 21335 | 5899 |
