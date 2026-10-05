# Adopting hGATE

## What hGATE Adds

hGATE is a user-guided, specification-driven workflow for AI-assisted software
development:

```text
understand the problem
  -> identify bounded contexts
  -> refine one BC specification
  -> review the specification
  -> implement one BC with TDD
  -> verify specification against code
  -> enhance existing behavior safely
  -> validate completed cross-BC journeys
```

The workflow is deliberately not automated. Humans confirm boundaries,
requirements, plans, and transitions. Specialist skills run in isolated
contexts so one BC does not absorb another BC's decisions.

## Install the Skills

Copy the hGATE skill directories into the repository's skill location:

```text
.github/skills/
  hgate-guide/
  domain-exploration/
  architecture-decision-exploration/
  bc-refinement/
  bc-review/
  bc-implementation/
  bc-enhancement/
  cross-bc-validation/
```

Preserve each skill's `SKILL.md`, `assets/`, `references/`, and `decisions.md`.

Install the deterministic BDD traceability verifier:

```bash
mkdir -p /path/to/your-project/tools
cp -R tools/bdd-traceability \
  /path/to/your-project/tools/
```

For a TypeScript/Jest project, add this required package script:

```json
{
  "scripts": {
    "verify:bdd": "node tools/bdd-traceability/verify.mjs --root ."
  }
}
```

Run `npm run verify:bdd` in CI before or alongside Jest. The command exits
nonzero for duplicate or malformed scenario IDs, scenarios without an active
Jest reference, and Jest references to unknown scenarios. If the adopting
project uses non-default specification or test roots, configure repeatable
`--scenario-path` and `--test-path` arguments in the package script. See
[`tools/bdd-traceability/README.md`](../tools/bdd-traceability/README.md).

Initial implementation and behavioral enhancement must also use
[`tools/bdd-traceability/signoff-loop.md`](../tools/bdd-traceability/signoff-loop.md).
The loop runs Jest and the verifier against a clean candidate revision, asks a
human to sign off or request changes, and repeats after spec-first and
test-first corrections. Store completed records per owning module under
`docs/verification/bdd-signoffs/<module-slug>/`; never edit a signed record.

Goal 3 business-logic verification is optional at every adoption level. During
initial implementation and behavioral enhancement, ask whether the human wants
it for the current BC change.

If selected:

```bash
cp -R tools/business-verification \
  /path/to/your-project/tools/
cd /path/to/your-project
npm install --save-dev fast-check
```

Add `verify:properties` and a project-specific `test:properties` Jest script as
documented in
[`tools/business-verification/README.md`](../tools/business-verification/README.md).
The BC owns `properties.md`, the property verifier runs in CI, and the separate
human loop writes immutable evidence under
`docs/verification/property-signoffs/<module-slug>/`.

If declined, record the current scope and rationale in the BC's `decisions.md`.
Do not install placeholder tooling or create a skipped-verification artifact.

Merge `templates/CLAUDE.hgate.md` into the adopting project's `CLAUDE.md` or
equivalent instructions. Preserve existing project-specific conventions. The
template contains both guided routing and the mandatory session-start
specification synchronization protocol; do not install only the routing
paragraph.

The synchronization protocol must inspect committed as well as uncommitted
manual changes. An intended behavioral change is reconciled through
`bc-enhancement` for each affected BC before unrelated new work proceeds.

## Choose an Adoption Level

### Lite

Use for prototypes, MVPs, and low-risk internal tools:

- `domain-exploration` when boundaries are unclear
- `bc-refinement`
- `bc-implementation`
- `bc-enhancement`

Keep specifications concise, but do not skip confirmation of business rules.

### Standard

Use for team-owned products with evolving behavior:

- All Lite practices
- `hgate-guide`
- BC-local decisions and lifecycle status
- `bc-review spec-only` before implementation
- `bc-review full` after implementation
- Persistent domain and context maps

### Enterprise

Use for long-lived, regulated, multi-team, or high-consequence systems:

- All Standard practices
- Standalone ADRs for cross-cutting decisions
- Cross-BC journey validation
- Contract, concurrency, recovery, audit, and observability requirements
- Required independent reviews before lifecycle transitions

Adoption level changes process depth, not BC isolation or the requirement to
confirm material business decisions.

