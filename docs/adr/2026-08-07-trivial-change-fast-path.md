# ADR-004: Triviality Gate for Implementation-Detail Changes

**Status:** Accepted
**Date:** 2026-08-07
**Decision owners:** hGATE maintainers
**Reviewers:** Project contributors
**Review trigger/date:** Revisit if the fast path is observed to hide behavioral drift

## Context

`bc-enhancement` runs the same full pipeline — ghost-behavior audit, consequence
interview, skill-file sync, implementation plan approval, and sweep — for every
change to an already-built BC, regardless of size. The session-start
synchronization protocol (ADR-002) already fast-paths manually written code that
turns out to be a pure implementation detail. No equivalent fast path exists for
a small, AI-authored fix made inside a governed `bc-enhancement` session, so a
null-guard, log line, or rename pays the same ceremony cost as a business-rule
change.

Under-scoping this gate reintroduces the exact spec drift hGATE exists to
prevent, so the gate must default to the full pipeline whenever the change is
ambiguous.

## Decision Drivers

- Reduce ceremony cost for changes with no observable behavior impact
- Never let the fast path become a loophole for silent spec drift
- Reuse the classification concept already trusted in ADR-002 instead of
  inventing a second one
- Keep the human confirming the classification, not the AI deciding alone

## Alternatives Considered

### No fast path; always run the full pipeline

Simplest and safest, but imposes full-pipeline cost (consequence interview,
skill sync, traceability matrix) on changes with zero spec impact, which
discourages small AI-driven fixes from going through governed sessions at all.

### Let the AI silently skip ceremony for "obviously small" changes

Rejected. Removes the human confirmation step that every other hGATE gate
requires, and "obviously small" is exactly the judgment call that produces
undetected ghost behavior.

### Explicit triviality gate with conservative, human-confirmed criteria

Adopted. Keeps the existing confirm-before-proceeding pattern, but only asks a
single yes/no question instead of a full plan approval when the change
qualifies.

## Decision

`bc-enhancement` gains a **Phase 0.5 — Triviality Gate** immediately after
Phase 0's full state read. The agent classifies the change against a fixed
checklist and states its reasoning. The change is **Implementation-detail**
only if every criterion holds; any single failure, or any uncertainty, makes it
**Behavioral**.

Implementation-detail changes skip the ghost-behavior audit, consequence
interview, skill-file sync, and full sweep. They still require: the fix, a
passing run of existing targeted tests with unmodified assertions, a scoped
stale-reference grep, and a one-line dated note in the BC's `decisions.md`. No
`status.md` transition occurs.

Behavioral changes are unaffected by this ADR and continue through the existing
full pipeline unchanged.

## Architecture Invariants

- The gate defaults to Behavioral whenever any criterion is unmet or unclear.
- A human confirms the classification before the fast path is taken; the AI
  never self-approves it.
- The fast path never edits `bdd-scenarios.md`, scenario IDs, `domain-model.md`,
  or any `*-acl.md` file. Any such edit forces the Behavioral path.
- The fast path never changes an existing test's assertions — only mechanical
  updates (e.g., import paths) are allowed within it.
- Fast-path changes remain confined to one BC and do not change any port or
  interface signature.

## Consequences

### Positive

- Small AI-authored fixes made inside governed sessions get proportionate
  process cost.
- The existing manual-change classification concept (ADR-002) is reused instead
  of duplicated with different rules.
- Reviews can still audit fast-path decisions from the one-line `decisions.md`
  trail.

### Negative and Tradeoffs

- A misclassified change could hide a small behavioral drift; the strict,
  human-confirmed, default-to-Behavioral criteria mitigate but do not eliminate
  this risk.
- Two classification mechanisms now exist (ADR-002 for out-of-band manual
  edits, this ADR for in-session AI edits) that must be kept conceptually
  aligned.

## Validation

- `bc-enhancement` rejects a fast-path classification when any criterion is
  unmet.
- `bc-review` may sample fast-path `decisions.md` entries against the actual
  diff to confirm no behavioral change was misclassified.
