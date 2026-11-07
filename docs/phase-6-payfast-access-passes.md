# Phase 6 — PayFast paid access passes

Status: **implemented; local sandbox prepared; no real sandbox payment completed yet.**

PayFast is the first payment provider for PredictXI premium access. Ozow is not
implemented and is deliberately out of scope for this phase. No voucher system is
part of this work; the earlier voucher foundation remains present but unused.

**No real PayFast round-trip has been executed.** Every automated check in this
repository mocks the PayFast boundary, so those results evidence our *handling* of
ITNs — signature reconstruction, state transitions, idempotency — and are **not**
evidence that a live sandbox payment succeeds. See §11 for the verification ledger,
which separates mocked checks from real-round-trip evidence.

Nothing in this document has been run against a live payment service. No credential
appears here, and no credential may ever appear in source, in the frontend bundle, in
this repository, or in chat.

---

## 1. What PredictXI sells

Time-limited **access to football predictions and analytics**. PredictXI does not accept
bets, hold a betting balance, or operate as a bookmaker. No win or profit is promised
anywhere in the product or the UI.

A customer buys a **pass**: a server-defined product with a price, a currency and a
duration. While the pass is active, the premium prediction and odds endpoints return
data. When it expires, those endpoints deny access again.

Products are **data, not code**. Price and duration live in the `AccessProduct` row, so
changing them is a data change and never a frontend release.

---

## 2. How the flow works

```
browser                Django                          PayFast
  |  POST /access/checkout/  |                              |
  |------------------------->| create PurchaseAttempt        |
  |                          | (status=pending)              |
  |  signed payload + url    |                              |
  |<-------------------------|                              |
  |  POST form (signed) --------------------------------------------->|
  |                          |                              |  customer pays
  |  <-- redirect to /api/v1/payments/payfast/return/ -----------------|
  |  GET /access/result      |                              |
  |------------------------->| GET /me/ (entitlement truth)  |
  |                          |                              |
  |                          |<--- ITN (server-to-server) ------------|
  |                          | 4 checks -> grant access      |
  |  access active           |                              |
  |<-------------------------|                              |
```

The **redirect and the ITN are independent**. PayFast notifies the server directly, so
access becomes active whether or not the customer's browser makes it back.

### Sequence numbers to look for in logs

| Stage | Expected log line |
|---|---|
| Checkout created | none (HTTP 201 to the client) |
| ITN granted | `PayFast ITN granted for attempt <id>` |
| ITN rejected | `PayFast ITN rejected (<code>) from <ip>` |
| ITN not applied | `PayFast ITN not applied (<code>)` |

Rejection codes are short and non-sensitive: `invalid_signature`, `missing_signature`,
`invalid_source`, `invalid_amount`, `validate_failed`, `validate_unreachable`,
`validate_not_configured`, `unknown_reference`, `missing_reference`.

---

## 3. Security model

This implementation was written against PayFast's current official Custom Integration
documentation. It intentionally does **not** copy the reference implementation it was
compared against, which had several defects (see §9).

### Checkout initiation

- The frontend sends **only a product code**. Amount, currency, user identity, merchant
  reference and every PayFast parameter are built server-side. A client-supplied
  `amount`, `user_id` or `status` is ignored, and there is a test asserting that.
- The checkout signature is the documented MD5 over the non-blank fields **in the
  documented field order** (not alphabetical), URL-encoded uppercase with spaces as `+`,
  with the passphrase appended last.
- The raw checkout payload is a **signed, server-built** value. The browser submits it
  and never recomputes it and never sees the passphrase.
- `return_url`, `cancel_url` and `notify_url` are derived from server settings only, so
  a caller cannot redirect the ITN to a host they control.
- Initiation is **idempotent**: replaying the `Idempotency-Key` returns the same attempt
  and the same merchant reference instead of creating a second payment.

### ITN verification

PayFast documents four checks. **All four must pass** before any access is granted:

| Check | Implementation | Failure code |
|---|---|---|
| Signature | MD5 rebuilt from the posted field order, passphrase from settings, constant-time compare | `invalid_signature` / `missing_signature` |
| Source address | Source IP must fall inside PayFast's documented ranges | `invalid_source` |
| Amount | `abs(expected − amount_gross) <= 0.01`, PayFast's own tolerance | `invalid_amount` |
| Server confirmation | Payload POSTed to `/eng/query/validate`; response must be exactly `VALID` | `validate_failed` |

The amount is compared against **our stored attempt**, and the attempt is looked up by
the unique merchant reference we generated. An ITN that cannot be tied to a live attempt
is rejected.

`X-Forwarded-For` and `Referer` are never consulted; only the connecting source address
is trusted. A malformed entry in the IP allowlist cannot widen access.

### Granting

