# <BC Name> BDD Scenarios

## Scenario ID Convention

Every Scenario and Scenario Outline has one repository-unique tag:

```text
@scenario:<BC>-<CAPABILITY>-<three-digit-sequence>
```

Tests reference the same ID as `[BDD:<scenario-id>]`.

## Feature Template

```gherkin
Feature: <Business capability>
  <Business value and scope>

  @scenario:<BC>-<CAPABILITY>-001
  Scenario: <Successful business outcome>
    Given <confirmed business state>
    When <actor performs business action>
    Then <observable business outcome>

  @scenario:<BC>-<CAPABILITY>-002
  Scenario: <Rejected or failed business outcome>
    Given <confirmed business state>
    When <actor attempts business action>
    Then <business rule rejects or recovers from the action>
```

Add scenarios for happy paths, failures, boundaries, idempotency, concurrency,
authorization, and integrations as required by the BC specification. Do not add
placeholder scenarios for behavior that has not been confirmed.
