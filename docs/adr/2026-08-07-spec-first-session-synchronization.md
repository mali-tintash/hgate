# ADR-002: Require Session-Start Specification Synchronization

**Status:** Accepted
**Date:** 2026-08-07
**Decision owners:** hGATE maintainers
**Reviewers:** Project contributors
**Review trigger/date:** Revisit if repository tooling can prove provenance and specification conformance automatically

## Context

hGATE is specification-driven: approved BC specifications lead implementation.
Engineers may still make direct code changes outside governed agent sessions.
Those changes can alter behavior without updating BDD scenarios, domain models,
contracts, or decisions, causing the specification and implementation to
diverge silently.

A clean working tree does not prove synchronization because manual changes may
already be committed.

## Decision Drivers

- Preserve specifications as the source of truth
- Detect committed and uncommitted manual changes
- Require human confirmation of behavioral intent
- Reconcile one owning BC at a time
- Prevent new work from building on silent specification drift

## Alternatives Considered

### Check only the working tree

Insufficient because committed manual changes are invisible to `git status`.

### Trust committed code as the new specification

Rejected because committing code does not confirm business intent and reverses
the spec-first dependency.

### Inspect provenance and reconcile behavior before every session

Adds startup overhead but prevents long-lived specification drift.

## Decision

Every project session begins by asking whether code changed manually outside a
synchronized agent session.

- When yes, inspect the complete committed range from the first manual commit
  through `HEAD`, classify changes, confirm behavioral intent, and reconcile each
  affected BC through `bc-enhancement`.
- When no, verify the working tree and local/unpushed commits. Any unexplained
  change returns to the manual-change path.
- Do not start unrelated work while an intended behavioral change remains absent
  from the owning BC's specification and tests.

The reusable protocol lives in `templates/CLAUDE.hgate.md` and must be merged
into adopting projects' agent instructions.

## Architecture Invariants

- Specifications lead implementation.
- Code provenance alone does not establish business intent.
- Every behavioral change has one owning BC.
- Multi-BC reconciliation uses one fork per BC.
- A session cannot silently proceed with known specification drift.

## Consequences

### Positive

- Manual changes cannot silently invalidate BDD and domain artifacts.
- Agents begin from synchronized specifications and implementation.
- User confirmation distinguishes intended behavior from accidental drift.

### Negative and Tradeoffs

- Every session has a synchronization check.
- Manual behavioral changes may require separate BC enhancement sessions before
  planned work begins.
- Engineers must commit manual changes to establish a stable inspection range.

## Validation

- README installation requires the complete hGATE instruction template.
- The template checks both the working tree and committed local changes.
- Intended behavioral changes route through owning-BC enhancement.
- New work remains blocked until synchronization completes or risk is explicitly
  deferred.
