Reference for the "Phase 4 - Test-First Execution" section of `SKILL.md`. Loaded on demand; the section heading lives in `SKILL.md`.

Implement one approved slice at a time using red-green-refactor.

#### 4a. Red

1. Write tests derived from the traceability matrix, including the applicable
   `[BDD:<scenario-id>]` marker.
2. Run the smallest targeted test command.
3. Confirm the test fails for the expected missing behavior.
4. If it passes before implementation, determine whether:
   - Existing code already implements the behavior
   - The assertion is ineffective
   - The test exercises the wrong path
5. Correct the test or reclassify the initial-build eligibility. Never count an
   unexplained pre-existing pass as a valid red phase.

Do not weaken assertions merely to obtain a passing test.

#### 4b. Green

Write the minimum complete production behavior required by the approved slice:

1. Domain types, value objects, aggregates, policies, and events
2. Application use cases and domain port interfaces
3. Persistence models, migrations, repository adapters, and transactions
4. ACL adapters for external systems
5. Presentation controllers, consumers, DTOs, and validation
6. Module wiring and dependency injection

Run the targeted tests until they pass.

"Minimum" means no speculative behavior. It does not permit omitting specified
failure paths, authorization, persistence guarantees, or integration handling.

#### 4c. Refactor

After the slice is green:

- Remove duplication
- Improve names to match ubiquitous language
- Confirm dependency direction
- Remove test-only production seams that are not part of the design
- Re-run the targeted tests

Do not refactor unrelated BCs.

#### Whole-file awareness

For every file changed:

1. Read the relevant method and its immediate callers/callees.
2. Wire every new interface into its implementation and DI registration.
3. Search for stale placeholder names and unresolved references.
4. Update related tests and mocks in the same slice.

#### No orphan code

For every new component confirm:

- A port has a real adapter or an explicitly approved test stub
- An adapter is registered and reachable
- An application use case has a public caller or consumer
- A migration is included in the project's migration runner
- A domain event is emitted from the specified transition
- An event consumer is registered if it belongs to this BC
- A DTO is used by an actual entry point
- A test targets behavior rather than merely constructing the class

Delete unused speculative components instead of leaving them for future work.
