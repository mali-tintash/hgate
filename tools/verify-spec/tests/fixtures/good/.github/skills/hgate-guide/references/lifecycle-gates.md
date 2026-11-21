# BC Lifecycle Gates

Gates are the named checks a BC must pass to enter a lifecycle state. This
file is the gate catalog; each BC records its results in the `## Gate
Evidence` table of its own `status.md`. Valid transitions themselves are
defined in `lifecycle-status.md`; this catalog only says which gates apply to
each transition. Decision record: ADR-009
(`docs/adr/2026-11-21-lifecycle-gate-evidence-and-status-report.md`).

## Kinds and Signers

| Kind | Meaning | Who records it |
|---|---|---|
| `H` | Human approval | The specialist skill, naming the human and signer role |
| `D` | Deterministic tool result | The specialist skill, after running the tool |
| `R` | Record only (structured facts, no approval) | The specialist skill |

Signer roles: `Tech lead`, `Technical PM`, `Product owner`. In the catalog,
` / ` separates alternative roles (any one may sign) and `-` means no signer.

## Gate Catalog

Transition notation: `FROM -> TO` using lifecycle state names. `-` as `FROM`
is the initial transition (no previous state). `*` as `FROM` matches any active
state (every state except `DEPRECATED`); `*` as `TO` matches any state. A gate
that applies to several transitions has one row per transition.

| Gate ID | Transition | Kind | Required evidence | Signer |
|---|---|---|---|---|
| GATE-DISC-BOUNDARY | - -> DISCOVERED | H | BC row in `docs/domain-map.md`; relationships in `docs/context-map.md` | Tech lead / Technical PM |
| GATE-REF-SPEC | REFINING -> REFINED | D | `verify-spec` (refinement phase) exit 0 | - |
| GATE-REF-APPROVAL | REFINING -> REFINED | H | Approved spec files, paths listed | Tech lead / Technical PM |
| GATE-SREV-REPORT | REFINED -> SPEC_REVIEWED | H | Persisted `bc-review spec-only` report at `docs/verification/bc-reviews/<bc>/YYYY-MM-DD-spec-only.md`, no unresolved blocking findings | Tech lead |
| GATE-IMPL-READY | REFINED -> IMPLEMENTING | D | `verify-spec --phase implementation` exit 0 | - |
| GATE-IMPL-READY | SPEC_REVIEWED -> IMPLEMENTING | D | `verify-spec --phase implementation` exit 0 | - |
| GATE-IMPL-BDD | IMPLEMENTING -> IMPLEMENTED | D | `verify:bdd` exit 0 | - |
| GATE-IMPL-BDD | CHANGING -> IMPLEMENTED | D | `verify:bdd` exit 0 | - |
| GATE-IMPL-SIGNOFF | IMPLEMENTING -> IMPLEMENTED | H | BDD sign-off record at `docs/verification/bdd-signoffs/<module-slug>/<file>.md` | Tech lead |
| GATE-IMPL-SIGNOFF | CHANGING -> IMPLEMENTED | H | BDD sign-off record at `docs/verification/bdd-signoffs/<module-slug>/<file>.md` | Tech lead |
| GATE-IMPL-PROPS | IMPLEMENTING -> IMPLEMENTED | H | Optional: business-verification sign-off, or decline recorded in `decisions.md` | Tech lead |
| GATE-IMPL-PROPS | CHANGING -> IMPLEMENTED | H | Optional: business-verification sign-off, or decline recorded in `decisions.md` | Tech lead |
| GATE-VER-REPORT | IMPLEMENTED -> VERIFIED | H | Persisted `bc-review full` report at `docs/verification/bc-reviews/<bc>/YYYY-MM-DD-full.md`, no unresolved blocking findings | Tech lead |
| GATE-BLOCK | * -> BLOCKED | R | Blocker, owner and intended return state | - |
| GATE-DEPR | * -> DEPRECATED | H | ADR or decision link recording the replacement or migration | Tech lead / Product owner |
| GATE-PROJ-SYNC | - -> DISCOVERED | D | `npm run project:check` reports in-sync | - |
| GATE-PROJ-SYNC | * -> * | D | `npm run project:check` reports in-sync | - |

## Gate Evidence Table (in `status.md`)

Every BC `status.md` has this section:

```markdown
## Gate Evidence

| Transition | Gate | Kind | Result | Evidence | Signed by | Date |
|---|---|---|---|---|---|---|
| - -> DISCOVERED | GATE-DISC-BOUNDARY | H | PASS | BC row in `docs/domain-map.md`; relationships in `docs/context-map.md` | A. Reviewer (Tech lead) | 2026-11-21 |
| - -> DISCOVERED | GATE-PROJ-SYNC | D | PASS | `project:check` in-sync | - | 2026-11-21 |
```

Column rules:

