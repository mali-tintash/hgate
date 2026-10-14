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

Content preservation was verified once during the migration with a throwaway
script comparing every original line and heading, plus all links and reference
pointers, against the unsplit skills. The tool was not kept. The unsplit
originals remain available at the `pre-skill-split` tag on `main`
(commit `c2aa637`).

| Skill | Before (bytes) | After core (bytes) |
| --- | --- | --- |
| bc-enhancement | 27037 | 12132 |
| bc-implementation | 26139 | 15212 |
| bc-refinement | 25826 | 13737 |
| bc-review | 21335 | 5899 |
