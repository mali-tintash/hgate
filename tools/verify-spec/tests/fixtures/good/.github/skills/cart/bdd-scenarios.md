# Cart BDD Scenarios

```gherkin
Feature: Submit a cart

  @scenario:CART-SUBMIT-001
  Scenario: Submit a valid cart
    Given a cart with one item
    When the shopper submits the cart
    Then the cart is submitted

  @scenario:CART-SUBMIT-002
  Scenario: Submitting twice is idempotent
    Given a submitted cart
    When the shopper submits the cart again
    Then the cart stays submitted
```
