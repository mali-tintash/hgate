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

## Gates

Each transition is guarded by the gates in `lifecycle-gates.md` (the gate
catalog). Every valid transition above maps to at least one gate;
`GATE-PROJ-SYNC` applies to all of them. Each BC records results in the
`## Gate Evidence` table of its `status.md`. A `lifecycle:` value is valid only
when the required gates of the transition into it are satisfied, as defined in
`lifecycle-gates.md` (Validity Rules).

## Update Rules

1. Only the specialist skill completing or blocking a stage updates `status.md`.
2. Update the frontmatter, current-state section, blockers, recommended next
   skill, gate evidence, and transition history together.
3. Do not advance status before the skill's completion gates pass. Write the
   `## Gate Evidence` rows for the transition first (one row per catalog gate
   that applies, including `GATE-PROJ-SYNC`), then the Transition History row,
   and only then change `lifecycle:` and the Current State section. Gate rows
   are append-only; a failed attempt stays as a `FAIL` row.
   Transition History rows may be kept newest-first or oldest-first; keep one
   order within a file. Tools (`project:sync`, `verify:spec`, `project:status`,
   the viewer) normalise either order to chronological order.
4. `BLOCKED` must record the blocker, owner, and intended return state.
5. A behavior change makes previous verification stale:
   `VERIFIED -> CHANGING -> IMPLEMENTED`; run `bc-review full` to return to
   `VERIFIED`.
6. Cross-BC validation does not change BC lifecycle state. It records feature
   findings and routes each failure to its owning BC.
7. After a valid transition, the owning specialist runs `npm run project:sync`
   (`tools/project-projection/generate.mjs`), which regenerates
   `docs/hgate-project.json` deterministically from `status.md` and the other
   Markdown sources and validates it against `docs/hgate-project.schema.json`.
   The JSON is never edited by hand.
8. A lifecycle transition is not complete for repository tooling until the
   projection is synchronized and valid. A projection-only edit never counts as
   a transition.
9. Open Items rows carry an `ID` (a shared gap ID such as `G11`, or a BC-local
   `OI-<n>`) so the projection can join gaps across `domain-map.md`,
   `context-map.md` and `status.md` and warn on differing dispositions.

## Status Report

`tools/project-status` writes `.hgate/status.json`, a gitignored report derived
from git history, the working tree and verifier output (what changed at each
transition and since the last one). It is never committed and never an
authority: it cannot contain the hash of the commit that records a transition,
and it would drift on every code change. Edit `status.md`, not the report.