- Access is granted **only** inside verified ITN handling.
- **A return URL is never proof of payment.** The frontend asks the server for
  entitlement and refuses to report success otherwise.
- PayFast retries an ITN until it receives HTTP 200, so duplicates are expected. The
  attempt row is locked and `PassGrant.attempt` is `OneToOne`, which makes a second
  grant impossible at the database level rather than by convention.
- Records are preserved for audit. Payment history (`PurchaseAttempt`,
  `PurchaseEvent`, `PaymentEvent`) is kept separate from entitlement state
  (`AccessEntitlement`, `PassGrant`, `EntitlementRevocation`, `RefundRecord`).

### Audit hygiene

`PurchaseEvent` stores only a status and the PayFast event id. No signature, passphrase,
card field or credential is written to any record, and tests assert this. Logs contain a
short reason code and the source IP only.

---

## 4. API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/access/products/` | Firebase | Server-priced product list |
| `POST` | `/api/v1/access/checkout/` | Firebase | Start a checkout; `Idempotency-Key` required |
| `GET` | `/api/v1/access/purchases/<id>/` | Firebase, owner | Purchase status |
| `GET` | `/api/v1/me/` | Firebase | Entitlement truth, including the access window |
| `POST` | `/api/v1/payments/payfast/itn/` | none (verified) | PayFast server-to-server notification |
| `GET` | `/api/v1/payments/payfast/return/` | none | Browser success redirect (UX only) |
| `GET` | `/api/v1/payments/payfast/cancel/` | none | Browser cancel redirect (UX only) |

`/me/` returns `has_prediction_access` plus `prediction_access_starts_at` /
`prediction_access_ends_at` (null when no active entitlement), which is what lets the UI
show expiry and distinguish "expired" from "never purchased".

---

## 5. Environment configuration

All credentials are **backend-only**. The integration is **off by default**: both the
flag and the credentials must be supplied before any checkout can start. A missing
credential or an unset public URL makes checkout refuse rather than emit a broken order.

| Variable | Purpose | Sandbox | Live |
|---|---|---|---|
| `PAYFAST_ENABLED` | Master switch | `True` to test | `True` |
| `PAYFAST_MERCHANT_ID` | Merchant id | from sandbox dashboard | live dashboard |
| `PAYFAST_MERCHANT_KEY` | Merchant key | sandbox | live |
| `PAYFAST_PASSPHRASE` | Signature salt | sandbox passphrase | live passphrase |
| `PAYFAST_PROCESS_URL` | Checkout POST target | `https://sandbox.payfast.co.za/eng/process` | `https://www.payfast.co.za/eng/process` |
| `PAYFAST_VALIDATE_URL` | Server confirmation | `https://sandbox.payfast.co.za/eng/query/validate` | `https://www.payfast.co.za/eng/query/validate` |
| `PREDICTXI_SITE_URL` | Public origin for callbacks | tunnel host | production origin |
| `PAYFAST_NOTIFY_NETWORKS` | Accepted ITN source ranges | documented defaults | documented defaults |
| `PAYFAST_MIN_AMOUNT` | Reject below the ZAR minimum | `5.00` | `5.00` |

There is **no** hardcoded fallback for the merchant id, key or passphrase, and a test
asserts that none of those literals appears anywhere in backend or frontend source.

### The passphrase is a salt, not just a secret

If a passphrase is set on the PayFast account, it **must** be appended when generating
the checkout signature *and* when verifying an ITN. A mismatch between what the account
holds and what Django holds makes every signature comparison fail; the symptom is a
stream of `PayFast ITN rejected (invalid_signature)` while the payment page itself works.

---

## 6. Sandbox readiness checklist

Work through this in order. Do not skip the tunnel step: PayFast must be able to reach
`notify_url` from the internet, so a purely local server will receive the redirect but
never the ITN, and access will never activate.

1. **Database**
   ```sh
   cd backend && .venv/bin/python manage.py migrate
   ```
   Confirm `api/migrations/0005_payfast_checkout.py` is applied.

2. **Sandbox account**
   - Register at `https://sandbox.payfast.co.za`.
   - Under Settings, set a **Salt Passphrase** and note it.
   - Copy the sandbox merchant id and key.

3. **Public tunnel** (development only)
   ```sh
   ngrok http 8000     # or: expose 8000
   ```
   PayFast only connects to ports **80, 8080, 8081 and 443**, so terminate TLS at the
   tunnel and use the `https://…` host it prints. Set `PREDICTXI_SITE_URL` to that host
   with no trailing slash.

4. **Environment** — supply the variables from §5 in `backend/.env` (never committed).
   Use the sandbox `*_URL` values. Leave `PAYFAST_ENABLED=False` until step 6.

