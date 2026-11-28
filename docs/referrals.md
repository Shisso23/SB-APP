# PredictXI referrals and rewards

## Architecture and customer journey

PredictXI creates backend users on the first authenticated request for a verified Firebase UID. PayFast confirms purchases independently of the browser return and writes a purchase event and pass grant. Paid access and manual grants extend the existing prediction entitlement window.

- Every customer account has a persistent referral code. An anonymous visit to `/ref/<code>` stores the first valid server-signed invitation on the site's origin for up to 30 days. Registration continues through the existing Firebase email and password form. The first authenticated request carries the ticket, and Django checks the verified account creation time before it saves the relationship. Existing accounts keep their original attribution.
- The first eligible confirmed paid pass earns the referrer one 24-hour extension. The reward starts immediately for a customer without active access and follows the existing expiry for an active customer. Each qualifying friend adds another day. Paid purchases and referrals extend the same entitlement, with distinct grant records. Pass prices, paid pass durations and revenue records retain their existing meaning.
- The database enforces one referral relationship per referred UID, one reward per referral, one reward per qualifying paid grant, and distinct referrer and referred accounts. The payment event, paid grant and referral award are committed together. Locks on the affected accounts serialize simultaneous extensions.
- Customers can copy a link, share through the device's share sheet where supported, or send a prefilled WhatsApp message. Refer & Earn is available from navigation, the account, the signed-in home page, access passes and confirmed checkout. The dashboard shows current expiry, referral counts and dated rewards. It uses anonymous friend references. The checkout result uses the customer-specific purchase attempt for payment confirmation and the entitlement for effective access.
- Administrators can search by customer email or ID, filter by referral status and inspect the attached payment, paid grant and reward entitlement from Business → Referrals. This report is read-only. Staff accounts are excluded from referral earning and sharing.

## HTTP interfaces

| Endpoint | Access | Response |
| --- | --- | --- |
| `GET /api/v1/referrals/capture/<code>/` | Public | Validity, signed attribution ticket and its lifetime. An unavailable link returns 404. |
| `GET /api/v1/me/referrals/?page=1` | Signed-in owner | Own code, sharing link, effective access expiry, counts and paginated history. |
| `GET /api/v1/admin/referrals/?page=1&search=&status=` | Administrator | Lifetime totals and paginated referrals with payment and grant references. Status filters are `awaiting`, `rewarded` and `reversed`. |

## Refunds and chargebacks

PredictXI's existing PayFast integration has no automatic refund or chargeback feed. After an authorised operator verifies a reversal with the provider, the backend needs its existing trusted refund record or a purchase marked refunded. The reconciliation command processes recorded full refunds and refunds marked `chargeback` or `fraud`. Ordinary partial refunds leave the reward in place. Reconciliation records the reversal, removes only unused referral time and preserves paid time. A reversal stays in reward history and cannot be replaced by another purchase from the same referred account.

Preview the eligible records before applying reconciliation to the reviewed environment.

```sh
python manage.py reconcile_referral_rewards --dry-run
python manage.py reconcile_referral_rewards
```

## Files

| Area | Files |
| --- | --- |
| Backend schema and attribution | `api/models.py`, `api/migrations/0018_referral_rewards.py`, `api/authentication.py`, `api/referrals.py`, `predictxi/settings.py` |
| Backend payment and access integration | `api/access.py`, `api/referral_rewards.py`, `api/management/commands/reconcile_referral_rewards.py` |
| Backend API and coverage | `api/referral_views.py`, `api/urls.py`, `api/tests/test_referrals.py`, `api/tests/test_referral_rewards.py` |
| Frontend referral flow | `src/screens/referrals/`, `src/services/referrals/`, `src/services/api/client.ts`, `src/services/analytics/index.ts`, `src/navigation/root.router.tsx` |
| Frontend entry points | `src/components/navBar/index.tsx`, `src/components/auth/SignInScreen.tsx`, `src/components/auth/AccountContact.tsx`, `src/screens/home/home.screen.tsx`, `src/screens/access/AccessPassesScreen.tsx`, `src/screens/access/PayFastResultScreen.tsx` |
| Admin and UI regressions | `src/screens/admin/AdminReferrals.tsx`, `src/screens/admin/AdminScreen.tsx`, `src/screens/admin/AdminShell.tsx`, `src/screens/admin/admin-ui.tsx`, `src/App.test.js`, `src/screens/access/access.test.tsx`, `src/screens/referrals/referrals.test.tsx` |

## Validation

- The backend regression suite passed 448 tests on disposable PostgreSQL. Referral coverage includes attribution, existing accounts, every paid pass duration, failed and duplicate callbacks, simultaneous rewards and purchases, accumulation, reversals, and owner and administrator permissions. Django system and migration drift checks and the private prediction runner build passed.
- The schema upgrade was exercised from `0017` with existing Firebase users already in the database. Their identities and emails survived. Each existing row and a newly inserted legacy row obtained its own code.
- The focused frontend suite passed 28 tests. The full suite passed 398 of 399 tests. The same Prediction Desk failure for restoring the selected league on refresh was reproduced on the original branch. TypeScript, lint on affected files and the production build passed. The build reports existing CSS and lint warnings in other parts of the app.
- A local Chromium run at 320 px and 1440 px covered the first invitation, signup after refresh, the registration header, personal reward history, staff referral reporting and a mocked PayFast checkout and return. Live Firebase registration, live PayFast settlement and production state require staging acceptance. No deployment or production payment was performed.

## Rollout after approval

1. In staging, confirm that `PREDICTXI_FRONTEND_URL` points to the frontend and that the frontend host serves the React app for direct visits to `/ref/<code>` and `/referrals`. Check that the Firebase service account used by the API can read Firebase user metadata.
2. Back up the database using the existing deployment procedure. Apply `python manage.py migrate` before the new API serves requests. Migration `api.0018_referral_rewards` adds distinct codes to existing users and retains a database default for older application instances during rollout.
3. Deploy the backend and ensure the authorised frontend origins allow the API's `X-Referral-Ticket` header. Deploy the frontend once the referral endpoints are available.
4. In staging, open a referral in a signed-out session and register a test customer. Verify the awaiting status, complete a PayFast sandbox purchase, and verify one reward plus the updated expiry. Replay the callback in staging to confirm that the reward count and expiry stay the same.
5. Use the refund reconciliation command only against the intended environment after checking the dry-run output.
