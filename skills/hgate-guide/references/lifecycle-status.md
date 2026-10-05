# BC Lifecycle Status

## Storage

Each BC owns:

```text
.github/skills/<bc-name>/status.md
```

Do not maintain one global lifecycle table. `docs/domain-map.md` links to each
BC's status file but does not duplicate its mutable lifecycle value.

`docs/hgate-project.json` may project each BC's current lifecycle for viewers,
but it is derived from these local files. It is not a lifecycle authority and
must never be edited as an independent transition.

## States

| State | Meaning | Owning transition |
|---|---|---|
| `DISCOVERED` | Boundary and purpose confirmed; detailed BC specification not approved | `domain-exploration` |
| `REFINING` | BC specification is actively being discussed or updated | `bc-refinement` |
| `REFINED` | BC specification is complete and user-approved | `bc-refinement` |
| `SPEC_REVIEWED` | Independent specification review completed without unresolved blocking findings | `bc-review spec-only` |
| `IMPLEMENTING` | Initial implementation is in progress from approved specifications | `bc-implementation` |
| `IMPLEMENTED` | Initial implementation or enhancement is complete; independent verification may be pending | `bc-implementation` or `bc-enhancement` |
| `VERIFIED` | Independent full BC review found implementation conformant with no unresolved blocking findings | `bc-review full` |
| `CHANGING` | Approved behavior or implementation is being enhanced | `bc-enhancement` |
| `BLOCKED` | Progress cannot continue; blocker and intended return state must be recorded | Any specialist skill |
| `DEPRECATED` | BC is intentionally retired; replacement or migration is recorded | Explicit architecture/domain decision |

## Valid Transitions

```text
DISCOVERED -> REFINING
REFINING -> REFINED
REFINING -> BLOCKED
REFINED -> SPEC_REVIEWED
REFINED -> IMPLEMENTING
REFINED -> BLOCKED
SPEC_REVIEWED -> IMPLEMENTING
SPEC_REVIEWED -> REFINING
IMPLEMENTING -> IMPLEMENTED
IMPLEMENTING -> BLOCKED
IMPLEMENTED -> VERIFIED
IMPLEMENTED -> CHANGING
IMPLEMENTED -> BLOCKED
VERIFIED -> CHANGING
CHANGING -> IMPLEMENTED
CHANGING -> BLOCKED
BLOCKED -> <recorded return state>
<any active state> -> DEPRECATED
```

`SPEC_REVIEWED` is recommended but not mandatory before implementation unless
project policy requires it.

## Update Rules

1. Only the specialist skill completing or blocking a stage updates `status.md`.
2. Update the frontmatter, current-state section, blockers, recommended next
   skill, and transition history together.
3. Do not advance status before the skill's completion gates pass.
4. `BLOCKED` must record the blocker, owner, and intended return state.
5. A behavior change makes previous verification stale:
   `VERIFIED -> CHANGING -> IMPLEMENTED`; run `bc-review full` to return to
   `VERIFIED`.
6. Cross-BC validation does not change BC lifecycle state. It records feature
   findings and routes each failure to its owning BC.
7. After a valid transition, the owning specialist synchronizes that lifecycle
   into `docs/hgate-project.json`, preserves unrelated entries and stable IDs,
   uses deterministic ordering with no timestamps, and validates against
   `docs/hgate-project.schema.json`.
8. A lifecycle transition is not complete for repository tooling until the
   projection is synchronized and valid. A projection-only edit never counts as
   a transition.