| Column | Format |
|---|---|
| `Transition` | `FROM -> TO` with concrete state names (never `*`); `-` as `FROM` only for the initial `- -> DISCOVERED` |
| `Gate` | A Gate ID from the catalog whose transition pattern matches this row's transition |
| `Kind` | `H`, `D` or `R`, equal to the catalog kind for that gate |
| `Result` | `PASS`, `FAIL`, `WAIVED` or `N/A` |
| `Evidence` | File paths (backticked), tool command and outcome, or the recorded facts; never empty |
| `Signed by` | For `H` gates and for any `WAIVED` row: `<Name> (<Signer role>)` with a role allowed by the catalog (waivers: `Tech lead`). Otherwise `-` |
| `Date` | `YYYY-MM-DD`, the date the gate was evaluated |

Rows are append-only and in chronological order. A failed attempt stays as a
`FAIL` row; a later row for the same transition and gate supersedes it.

## Validity Rules

1. **Current transition.** The transition into the current state is the last
   Transition History row whose `To` equals the `lifecycle:` frontmatter value.
   Its gate rows are the Gate Evidence rows with the same `Transition` and a
   `Date` on or after that Transition History row's date.
2. **Required gates.** Every catalog row whose pattern matches the current
   transition is required, except `GATE-IMPL-PROPS`.
3. **Satisfied.** A required gate is satisfied when its latest current-transition
   row has Result `PASS`, or `WAIVED` with a `Tech lead` signer and the reason in
   `Evidence`. `FAIL` and `N/A` never satisfy a required gate.
4. **Valid lifecycle value.** The `lifecycle:` value is valid only when every
   required gate of the current transition is satisfied. Gate rows for earlier
   transitions are kept as history and are not re-validated.
5. **Optional gate.** `GATE-IMPL-PROPS` rows may be omitted. When present, use
   `PASS` (business-verification sign-off, or a decline recorded in
   `decisions.md`, linked in `Evidence`) or `N/A`.
6. **Projection sync.** `GATE-PROJ-SYNC` applies to every transition, including
   `- -> DISCOVERED`. Record it after running `npm run project:sync` and
   `npm run project:check`.
7. **Blocked.** `GATE-BLOCK` is `R`: Result `PASS` with blocker, owner and
   intended return state in `Evidence`. Leaving `BLOCKED` for the recorded
   return state requires only `GATE-PROJ-SYNC`.
8. **Write order.** Write the gate rows first, then the Transition History row,
   then change `lifecycle:` and the Current State section.

## Transition Coverage

Every valid transition in `lifecycle-status.md` maps to at least one gate:

| Valid transition | Gates |
|---|---|
| `- -> DISCOVERED` | GATE-DISC-BOUNDARY, GATE-PROJ-SYNC |
| `DISCOVERED -> REFINING` | GATE-PROJ-SYNC |
| `REFINING -> REFINED` | GATE-REF-SPEC, GATE-REF-APPROVAL, GATE-PROJ-SYNC |
| `REFINING -> BLOCKED` | GATE-BLOCK, GATE-PROJ-SYNC |
| `REFINED -> SPEC_REVIEWED` | GATE-SREV-REPORT, GATE-PROJ-SYNC |
| `REFINED -> IMPLEMENTING` | GATE-IMPL-READY, GATE-PROJ-SYNC |
| `REFINED -> BLOCKED` | GATE-BLOCK, GATE-PROJ-SYNC |
| `SPEC_REVIEWED -> IMPLEMENTING` | GATE-IMPL-READY, GATE-PROJ-SYNC |
| `SPEC_REVIEWED -> REFINING` | GATE-PROJ-SYNC |
| `IMPLEMENTING -> IMPLEMENTED` | GATE-IMPL-BDD, GATE-IMPL-SIGNOFF, GATE-IMPL-PROPS (optional), GATE-PROJ-SYNC |
| `IMPLEMENTING -> BLOCKED` | GATE-BLOCK, GATE-PROJ-SYNC |
| `IMPLEMENTED -> VERIFIED` | GATE-VER-REPORT, GATE-PROJ-SYNC |
| `IMPLEMENTED -> CHANGING` | GATE-PROJ-SYNC |
| `IMPLEMENTED -> BLOCKED` | GATE-BLOCK, GATE-PROJ-SYNC |
| `VERIFIED -> CHANGING` | GATE-PROJ-SYNC |
| `CHANGING -> IMPLEMENTED` | GATE-IMPL-BDD, GATE-IMPL-SIGNOFF, GATE-IMPL-PROPS (optional), GATE-PROJ-SYNC |
| `CHANGING -> BLOCKED` | GATE-BLOCK, GATE-PROJ-SYNC |
| `BLOCKED -> <recorded return state>` | GATE-PROJ-SYNC |
| `<any active state> -> DEPRECATED` | GATE-DEPR, GATE-PROJ-SYNC |
