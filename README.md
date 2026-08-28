# hGATE

**human Guided AI assisted Traceable Engineering**

hGATE is a manual, guided workflow for specification-driven development with AI
code generation. It combines:

- Domain-Driven Design to establish domains and bounded contexts
- Behavior-Driven Development to make business behavior explicit
- Test-Driven Development to implement approved specifications
- Local decision and lifecycle artifacts to prevent context drift

The AI recommends and executes one specialist stage at a time. Humans confirm
requirements, boundaries, plans, and workflow transitions.

## Quick Start

### 1. Add hGATE to your project

Clone this repository, then copy the skill directories into your target
repository:

```bash
mkdir -p /path/to/your-project/.github/skills
cp -R skills/* /path/to/your-project/.github/skills/
```

Preserve each skill's `SKILL.md`, `assets/`, `references/`, and `decisions.md`.

### 2. Install the complete hGATE project instructions

Merge [`templates/CLAUDE.hgate.md`](templates/CLAUDE.hgate.md) into your
project's `CLAUDE.md` or equivalent agent instructions.

If your project has no agent instructions yet, use it as the starting file:

```bash
cp templates/CLAUDE.hgate.md /path/to/your-project/CLAUDE.md
```

If your project already has a `CLAUDE.md`, preserve its architecture, testing,
and engineering conventions and append the complete hGATE template. 

The template includes the mandatory session-start synchronization protocol. It
checks for manual changes, inspects committed diffs, distinguishes
implementation details from behavioral changes, confirms intent with the user,
and reconciles each affected BC's specifications and tests before new work
continues.

Do not copy this repository's root `CLAUDE.md` into another project; it contains
project-specific example guidance. Use the reusable template above.

### 3. Start with the guide

Ask your AI agent:

```text
Use hgate-guide. I want to start using hGATE for this project.
```

The guide will ask what you are trying to accomplish, inspect available
artifacts, and recommend exactly one next skill. It will not start that skill or
advance lifecycle state automatically.

For a brand-new project, the first recommendation will usually be:

```text
Use domain-exploration to understand this problem and identify its domains and
bounded contexts.
```

## Workflow

```text
domain-exploration
  -> bc-refinement              (one BC, thin first slice is enough)
  -> bc-review spec-only        (recommended)
  -> bc-implementation          (one fork per BC)
  -> bc-review full
  -> bc-enhancement             (iterative: new capability, changed rule, bug, gap)
  -> bc-review full             (after each significant enhancement)
  -> cross-bc-validation        (when a journey spans implemented BCs)
```

You do not need a complete specification before first delivery. Refine and
implement a thin first slice, then extend the BC iteratively through
`bc-enhancement` as the domain is better understood.

```text
Brownfield (existing codebase, no hGATE artifacts)
  -> domain-exploration         (code, APIs, schemas, journeys as evidence)
  -> bc-refinement              (produce first-draft spec from existing code)
  -> bc-review full             (surface drift between spec and code)
  -> bc-enhancement             (close drift, bugs, and gaps)
```

Use `architecture-decision-exploration` when business boundaries are already
understood but a technical or cross-system architecture decision remains open.

## Skill Catalog

| Skill | Use it when | Main output | Fork |
| --- | --- | --- | --- |
| `hgate-guide` | You do not know the next workflow step | One recommended skill with inputs and completion signal | No |
| `domain-exploration` | The problem, language, capabilities, or BC boundaries are unclear | Confirmed domain map, context map, and BC handoffs | Yes |
| `architecture-decision-exploration` | A technical or cross-system architecture decision is unresolved | ADR or design report | Yes |
| `bc-refinement` | One BC needs an approved specification | BC skill, domain model, BDD scenarios, decisions, status, and ACLs | Yes |
| `bc-review` | One BC needs a read-only specification or implementation audit | Evidence-based findings | One BC per invocation |
| `bc-implementation` | One refined BC has no material implementation | Tested implementation and traceability report | Yes |
| `bc-enhancement` | An implemented BC needs new capability, a changed rule, a bug fix, or a gap closed — including iterative slices after first delivery | Synchronized specification and code with ghost behavior removed | Yes |
| `cross-bc-validation` | One completed journey crosses several implemented BCs | Feature-local contract and journey validation report | Yes |

## Persistent Artifacts

```text
docs/
  domain-map.md                 # confirmed domains, BCs, and ownership
  context-map.md                # relationships between BCs
  adr/                          # one file per cross-cutting decision
  features/<feature>/
    validation.md               # one cross-BC journey report

.github/skills/<bc-name>/
  SKILL.md                      # BC purpose, rules, lifecycle, module design
  domain-model.md               # aggregates, values, ports, and persistence
  bdd-scenarios.md              # business scenarios with stable traceability IDs
  decisions.md                  # decisions owned by this BC
  status.md                     # lifecycle state owned by this BC
  *-acl.md                      # external contract translation
```

Decision and status files are local to their owning skill or BC. hGATE does not
use global append-only decision or lifecycle files because they create merge
conflicts during parallel work.

## BDD Scenario Viewer