Goal 3 remains optional even at Enterprise. Risk may motivate recommending it,
but the workflow must ask the human and record a decline rather than silently
enabling stronger verification.

## Repository Artifacts

```text
docs/
  adoption-guide.md
  domain-map.md
  context-map.md
  adr/
    YYYY-MM-DD-<decision-slug>.md
  verification/
    bdd-signoffs/
      <module-slug>/
        YYYY-MM-DD-<change-slug>.md
    property-signoffs/
      <module-slug>/
        YYYY-MM-DD-<change-slug>.md
  features/
    <feature-name>/
      validation.md

.github/skills/
  <bc-name>/
    SKILL.md
    domain-model.md
    bdd-scenarios.md
    properties.md               # optional Goal 3 claims
    decisions.md
    status.md
    *-acl.md
```

### Ownership

- `docs/domain-map.md`: confirmed domains, BCs, capabilities, and boundaries
- `docs/context-map.md`: relationships and business information exchanged
- BC `decisions.md`: decisions owned by one BC
- BC `status.md`: mutable lifecycle state for one BC
- BDD scenario IDs: stable links from approved scenarios to executable tests
- Module sign-off records: immutable evidence that a human accepted passing
  Jest and repository-wide BDD traceability for a clean candidate revision
- Optional property sign-off records: separately approved universal-claim
  evidence, counterexample dispositions, and explicit finite bounds
- `docs/adr/`: one file per cross-cutting architectural decision
- Feature `validation.md`: one cross-BC journey validation report

Do not create global append-only decision or lifecycle files. They become
conflict hotspots when teams work on separate BCs.

Every Gherkin Scenario and Scenario Outline uses a repository-unique tag such as
`@scenario:CART-SUBMIT-001`. Tests that claim coverage include
`[BDD:CART-SUBMIT-001]` in a static Jest `it(...)` or `test(...)` title.
`npm run verify:bdd` checks both uncovered scenarios and test references that no
longer resolve.

A verifier pass is necessary but not sufficient for implementation or
behavioral-enhancement completion. The BDD-to-TDD sign-off loop requires a
human to assess the linked Jest tests, request changes or approve them, and
persist the final decision in the owning module's sign-off directory.

When Goal 3 is selected, property declarations use stable `@property:<ID>`
headings and executable Jest tests use `[PROP:<ID>]`. Generated properties and
stateful checks exercise production TypeScript. Pure finite models may claim
completeness only inside explicit recorded bounds. The property verifier,
execution evidence, and human approval remain separate from BDD examples.

`bc-enhancement` includes a triviality gate. A change with no observable
behavior, contract, or scenario impact may skip the ghost-behavior audit,
consequence interview, and skill-file sync only after explicit human
confirmation of the classification; it still requires passing existing tests,
a stale-reference grep, and a one-line `decisions.md` note. Any doubt defaults
to the full pipeline. The BDD-to-TDD sign-off loop applies to the behavioral
path; the confirmed implementation-detail fast path does not create a new
behavior sign-off.

## Starting a New Project

You do not need a complete specification before first delivery. Refine and
implement a thin first slice per BC, then extend it iteratively through
`bc-enhancement` as the domain is better understood. `bc-enhancement` handles
net-new capability additions just as well as behavior changes and bug fixes —
it updates the spec first, then implements, then sweeps for ghost behavior.

1. Run `domain-exploration` in a fork.
2. Confirm the problem, language, capabilities, domains, and BC boundaries.
3. Persist `docs/domain-map.md` and `docs/context-map.md`.
4. Initialize one local `status.md` per confirmed BC.
5. Choose one BC and run `bc-refinement` in a separate fork.
6. Optionally run `bc-review spec-only`.
7. Run `bc-implementation` in a separate fork.
8. Run `bc-review full`.
9. Repeat for the next BC.
10. When a business journey crosses implemented BCs, run
    `cross-bc-validation`.

Do not refine or implement several BCs in one session.

## Adopting hGATE in an Existing Codebase

On a brownfield project there are no hGATE artifacts yet — the existing code,
APIs, schemas, and team knowledge become the input evidence for producing them.
Do not treat existing modules or services as confirmed BC boundaries.

