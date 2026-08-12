# Change Classification: Implementation-Detail vs. Behavioral

This is the single shared definition of **Implementation-detail** vs.
**Behavioral** used across hGATE. It applies identically whether the change
was:

- made manually, outside a governed agent session (session-start
  synchronization, see ADR-002), or
- made by an AI agent inside a governed `bc-enhancement` session (the
  Triviality Gate, see ADR-004).

Both entry points classify against this one checklist so the criteria cannot
drift independently. Do not restate or fork this checklist elsewhere —
reference this file instead.

## Classify as Implementation-detail only if every item holds

- No `Given`/`When`/`Then` observable outcome changes for any user, external
  system, or API consumer.
- No business rule, validation, or error/edge case is added, removed, or
  changed.
- No request/response shape, DB schema, port/interface signature, or event
  contract changes.
- No scenario is added or removed, and no scenario's expected outcome
  changes.
- Existing tests keep passing without changing their assertions (only
  mechanical updates, e.g. import paths, are allowed).
- The change stays confined to one BC.
- The change is a refactor, rename, comment, defensive guard, or equivalent
  adjustment that does not alter observable business behavior or a published
  contract.

## Classify as Behavioral if any of the following is true

- Any Implementation-detail item above fails, or you are not fully certain
  it holds.
- The change description uses change-intent language ("should now", "add
  support for", "change how", "the requirement is").
- The change touches authorization, tenant isolation, or an external
  contract.
- The change is a new or changed rule, lifecycle transition, validation,
  failure outcome, API/event/port contract, persistence invariant,
  integration behavior, or BDD outcome.

**When uncertain, classify as Behavioral.** This checklist is conservative
by design — under-scoping it reintroduces the spec drift hGATE exists to
prevent.

## Human confirmation is always required

An agent never self-approves an Implementation-detail classification. State
the checklist with a pass/fail per item and the proposed classification, then
require explicit human confirmation before taking the fast path. If the
human disagrees, declines, or does not answer, treat the change as
Behavioral.

## Where this applies

| Context | Trigger | Consuming document |
|---|---|---|
| Manual, out-of-band code changes discovered at session start | Session Start Protocol | `templates/CLAUDE.hgate.md`, ADR-002 |
| AI-authored changes inside a governed `bc-enhancement` session | Phase 0.5 — Triviality Gate | `skills/bc-enhancement/SKILL.md`, ADR-004 |
