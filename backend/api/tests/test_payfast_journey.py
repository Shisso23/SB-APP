"""Phase 6 Stage 4: end-to-end PayFast purchase journey.

These tests drive the whole flow through the HTTP layer - checkout, ITN, then
premium access - with PayFast's network call mocked. They are the integration
counterpart to the unit tests in `test_payfast.py` / `test_payfast_itn.py`:

    start_checkout ->  ITN (verified)  ->  entitlement  ->  /me/ reports active
                                                     ->  premium endpoints allowed

and the negative journeys that must never grant access.

No live payment request is made anywhere in this module.
"""

import hashlib
import urllib.parse
from datetime import timedelta
from decimal import Decimal
from unittest import mock
from unittest.mock import Mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    AccessEntitlement,
    AccessProduct,
    Fixture,
    PassGrant,
    PaymentEvent,
    Prediction,
    PurchaseAttempt,
    PurchaseEvent,
    User,
)


PAYFAST_SETTINGS = dict(
    PAYFAST_ENABLED=True,
    PAYFAST_MERCHANT_ID="10000100",
    PAYFAST_MERCHANT_KEY="46f0cd694581a",
    PAYFAST_PASSPHRASE="jt7NOE43FZPn",
    PAYFAST_PROCESS_URL="https://sandbox.payfast.co.za/eng/process",
    PAYFAST_VALIDATE_URL="https://sandbox.payfast.co.za/eng/query/validate",
    PREDICTXI_SITE_URL="https://example.test",
)

PAYFAST_IP = "197.97.145.150"
FOREIGN_IP = "203.0.113.7"


def itn_signature(fields, passphrase=None):
    param_string = "&".join(
        f"{key}={urllib.parse.quote_plus(str(value))}"
        for key, value in fields.items()
        if key != "signature" and value not in (None, "")
    )
    if passphrase:
        param_string += f"&passphrase={urllib.parse.quote_plus(passphrase)}"
    return hashlib.md5(param_string.encode()).hexdigest()


