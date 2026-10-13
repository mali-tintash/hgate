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
