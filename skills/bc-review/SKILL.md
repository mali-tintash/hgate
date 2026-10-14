---
name: bc-review
description: "Use this skill to review, audit, or assess a Bounded Context in two phases: first inspect its skill/specification files for failure paths, boundaries, ambiguity, contradictions, authorization, tenant isolation, concurrency, external failures, observability, and audit requirements; then verify every finding against implementation code and tests. Trigger phrases: BC review, bounded context review, review skill files, specification audit, check findings in code, documentation versus implementation, gap analysis."
argument-hint: "<bounded-context-name> [full|spec-only|code-verification]"
---

# Bounded Context Two-Phase Review

## Purpose

Perform a repeatable, evidence-based review of one Bounded Context (BC):

1. **Specification review** — identify weaknesses in the BC's skill files without inspecting code.
2. **Code verification** — determine whether each reported concern is covered, partially covered,
   missing, or intentionally deferred in implementation and tests.

This is a read-only review of specifications and source code. Do not modify
specification, source, migration, or test files. The only authoritative write is
the target BC's local `status.md` after the final report is complete. When that
lifecycle value changes, also update the derived `docs/hgate-project.json`.

## Inputs

- BC name, matching `.github/skills/<bc-name>/`
- Review mode:
  - `full` — run both phases; default
  - `spec-only` — stop after Phase 1
  - `code-verification` — verify an existing findings list supplied by the user
- Optional business description from the user

If the BC or mode is unclear, ask one focused question using the question tool.

## Non-Negotiable Rules

1. Review one BC per invocation.
2. Keep Phase 1 code-blind: do not inspect `src/**`, migrations, or tests.
3. Do not silently redesign adjacent BCs. Record cross-BC concerns as deferred items.
4. Every material claim must cite an exact file and line range.
5. Distinguish documented intent, executable behavior, and test coverage.
6. A test asserting behavior is evidence of intent and regression protection, not proof that all
   runtime paths are safe.
7. Do not report style, naming, or speculative architecture preferences.
8. Prioritize correctness, security, data isolation, financial duplication, and recoverability.
9. Never expose credentials, tokens, PII, gift-card secrets, or raw sensitive log contents in the
   report.
10. Do not edit specification, source, migration, or test files during either
    review phase. Lifecycle metadata may be updated only after reporting.

## Phase 0 — Scope and Context

### 0.1 Inventory documentation

Read:

1. Every file under `.github/skills/<bc-name>/`
2. Project-wide conventions (`CLAUDE.md`, `AGENTS.md`, or equivalent)
3. Skill files for every adjacent BC named by the target BC

Reading adjacent BC documentation is required to identify ownership boundaries. Do not inspect
adjacent implementation code during this phase.

### 0.2 Establish business intent

If the user has not already described the intended behavior, ask:

> Please describe the business behavior of the `<bc-name>` BC — what triggers it, what it does,
> and what outcomes it produces.

Do not infer business intent solely from route or class names.

### 0.3 Declare the scope lock

Before reporting findings, state:

```text
Scope lock: This review covers the <bc-name> BC only.

In scope:
- <behavior and contracts owned by this BC>

Out of scope:
- <adjacent BC>: <what it owns>

Cross-BC concerns will be recorded as deferred items, not redesigned here.
```

### 0.4 Check cohesion

Assess whether the BC still has one reason to change. Flag a cohesion concern when at least two
of these signals occur:

- Independent business capabilities
- Unrelated aggregates or lifecycles
- Different actors triggering independent workflows
- Unrelated external integrations
- Different operational or authorization models
- Different reasons to change

Report the concern, but continue the review unless the user explicitly requests refinement.

## Phase 1 — Specification Review

**Before doing any work in this phase, read `references/phase-1-specification-review.md` in full and follow it exactly. It contains the complete body of this phase; do not proceed from memory or skip it.**

## Phase 2 — Code Verification

**Before doing any work in this phase, read `references/phase-2-code-verification.md` in full and follow it exactly. It contains the complete body of this phase; do not proceed from memory or skip it.**

## Quality Checklist

Before returning the final report, verify:

- [ ] One BC remained in scope
- [ ] Phase 1 did not inspect implementation code
- [ ] Every Phase 1 finding appears once in Phase 2
- [ ] Every material claim has an exact citation
- [ ] Authorization and resource ownership were assessed separately
- [ ] Database tenant isolation and external-resource ownership were assessed separately
- [ ] Request idempotency and downstream idempotency were assessed separately
- [ ] Unknown-outcome and partial-success paths were considered
- [ ] External failures include timeout, rate limit, `5xx`, malformed response, and eventual consistency
- [ ] Observability includes both traceability and redaction
- [ ] Tests were treated as supporting evidence, not conclusive proof
- [ ] Every current scenario ID was mapped to executable tests
- [ ] Unknown and retired test references were reported
- [ ] Module-scoped BDD-to-TDD sign-off evidence was classified as current,
      stale, or missing
- [ ] Undocumented safeguards were reported
- [ ] Cross-BC concerns were deferred, not redesigned
- [ ] No specification, source, migration, or test files were modified
- [ ] Any authoritative lifecycle update was limited to the target BC's
      `status.md`; the derived project projection was synchronized and validated
