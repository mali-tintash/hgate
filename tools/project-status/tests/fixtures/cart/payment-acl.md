# Payment Gateway ACL

## Purpose
Translates cart payment requests to the gateway.

## Port Interface

```typescript
export interface PaymentPort {
  authorize(cartId: string): Promise<void>;
}
```