1. Run `domain-exploration` using current journeys, code, APIs, schemas, and
   team knowledge as evidence.
2. Confirm the domain and context maps with business and engineering owners.
3. For each existing BC, run `bc-refinement` to create its current intended
   specification. The AI reads the existing code as evidence — it does not
   generate specs from thin air. The output is a first-draft specification the
   team then confirms and corrects.
4. Run `bc-review full` to compare the specification with existing code and
   surface drift, bugs, and missing safeguards.
5. Route behavior drift, bugs, and missing safeguards to `bc-enhancement`.
6. Use `bc-implementation` only for a refined BC that has no material
   implementation.

The session-start synchronization protocol is not the right tool for brownfield
onboarding. It classifies *committed changes against existing specs* — without
specs there is nothing to compare against. Start with `domain-exploration`
and `bc-refinement` first.

Do not generate a new implementation over existing behavior simply because the
existing code lacks hGATE artifacts.

## Manual Guided Workflow

Use `hgate-guide` whenever the next stage is unclear. It should recommend one
next skill and explain:

- Why the skill applies
- Required input
- Expected output
- Whether it runs in a fork
- Completion signal
- Expected lifecycle transition

The user starts the recommended skill explicitly.

## Session-Start Specification Synchronization

Every session begins by asking whether manual code changes occurred outside a
synchronized agent session.

- If yes, require the first manual commit hash, inspect the complete range
  through `HEAD`, classify changes, confirm behavioral intent, and reconcile
  each affected BC separately.
- If no, verify the working tree and local/unpushed commits. Unexplained changes
  return to the manual-change path.
- Do not silently treat committed code as the new specification.
- Do not start unrelated work while intended behavior is missing from the
  owning BC's specification and tests.

The complete reusable instructions are maintained in
`templates/CLAUDE.hgate.md`.

## Parallel Team Workflow

Parallelize by BC:

```text
Engineer/agent A -> BC A fork -> BC A files and status
Engineer/agent B -> BC B fork -> BC B files and status
Engineer/agent C -> read-only cross-BC validation
```

Coordination rules:

1. Each fork owns one BC.
2. Keep decisions and status in the owning BC directory.
3. Change domain/context maps only when confirmed boundaries or relationships
   change.
4. Define provider contracts in the owning BC and consumer behavior in the
   consuming BC.
5. Link both BCs to one ADR when a decision is genuinely cross-cutting.
6. Validate a cross-BC journey only after participating BCs are implemented.
7. Fix validation findings through separate owning-BC enhancement sessions.

## Lifecycle

Each BC tracks:

```text
DISCOVERED
  -> REFINING
  -> REFINED
  -> SPEC_REVIEWED       (recommended, policy-dependent)
  -> IMPLEMENTING
  -> IMPLEMENTED
  -> VERIFIED
```

Behavior changes use:

```text
IMPLEMENTED | VERIFIED
  -> CHANGING
  -> IMPLEMENTED
  -> VERIFIED
```

Any stage may become `BLOCKED` with an owner and intended return state.

## When to Use Architecture Exploration

Use `architecture-decision-exploration` after business boundaries are understood
when the unresolved question concerns:

- System topology
- Sync versus async mechanisms
- Shared platform services
- Security or trust boundaries
- Deployment, migration, or operational architecture
- A cross-cutting choice affecting several BCs

Use `domain-exploration` instead when ownership, language, capability, or BC
boundaries remain unclear.

## Completion Checklist

- [ ] The team knows to start with `hgate-guide` when uncertain
- [ ] The complete `templates/CLAUDE.hgate.md` protocol is installed
- [ ] Every session reconciles manual code changes before new work
- [ ] Domain and context maps exist
- [ ] Every active BC has local specification, decisions, and status artifacts
- [ ] Cross-cutting decisions use standalone ADRs
- [ ] Initial implementation and enhancement use different skills
- [ ] Each initial implementation and behavioral enhancement explicitly asks
      whether Goal 3 verification is wanted for the current scope
- [ ] Selected Goal 3 claims, evidence, counterexamples, bounds, and separate
      sign-off follow the business-verification contract
- [ ] Independent review policy matches the selected adoption level
- [ ] Cross-BC fixes are routed to owning BC sessions
- [ ] No global mutable decision or lifecycle file exists