5. **At least one product.** Create an `AccessProduct` with a code, name, a ZAR price of
   at least `5.00`, `currency="ZAR"` and a positive `duration_days`. Without a row the
   products screen correctly shows an empty state and checkout returns 503.

6. **Turn it on** — set `PAYFAST_ENABLED=True` and restart the backend. Confirm
   `GET /api/v1/access/products/` returns the product.

7. **Run the journey**
   - Frontend: `npm start`, sign in, open **Premium**, choose the pass.
   - The redirect screen should briefly show "Connecting to PayFast…" then hand over.
   - Pay on the sandbox page using the sandbox wallet.

8. **Confirm the ITN arrived.** In the sandbox dashboard, open the **ITN** viewer. In the
   backend log expect `PayFast ITN granted for attempt <id>`.

9. **Confirm the customer view.** The result screen shows "Confirming your payment…"
   then "Payment confirmed", and **Premium** shows the expiry date.

10. **Confirm access is real, not cosmetic.** `GET /api/v1/predictions/` must return 200
    with data; before payment it returns 403.

### Negative checks that must all pass

| Check | Expected |
|---|---|
| Visit `/access/result?status=success` without paying | "We could not confirm your payment" |
| Visit `/api/v1/payments/payfast/return/` directly | redirect only; `/predictions/` still 403 |
| Pay, then let the pass expire | `/predictions/` 403 again; history preserved |
| Stop the tunnel, then pay | payment succeeds at PayFast but access stays inactive |
| Cancel on the PayFast page | "Checkout cancelled"; no access |

For the tunnel case, no money is lost: the payment is recorded at PayFast and can be
reconciled manually once the ITN is replayable (PayFast retries, then stops).

---

## 7. Verification commands

```sh
cd backend
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py test api.tests         # full suite
.venv/bin/python manage.py test api.tests.test_payfast          # signature + checkout
.venv/bin/python manage.py test api.tests.test_payfast_itn      # ITN verification
.venv/bin/python manage.py test api.tests.test_payfast_journey  # end-to-end
.venv/bin/python manage.py test api.tests.test_payfast_settings # config hygiene

cd ..
npx tsc --noEmit
CI=true npx react-scripts test --watchAll=false
```

All PayFast interaction in tests is mocked. No test makes a live payment request, and
none requires a credential.

---

## 8. Rollback

| Situation | Action |
|---|---|
| Stop new purchases immediately | `PAYFAST_ENABLED=False` and restart. Nothing is deleted. |
| Revert shipping the feature | Revert the code change; migration `0005` is additive and reversible. |
| Revoke one customer's access | Set `AccessEntitlement.revoked_at` and add an `EntitlementRevocation` reason row. Never delete rows. |

**Never delete** `PurchaseAttempt`, `PurchaseEvent`, `PaymentEvent`, `PassGrant`,
`RefundRecord` or `EntitlementRevocation`. They are the payment audit trail and the
evidence needed for reconciliation and refunds.

---

## 9. Defects identified in the reference implementation (not copied)

Compared against an existing in-house PayFast integration. The following were found and
deliberately **not** reproduced:

1. The checkout signature was computed and then **discarded** (`signature = ''`), so the
   checkout form was posted unsigned.
