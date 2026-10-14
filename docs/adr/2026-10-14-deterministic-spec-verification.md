# ADR-008: Deterministic Specification Verification (`verify-spec`)

**Status:** Accepted
**Date:** 2026-10-14
**Decision owners:** hGATE maintainers
**Review trigger/date:** Revisit if the BC artifact layout or SKILL.md section
conventions change

## Context

`bc-refinement` Phase 6 and `bc-implementation` Phase 1 asked the LLM to
re-read every BC file and tick mechanical consistency checks (aggregate has a
class, event has a file, ACL file exists, scenario tags unique, Ports table
complete). That spends tokens on work a parser does exactly and repeatably.

## Decision

Add `tools/verify-spec`, a dependency-free Node CLI emitting failures only with
stable `VSP###` codes and `file:line`. Skills run it and reserve LLM judgment
for ambiguity, YAGNI, BC isolation, rule coverage, and VO discipline. It is
wired into the CI, pre-commit, and Stop-hook templates as an optional layer.

## Consequences

- Mechanical gate cost becomes near-zero tokens and is identical across runs.
- The tool depends on the documented SKILL.md/domain-model.md section
  conventions; artifacts that diverge from them fail with `VSP010`/`VSP015`.
- Refinement checks the module tree (specs precede code); `--require-source`
  enforces files on disk after the build.
- Scenario-ID uniqueness is duplicated from `bdd-traceability` on purpose so the
  tool works without `typescript`; both use the same ID format.
