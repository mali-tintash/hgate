# Cart BDD Scenarios

```gherkin
Feature: Submit a cart
  Shoppers hand over a cart for ordering.

  @scenario:CART-SUBMIT-001
  Scenario: Submit a valid cart
    Given a cart with one item
    When the shopper submits the cart
    Then the cart is submitted

  @scenario:CART-SUBMIT-002 @idempotency
  Scenario: Submitting twice is idempotent
    Given a submitted cart
    When the shopper submits the cart again
    Then the cart stays submitted
```

```gherkin
Feature: Cart limits

  @scenario:CART-LIMIT-001
  Scenario Outline: Item quantity limit
    Given a cart with <count> items
    When the shopper adds one item
    Then the add is <result>

    Examples:
      | count    | result   |
      | 49       | accepted |
      | 51       | rejected |
```

## Template (not yet confirmed)

```gherkin
Feature: <Business capability>

  @scenario:<BC>-<CAPABILITY>-001
  Scenario: <Successful business outcome>
    Given <confirmed business state>
```