`tools/gherkin-viewer/index.html` is a standalone, dependency-free page for
reading `bdd-scenarios.md` files without parsing raw Gherkin/Markdown by eye.

Open it directly in a browser (no server or build step required):

```bash
open tools/gherkin-viewer/index.html
```

Then click **Load file** and select a BC's `bdd-scenarios.md`. The viewer:

- extracts fenced ` ```gherkin ` blocks from the Markdown and renders each
  `Feature` as a collapsible section
- renders `Background` steps in a distinct highlighted block per feature
- renders each `Scenario`/`Scenario Outline` as its own card with
  color-coded `Given`/`When`/`Then`/`And`/`But` steps
- shows each scenario's `@scenario:<id>` tag as a pill for quick traceability
  back to tests
- supports live filtering by tag, scenario title, or step text, and a
  "Collapse all features" control for scanning large files

## Lifecycle

```text
DISCOVERED
  -> REFINING
  -> REFINED
  -> SPEC_REVIEWED              (recommended, policy-dependent)
  -> IMPLEMENTING
  -> IMPLEMENTED
  -> VERIFIED
```

Changes to an implemented BC use:

```text
IMPLEMENTED | VERIFIED
  -> CHANGING
  -> IMPLEMENTED
  -> VERIFIED
```

Every BC owns its lifecycle in `.github/skills/<bc-name>/status.md`.

## Example Prompts

### Discover a new product area

```text
Use domain-exploration. We want customers to request refunds, but we have not
identified the business capabilities or bounded contexts yet.
```

### Refine one BC

```text
Use bc-refinement for the Refund Decisions BC. Use the confirmed domain and
context maps as input. Do not design another BC in this session.
```

### Implement an approved BC

```text
Use bc-implementation for the Refund Decisions BC. Its specification is
approved. Implement it test-first in a forked context.
```

### Change existing behavior

```text
Use bc-enhancement for the Refund Decisions BC. Approved refunds now expire
after seven days. Update the specification first and remove contradictory old
behavior.
```

### Add a new capability slice to an existing BC

```text
Use bc-enhancement for the Refund Decisions BC. We now need to support partial
refunds. The initial implementation only handled full refunds. Update the
specification first, then implement the new slice.
```

### Onboard a brownfield codebase

```text
Use domain-exploration. This is an existing e-commerce platform with no hGATE
artifacts. Use the current codebase, API routes, database schema, and team
knowledge as evidence to identify the domains and bounded contexts.
```

```text
Use bc-refinement for the Order Management BC. There is no existing
specification. Read the current source code, API contracts, and database schema
as evidence and produce a first-draft specification of what the BC currently
does and is intended to do.
```

### Validate a cross-BC journey

```text
Use cross-bc-validation for the Refund Completion journey across Refund
Decisions and Payments. Validate contracts and runtime wiring without modifying
either BC.
```

## Adoption Levels

- **Lite:** domain exploration when needed, refinement, implementation, and
  enhancement
- **Standard:** Lite plus the guide, persistent maps, lifecycle tracking, and BC
  reviews
- **Enterprise:** Standard plus ADRs, required independent reviews, and
  cross-BC validation

See [the adoption guide](docs/adoption-guide.md) for new-project and
existing-codebase adoption, artifact ownership, parallel team practices, and
completion checks.

## Core Rules

1. Every session reconciles manual changes before starting new work.
2. One BC per refinement, implementation, review, or enhancement session.
3. Ask and confirm rather than silently closing requirement gaps.
4. Specifications describe current behavior, not change history.
5. Initial implementation uses tests before production behavior.
6. Existing behavior changes use `bc-enhancement`, not `bc-implementation`.
7. Cross-BC dependencies use published contracts, ports, events, and ACLs.
8. Cross-BC validation is read-only; fixes return to the owning BC.
9. Decisions and lifecycle state stay local to their owner.
10. Every BDD scenario has a stable ID referenced by meaningful executable
    tests.
11. A trivial, no-spec-impact change may take `bc-enhancement`'s fast path only
    with explicit human confirmation; default to the full pipeline otherwise.

## Why hGATE

hGATE is most valuable when:

- A project is expected to live for years
- Multiple engineers or AI agents work in parallel
- Business rules evolve frequently
- Regression costs are material

It optimizes for **time to reliable change**, not PR count. The framework reduces
forgotten decisions, contradictory requirements, duplicated business rules,
ghost behavior, context drift, and tribal knowledge.

It works equally well on greenfield and brownfield projects. On brownfield
codebases, `domain-exploration` and `bc-refinement` use the existing code,
APIs, and schemas as evidence to produce first-draft specifications; `bc-review
full` then surfaces drift between the spec and the code.

Presentation:
[Google Slides](https://docs.google.com/presentation/d/1Rlt7gmf7c9DqZFTiga4myCYpJbLtBvQvo3i-W0Aq9dw/edit?slide=id.g3f455ea9a55_0_95#slide=id.g3f455ea9a55_0_95)

Video:
[YouTube](https://www.youtube.com/watch?v=oNJZR_BFW-c)