2. The ITN signature was rebuilt from a plain mapping rather than the posted field order.
3. The source-IP allowlist check was **commented out**, and the allowlist held the wrong
   ranges (`3.163.x.237` rather than PayFast's documented networks).
4. No `/eng/query/validate` server confirmation was performed, so a well-signed but
   fabricated callback would have been trusted.
5. Credentials were present as **hardcoded fallbacks in settings**.
6. The signature parameter string was written to stdout by a `print()`.
7. `ALLOWED_HOSTS` was `['*']`.

Each is addressed in §3.

---

## 10. Open items requiring sign-off

1. **Product catalogue.** No `AccessProduct` row exists yet. Codes, names, prices and
   durations are a business decision; until they are supplied the products screen shows
   an empty state by design.
2. **Merchant category confirmation.** Written confirmation that paid
   football-prediction analytics is an accepted merchant category is required before
   going live. The reference number for this confirmation should be recorded here once
   supplied.
3. **Refunds and revocation.** This phase records refunds for audit only. Automatic
   revocation on refund is **not** implemented; revocation is a manual/admin action
   setting `AccessEntitlement.revoked_at`.
4. **Frontend lint.** Resolved. `react-scripts build` previously failed on two ESLint
   *errors* in untouched files; the remaining 157 findings were warnings and never
   blocked the build. Both errors are fixed (`ThunkDispatch` replacing the bare
   `Function` type in `reducers/fixtures/fixtures.actions.ts`; an inline `require`
   hoisted to a static import in `services/api/index.test.ts`). A plain build now
   succeeds without `DISABLE_ESLINT_PLUGIN`.
5. **Reconciliation tooling.** There is no automated reconciliation job for an ITN that
   never arrived. If the sandbox negative check in §6 shows this matters in practice, add
   a management command then; do not add scheduled infrastructure speculatively.

---

## 11. Verification ledger (local sandbox preparation)

Recorded 2026-11-07. This section distinguishes **what was actually run** from **what
was only inspected**, because a passing test suite does not prove a payment works.

### 11.1 Checks actually executed, and their results

| Check | Command | Result |
|---|---|---|
| Backend suite | `manage.py test api.tests` | **188 passed** |
| Migrations pending? | `makemigrations --check --dry-run` | no changes |
| Migrations applied? | `showmigrations api` | `0001`–`0005` all applied |
| Frontend suite | `react-scripts test --watchAll=false` | **261 passed / 35 suites** |
| Type check | `tsc --noEmit` | exit 0 |
| Backend listening | `lsof -iTCP:8000 -sTCP:LISTEN` | listening |
| `GET /api/v1/access/products/` | unauthenticated | `401` (route mounted, auth enforced) |
| `POST /api/v1/payments/payfast/itn/` | synthetic body | `200` (handler reached, no grant) |
| `GET /api/v1/payments/payfast/return/` | no session | `302` (redirect only) |

**All of the above is mocked or config-level evidence.** In particular, the ITN `200`
above was produced by a synthetic request that could not pass verification, so it is
**not** evidence that PayFast can deliver an ITN.

### 11.2 Properties verified by reading the implementation

Established by code inspection, not by a live round-trip:

- Price and currency come only from the `AccessProduct` row; the client sends a product
  code and nothing else.
- `return_url` and `cancel_url` handlers grant nothing; entitlement is reachable only
  through the verified-ITN path.
- All four documented PayFast checks are implemented (signature with constant-time
  comparison, source-IP allowlist, amount match within 0.01, server-side
  `/eng/query/validate` requiring exactly `VALID`).
- Exactly-once granting under concurrent retries rests on a row lock, a one-to-one
  grant record, and a short-circuit for an already-granted attempt.
- A repeat purchase extends an active pass from its existing end date.

### 11.3 Local sandbox state

- Endpoints are **sandbox** (`sandbox.payfast.co.za`). No production endpoint is
  configured.
- `backend/.env` and its `.env.bak.*` backup are both git-ignored and untracked.
- One sandbox product exists, created idempotently (creating it twice leaves exactly one
  row):

  | Field | Value |
  |---|---|
  | `code` | `predictxi_test_7_days` |
  | `name` | PredictXI 7-Day Test Pass |
  | `price_amount` | `5.00` |
  | `currency` | `ZAR` |
  | `duration_days` | `7` |
  | `scope` | `predictions` |

  This is **sandbox test data**. It does not establish production pricing and must not be
  treated as an approved commercial price.

### 11.4 Outstanding blockers

1. **No working public tunnel.** No `ngrok`/`cloudflared` process and nothing listening
   on a forwarded port. PayFast cannot deliver an ITN without one.
2. **`PREDICTXI_SITE_URL` is set to an offline host.** It currently answers with
   `ERR_NGROK_3200` (“endpoint offline”). This is the most misleading possible state:
   the readiness gate passes while callbacks are unreachable. It must be replaced with the
   live tunnel host before any payment is attempted.
3. **Ownership of the configured sandbox credentials is unconfirmed.** The values
   currently in `backend/.env` were not created for PredictXI. Transactions under them
   would be attributed to another merchant account, so a “success” would not validate
   PredictXI's own setup. PredictXI's own sandbox credentials must replace them.
4. **Merchant category approval (open item #2 above) remains unwritten.**
5. **No real sandbox payment has been attempted**, for the reasons above.

### 11.5 Local sandbox test steps

1. Ensure `backend/.env` holds PredictXI's own sandbox merchant id, key and passphrase,
   the sandbox `*_URL` values, and `PAYFAST_ENABLED=True`.
2. Start the backend: `manage.py runserver 0.0.0.0:8000`.
3. Expose it: `ngrok http 8000`. Confirmed the tunnel forwards to the correct port
   **before** trusting it.
4. Set `PREDICTXI_SITE_URL` to the `https://` host ngrok prints (no trailing slash) and
   restart the backend.
5. Sign in, open **Premium**, select the 7-day test pass, continue to PayFast, and pay
   with the sandbox wallet.
6. Confirm the ITN reached `notify_url`, passed all four checks, and granted access
   **exactly once** to the purchasing user for the correct product and amount.
7. Re-send the same ITN and confirm no second grant is created.
8. Buy again and confirm the pass extends from its existing end date.

### 11.6 Real-payment outcome

**Not yet recorded.** To be added only after a real sandbox payment has been completed
and its callback observed. Until then, no part of this document claims a successful
payment.