# BC Refinement Decisions

## Cross-Cutting References

- [Localized decisions and lifecycle state](../../docs/adr/2026-08-07-localized-workflow-artifacts.md)
- [BDD scenario-to-test traceability](../../docs/adr/2026-08-07-bdd-scenario-test-traceability.md)
- [Optional business-logic verification](../../docs/adr/2026-10-05-optional-business-logic-verification.md)

## Oracle independence for Goal 3 properties

- **Asked:** Can a property oracle be circular or copy the production algorithm?
- **Findings:** `Oracle` only named an observable outcome, permitting
  `expect(f(x)).toEqual(f(x))` and line-for-line "reference" duplicates that
  share production bugs.
- **Decision/Action:** Every property declares `Oracle source` (fixed set) and
  `Oracle independence`; subject and oracle never share an implementation path.
  The verifier enforces declaration (`PROP040`/`PROP041`); `bc-review` and
  human sign-off assess real independence.

- [Phase-granular skill loading](../../docs/adr/2026-10-14-phase-granular-skill-loading.md)
## Generate the project projection procedurally

- **Asked:** Should this skill hand-sync `docs/hgate-project.json`?
- **Findings:** The sync is mechanical and costs LLM tokens; see
  [ADR-008](../../docs/adr/2026-10-14-procedural-project-projection.md).
- **Decision/Action:** Run `npm run project:sync` (and `project:check` for
  drift) instead of editing the JSON by hand.
## Phase 6 mechanical checks run by tool

- **Asked:** Should the agent hand-verify mechanical spec consistency (aggregate
  classes, event files, ACL docs, scenario tags, Ports table)?
- **Findings:** These are deterministic and cost many tokens as an LLM
  checklist. See [ADR-008](../../docs/adr/2026-10-14-deterministic-spec-verification.md).
- **Decision/Action:** Run `npm run verify:spec` (`tools/verify-spec`) and fix
  its failures; keep ambiguity, YAGNI, BC isolation, rule coverage and VO
  discipline as agent judgment. Fall back to manual checks only when the tool is
  not installed.
