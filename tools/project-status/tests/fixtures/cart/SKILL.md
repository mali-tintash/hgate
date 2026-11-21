# Cart BC

## Purpose
Owns the shopper's cart until it is submitted for ordering.

## Classification
Core Domain.

## Core Business Rules
1. A submitted cart cannot be modified.
2. A cart holds at most 50 items in total across all lines, counted by quantity rather than by distinct product.
3. Only the owner may submit a cart.

## Ubiquitous Language
| Term | Meaning | NOT: |
|---|---|---|
| Cart | The shopper's pending purchase | basket |
| [Term] | [...] | [...] |

## [Optional section]
[...]
