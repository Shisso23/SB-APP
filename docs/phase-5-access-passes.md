# Phase 5 — Access passes (1Voucher / OTT Voucher / Blu Voucher)

Status: **5A foundation implemented, all three providers disabled.** No provider
integration is implemented, because no official merchant redemption documentation
has been supplied.

## Product framing

PredictXI sells **time-limited access to football predictions and analytics**. It
does not accept bets, hold betting balances, or operate as a bookmaker. No
guarantee of wins or profit is claimed anywhere in this feature.

Customers **redeem vouchers they already own** to obtain an access pass. There is
no voucher sales flow, no wallet, and no stored credit.

## Owner decisions (chosen for now, revisable as data)

| Decision | Choice | Where to change |
|---|---|---|
| Pricing | Per-product `price_amount` | `AccessProduct` row |
| Duration | Per-product `duration_days` (30 default) | `AccessProduct` row |
| Activation timing | Immediate on verified redemption | `api/access.py::_entitlement_for` |
| Repeat purchase | Extend the active pass from its current `ends_at` | `api/access.py::_entitlement_for` |
| Amount mismatch | `>= expected` grants; overpayment recorded; underpayment → `needs_review`, no grant | `api/access.py::_apply_result` |

## Models added (`api/models.py`, migration `0004`)

| Model | Purpose |
|---|---|
| `AccessProduct` | Server-owned price/duration/scope. `price_amount >= 0`, `duration_days > 0`, unique `code`. |
| `PurchaseAttempt` | One attempt lifecycle. Unique `idempotency_key`. No PIN column. Status written only by server. |
| `PurchaseEvent` | Append-only provider events. Unique `(provider, provider_event_id)`. |
| `PassGrant` | `attempt` is **OneToOne** (grant-once guarantee). `entitlement` is a **FK**, because repeat purchases extend one entitlement. |
| `RefundRecord` | Reversal/correction audit. Unique `provider_reference`. Never grants access. |
| `EntitlementRevocation` | Reason audit for a revocation; access denial uses `AccessEntitlement.revoked_at`. |

Reused unchanged: `AccessEntitlement` (access truth) and `PaymentEvent` (provider
financial audit). Existing tests assert a `PaymentEvent` alone never grants access.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/access/products/` | Yes | Server prices only |
| POST | `/api/v1/access/purchases/` | Yes | Requires `Idempotency-Key`; PIN in body, never stored/echoed |
| GET | `/api/v1/access/purchases/<id>/` | Yes | **Owner-scoped**; another user gets 404 |

There is deliberately **no** customer route that writes entitlement or payment
status, and no provider-proxy route.

## Security properties enforced in code

- Identity only from the verified Firebase token; never from the request body.
- Price/duration only from `AccessProduct`; never from the client.
- Voucher PIN: in-memory only; never logged, persisted, or returned. Metadata
  validator rejects `voucher_pin`.
- Grant-once: `PassGrant.attempt` OneToOne + row locks + unique event key.
- **Ambiguous outcomes are never retried.** `ambiguous`/`needs_review` grant
  nothing and wait for reconciliation.
- Rate limiting and a single generic error message, so PIN guessing yields no
  information.
- Expiry and revocation enforced server-side on every premium read.

## Provider status — all disabled, all unverified

| Provider | Public evidence found | Merchant redemption docs | Enabled |
|---|---|---|---|
| 1Voucher | Consumer site: cash voucher with a PIN | **Not found** | No |
| OTT Voucher | Page content unreadable during planning | **Not found** | No |
| Blu Voucher | Marketing: "offer Blu Voucher as a way to pay" | **Not found** | No |

**Nothing about endpoints, credentials, PIN formats, signatures, callbacks, fees,
denominations, refunds or idempotency is implemented or assumed.** Each adapter
raises `ProviderNotConfigured` until real details are supplied.

To implement a provider, supply: redemption endpoint and auth model, PIN format,
request/response schema, status/idempotency mechanism (or state that none exists),
callback/signature details, fees, denominations and refund semantics.

### Required before enabling any provider

1. Official merchant redemption documentation.
2. Merchant onboarding complete (legal entity, contract, settlement account).
3. **Written provider confirmation that paid football-prediction analytics is an
   accepted merchant category.**

## Implementation phases

1. **5A** (done) — models, migration, endpoints, mocked tests.
2. **5B** — one provider, once its docs and category confirmation exist.
3. **5C/5D** — remaining providers, independently.

## Verification commands

```sh
cd backend
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py test api.tests
```

## Disable / rollback strategy

- Set `PAYMENT_PROVIDER_<NAME>_ENABLED=False` to stop new purchases immediately.
  This never deletes anything.
- **Never delete** `PurchaseAttempt`, `PurchaseEvent`, `PassGrant`, `RefundRecord`
  or `PaymentEvent`: they are the payment audit trail.
- Revoke access with `AccessEntitlement.revoked_at` plus an
  `EntitlementRevocation` reason row, rather than deleting rows.

## Known gaps / next steps

- Ambiguous-outcome recovery depends on each provider's documented status lookup.
  If a provider has none, manual reconciliation is required — this is a
  provider-clarification item.
- No reconciliation job exists yet. Add a management command only if a real need
  is demonstrated; Celery/Redis are deliberately not used.
- Provider acceptance of paid football-prediction analytics remains unconfirmed.