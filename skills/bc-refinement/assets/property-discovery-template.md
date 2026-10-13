# <BC Name> Property Discovery Inventory

Required companion to `properties.md` whenever Goal 3 is selected. It records
how universal properties were discovered from approved business rules, so a
reviewer can see what was considered, kept, rejected, or deferred. Keep it in
`.github/skills/<bc-name>/property-discovery.md`. It is separate from
`properties.md` because every `##` heading there is a property declaration.

Concrete examples stay in `bdd-scenarios.md`. A BDD scenario may *seed* a
candidate, but the candidate must generalize it; never restate a named example
as a property.

## Source rules

List every approved business rule in scope, each with a stable handle taken from
`SKILL.md` or `bdd-scenarios.md` (section heading, invariant ID, or scenario
ID that motivates the rule).

| Rule ref | Source | Rule (one line) |
|---|---|---|
| R1 | `SKILL.md#<section>` | <approved rule> |

## Candidate families

For every rule, evaluate every family below. Do not skip a family silently; a
family that cannot apply is recorded as `REJECTED` with a rule-specific reason.

| Family | Question to ask |
|---|---|
| Operation-preserved invariant | What stays true before and after every operation? |
| Conservation / accounting | What quantities must sum, balance, or be conserved? |
| Idempotence | Does repeating the operation change the result? |
| Monotonicity | What must only grow, shrink, or never regress? |
| Round-trip | Does inverse/serialize/parse/undo restore the original? |
| Order independence | Does input or command order change the outcome? |
| Alternate-path equivalence | Do two routes to the same state agree? |
| Lifecycle transition safety | Which transitions are forbidden or terminal? |
| Authorization / tenant isolation | Can another actor or tenant observe or change it? |
| Failure atomicity | After a failure, is state unchanged or fully rolled back? |
| Retry / replay | Is duplicate delivery or retry safe? |
| Boundary / overflow | What happens at limits, empty, max, rounding, overflow? |

## Candidate inventory

One row per (rule × family) candidate. Decision is exactly `ACCEPTED`,
`REJECTED`, or `DEFERRED`.

| Candidate | Rule ref | Family | Candidate claim | Decision | Reason | Property / follow-up |
|---|---|---|---|---|---|---|
| @candidate:<BC>-001 | R1 | Conservation / accounting | <universal claim> | ACCEPTED | <why it is falsifiable and worth testing> | `@property:<BC>-<CAPABILITY>-001` |
| @candidate:<BC>-002 | R1 | Idempotence | <claim> | REJECTED | <rule-specific reason, e.g. operation is intentionally non-idempotent per R1> | N/A |
| @candidate:<BC>-003 | R2 | Retry / replay | <claim> | DEFERRED | <why not now> | Owner: <name>; risk accepted: <risk>; revisit: <trigger> |

### Rules

- `ACCEPTED` requires a `@property:` ID that exists in `properties.md`. Every
  property in `properties.md` must list its candidate(s) and source rule(s) and
  must be referenced by at least one `ACCEPTED` row (no orphan properties).
- `REJECTED` needs a substantive reason tied to the rule (not "not applicable"
  or "trivial"). Valid reasons include: contradicted by an approved rule, not
  observable through a stable oracle, already enforced by a stronger accepted
  property, or fully covered by a finite-state check.
- `DEFERRED` needs an owner, the accepted risk, and a revisit trigger. A
  deferral is visible debt, not completion.
- Ceremonial claims (non-negative totals, non-empty IDs, "no exception thrown")
  count as coverage only when the rule itself is that claim. Otherwise record
  them as `REJECTED` or fold them into a stronger accepted property.
- Each rule needs at least one non-ceremonial candidate considered across the
  families; a rule with only ceremonial `ACCEPTED` properties must explain why
  stronger families were rejected.
- Material rule changes require re-running the inventory for that rule; retire
  or revise affected candidates and record retired property IDs in
  `decisions.md`.
- The human reviews and approves this inventory together with `properties.md`
  before any property implementation begins.
