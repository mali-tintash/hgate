---
bounded_context: <bc-name>
classification: Core | Supporting | Generic | Unconfirmed
lifecycle: DISCOVERED
last_updated: YYYY-MM-DD
---

# <BC Name> Lifecycle Status

## Current State

**Lifecycle:** `DISCOVERED`

**Evidence:**

- Confirmed in `docs/domain-map.md`

**Blockers:**

- None

**Recommended next skill:** `bc-refinement`

## Transition History

| Date | From | To | Evidence | Actor/session |
|---|---|---|---|---|
| YYYY-MM-DD | - | DISCOVERED | Confirmed domain exploration | [...] |

## Gate Evidence

Gate catalog and rules: `skills/hgate-guide/references/lifecycle-gates.md`.
Write gate rows before changing `lifecycle:`.

| Transition | Gate | Kind | Result | Evidence | Signed by | Date |
|---|---|---|---|---|---|---|
| - -> DISCOVERED | GATE-DISC-BOUNDARY | H | PASS | BC row in `docs/domain-map.md`; relationships in `docs/context-map.md` | [Name (Tech lead or Technical PM)] | YYYY-MM-DD |
| - -> DISCOVERED | GATE-PROJ-SYNC | D | PASS | `npm run project:check` in-sync | - | YYYY-MM-DD |

## Open Items

| ID | Item | Owner | Disposition |
|---|---|---|---|
| [G<n> or OI-<n>] | [...] | [...] | Open / Deferred |
