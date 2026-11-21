# Catalog BDD Scenarios

Feature: Browse products

  @scenario:CATALOG-BROWSE-001
  Scenario: List activated products
    Given an activated product
    When the customer opens the catalog
    Then the product is listed

  @scenario:CATALOG-BROWSE-002
  Scenario Outline: Show prices in tenant currency
    Given a tenant with currency <currency>
    Then prices are shown in <currency>

Feature: Channel resolution

  @scenario:CATALOG-CHANNEL-001
  Scenario: Fall back to the default channel
    Given the tenant channel is missing
    Then the default channel is used