@override_settings(**PAYFAST_SETTINGS)
class PayFastEndToEndTests(TestCase):
    """One product, one customer, the complete purchase journey."""

    def setUp(self):
        self.now = timezone.now()
        self.user = User.objects.create_user("verified-user", email="buyer@example.test")
        self.product = AccessProduct.objects.create(
            code="pxi-30d", name="30-Day Predictions Pass",
            price_amount=Decimal("99.00"), currency="ZAR", duration_days=30,
        )
        self.fixture = Fixture.objects.create(
            provider_id=10, league_id=39, season=2026, home_team_id=1, away_team_id=2,
            home_team_name="Home", away_team_name="Away",
            kickoff=self.now + timedelta(days=1), status="NS",
            source_payload={"private": "never exposed"},
        )
        self.prediction = Prediction.objects.create(
            fixture=self.fixture, engine_version="v1", input_hash="a" * 64,
            config_hash="b" * 64, as_of=self.now,
            valid_until=self.now + timedelta(minutes=15),
            inputs={"private_inputs": True}, output={"homeWin": 0.6},
        )

        patcher = mock.patch("api.authentication.get_firebase_app", return_value=object())
        patcher.start()
        verifier = mock.patch("api.authentication.auth.verify_id_token",
                             return_value={"uid": "verified-user"})
        verifier.start()
        self.addCleanup(mock.patch.stopall)

        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION="Bearer test-token")

        # PayFast's server-to-server validation is mocked for the whole module.
        self.server_check = Mock(return_value=None)
        server_patcher = mock.patch(
            "api.payments.payfast.verify_itn_with_server", self.server_check)
        server_patcher.start()
        self.addCleanup(server_patcher.stop)

    # ---- helpers ----------------------------------------------------------

    def checkout(self, product_code="pxi-30d", key="journey-1", **extra):
        return self.client.post(
            "/api/v1/access/checkout/",
            {"product_code": product_code, **extra},
            format="json", HTTP_IDEMPOTENCY_KEY=key,
        )

    def itn(self, attempt, **changes):
        fields = {
            "m_payment_id": attempt.merchant_reference,
            "pf_payment_id": "PF-1",
            "payment_status": "COMPLETE",
            "amount_gross": str(attempt.amount_expected),
            "merchant_id": "10000100",
        }
        fields.update(changes)
        fields["signature"] = itn_signature(fields, "jt7NOE43FZPn")
        return self.client.post("/api/v1/payments/payfast/itn/", fields, REMOTE_ADDR=PAYFAST_IP)

    # ---- the happy journey ------------------------------------------------

    def test_full_purchase_unlocks_premium_content(self):
        # 1. Before paying, premium content is denied.
        self.assertEqual(self.client.get("/api/v1/predictions/").status_code, 403)
        me_before = self.client.get("/api/v1/me/")
        self.assertFalse(me_before.data["has_prediction_access"])
        self.assertIsNone(me_before.data["prediction_access_ends_at"])

        # 2. Checkout returns a signed payload priced from the server row.
        response = self.checkout()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["payfast_data"]["amount"], "99.00")
        self.assertIn("signature", response.data["payfast_data"])
        attempt = PurchaseAttempt.objects.get()

        # 3. PayFast verifies the payment.
        self.assertEqual(self.itn(attempt).status_code, 200)

        # 4. Access is now active and the window is reported.
        me_after = self.client.get("/api/v1/me/")
        self.assertTrue(me_after.data["has_prediction_access"])
        self.assertIsNotNone(me_after.data["prediction_access_ends_at"])
        self.assertEqual(
            (timezone.datetime.fromisoformat(me_after.data["prediction_access_ends_at"])
             - timezone.datetime.fromisoformat(me_after.data["prediction_access_starts_at"])
             ).days, 30)

        # 5. Premium content is now readable, and only the safe subset.
        predictions = self.client.get("/api/v1/predictions/")
        self.assertEqual(predictions.status_code, 200)
        self.assertEqual(predictions.data["response"][0]["output"], {"homeWin": 0.6})
        self.assertNotIn("inputs", predictions.data["response"][0])

        # 6. Records are consistent and separate.
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, PurchaseAttempt.Status.GRANTED)
        self.assertEqual(PassGrant.objects.count(), 1)
        self.assertEqual(AccessEntitlement.objects.count(), 1)

    def test_checkout_then_cancel_never_unlocks_premium(self):
        self.checkout(key="cancel-1")
        attempt = PurchaseAttempt.objects.get()
        self.itn(attempt, payment_status="CANCELLED")

        self.assertEqual(self.client.get("/api/v1/predictions/").status_code, 403)
        self.assertFalse(self.client.get("/api/v1/me/").data["has_prediction_access"])
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, PurchaseAttempt.Status.DECLINED)

    def test_browser_return_redirect_alone_never_unlocks_premium(self):
        # A customer can simply visit the return URL without paying. It must
        # remain a redirect and must not create any access.
        response = self.client.get("/api/v1/payments/payfast/return/")
        self.assertEqual(response.status_code, 302)
        self.assertFalse(AccessEntitlement.objects.exists())
        self.assertEqual(self.client.get("/api/v1/predictions/").status_code, 403)

    def test_duplicate_itn_across_a_journey_grants_once(self):
        self.checkout()
        attempt = PurchaseAttempt.objects.get()
        for _ in range(3):
            self.assertEqual(self.itn(attempt).status_code, 200)
        self.assertEqual(PassGrant.objects.count(), 1)
        self.assertEqual(AccessEntitlement.objects.count(), 1)

    def test_forged_itn_cannot_grant_access(self):
        self.checkout()
        attempt = PurchaseAttempt.objects.get()
        forged = {
            "m_payment_id": attempt.merchant_reference,
            "pf_payment_id": "PF-forged",
            "payment_status": "COMPLETE",
            "amount_gross": "99.00",
            "signature": "0" * 32,
        }
        self.assertEqual(
            self.client.post("/api/v1/payments/payfast/itn/", forged, REMOTE_ADDR=PAYFAST_IP).status_code,
            200)
        self.assertFalse(AccessEntitlement.objects.exists())
        self.assertEqual(self.client.get("/api/v1/predictions/").status_code, 403)

    def test_itn_from_a_foreign_ip_cannot_grant_access(self):
        self.checkout()
        attempt = PurchaseAttempt.objects.get()
        fields = {
            "m_payment_id": attempt.merchant_reference,
            "pf_payment_id": "PF-foreign",
            "payment_status": "COMPLETE",
            "amount_gross": "99.00",
        }
        fields["signature"] = itn_signature(fields, "jt7NOE43FZPn")
        self.client.post("/api/v1/payments/payfast/itn/", fields, REMOTE_ADDR=FOREIGN_IP)
        self.assertFalse(AccessEntitlement.objects.exists())

    def test_payment_event_alone_never_grants_access(self):
        # The existing invariant must still hold after the PayFast work.
        PaymentEvent.objects.create(
            user=self.user, provider="payfast", event_id="unverified-event",
            amount=Decimal("99.00"), status="completed")
        self.assertFalse(self.client.get("/api/v1/me/").data["has_prediction_access"])
        self.assertEqual(self.client.get("/api/v1/predictions/").status_code, 403)

    def test_expired_access_denies_premium_again(self):
        self.checkout()
        attempt = PurchaseAttempt.objects.get()
        self.itn(attempt)

        # Move the entitlement into the past, as time passing would.
        entitlement = AccessEntitlement.objects.get()
        entitlement.starts_at = self.now - timedelta(days=60)
        entitlement.ends_at = self.now - timedelta(days=30)
        entitlement.save()

        self.assertEqual(self.client.get("/api/v1/predictions/").status_code, 403)
        me = self.client.get("/api/v1/me/")
        self.assertFalse(me.data["has_prediction_access"])
        # The window is gone, but the purchase history is preserved for audit.
        self.assertIsNone(me.data["prediction_access_ends_at"])
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, PurchaseAttempt.Status.GRANTED)
        self.assertEqual(PurchaseEvent.objects.count(), 1)

    def test_repeat_purchase_extends_a_single_entitlement(self):
        self.checkout(key="first")
        first = PurchaseAttempt.objects.get()
        self.itn(first, pf_payment_id="PF-first")
        first_end = AccessEntitlement.objects.get().ends_at

        self.checkout(key="second")
        second = PurchaseAttempt.objects.exclude(pk=first.pk).get()
        self.itn(second, pf_payment_id="PF-second")

        self.assertEqual(AccessEntitlement.objects.count(), 1)
        self.assertEqual(PassGrant.objects.count(), 2)
        self.assertGreater(AccessEntitlement.objects.get().ends_at, first_end)

    def test_client_cannot_supply_amount_or_identity(self):
        other = User.objects.create_user("someone-else")
        response = self.checkout(
            amount="0.01", currency="USD", status="granted",
            user_id=other.pk, entitlement="active",
        )
        self.assertEqual(response.status_code, 201)
        attempt = PurchaseAttempt.objects.get()
        self.assertEqual(attempt.user, self.user)          # identity from token only
        self.assertEqual(attempt.amount_expected, Decimal("99.00"))  # server price only
        self.assertEqual(attempt.currency, "ZAR")
        self.assertEqual(attempt.status, PurchaseAttempt.Status.PENDING)

    def test_unauthorized_and_unknown_product_are_indistinguishable(self):
        unknown = self.checkout(product_code="does-not-exist", key="unknown")
        unauthenticated = APIClient().post(
            "/api/v1/access/checkout/", {"product_code": "pxi-30d"}, format="json")
        self.assertEqual(unknown.status_code, 503)
        self.assertEqual(unauthenticated.status_code, 401)

    def test_audit_trail_contains_no_sensitive_payment_data(self):
        self.checkout()
        attempt = PurchaseAttempt.objects.get()
        self.itn(attempt)
        blob = " ".join([
            str(PurchaseEvent.objects.values_list("metadata", flat=True)),
            str(PurchaseEvent.objects.values_list("status", flat=True)),
            str(attempt.pf_payment_id),
        ])
        for secret in ["jt7NOE43FZPn", "46f0cd694581a", "signature", "card", "cvv"]:
            self.assertNotIn(secret, blob)