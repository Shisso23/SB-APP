"""Phase 6 Stage 2 tests: PayFast ITN validation, state transitions, granting.

Every PayFast interaction is MOCKED. `verify_itn_with_server` is patched so no
network call is ever made; the four documented checks are asserted
individually so a failure in any one of them is proven to prevent a grant.
"""

import hashlib
import urllib.parse
from decimal import Decimal
from unittest import mock
from unittest.mock import Mock

from django.test import TestCase, override_settings

from api.models import (
    AccessEntitlement,
    AccessProduct,
    PassGrant,
    PurchaseAttempt,
    PurchaseEvent,
    User,
)
from api.payments.payfast import (
    PayFastITNError,
    amounts_match,
    ip_is_allowed,
    verify_itn_signature,
)


PAYFAST_SETTINGS = dict(
    PAYFAST_ENABLED=True,
    PAYFAST_MERCHANT_ID="10000100",
    PAYFAST_MERCHANT_KEY="46f0cd694581a",
    PAYFAST_PASSPHRASE="jt7NOE43FZPn",
    PAYFAST_VALIDATE_URL="https://sandbox.payfast.co.za/eng/query/validate",
    PREDICTXI_SITE_URL="https://example.test",
)

# A documented PayFast source address (197.97.145.144/28).
PAYFAST_IP = "197.97.145.150"
FOREIGN_IP = "203.0.113.7"

ITN_URL = "/api/v1/payments/payfast/itn/"


def itn_signature(fields, passphrase=None):
    """Rebuild the ITN signature the way PayFast documents it."""
    param_string = "&".join(
        f"{key}={urllib.parse.quote_plus(str(value))}"
        for key, value in fields.items()
        if key != "signature" and value not in (None, "")
    )
    if passphrase:
        param_string += f"&passphrase={urllib.parse.quote_plus(passphrase)}"
    return hashlib.md5(param_string.encode()).hexdigest()


@override_settings(**PAYFAST_SETTINGS)
class PayFastITNEndpointTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("verified-uid", email="buyer@example.test")
        self.product = AccessProduct.objects.create(
            code="pxi-30d", name="30-Day Predictions Pass",
            price_amount=Decimal("99.00"), currency="ZAR", duration_days=30,
        )
        self.attempt = PurchaseAttempt.objects.create(
            user=self.user, product=self.product, provider=PurchaseAttempt.Provider.PAYFAST,
            status=PurchaseAttempt.Status.PENDING, idempotency_key="k1",
            amount_expected=Decimal("99.00"), merchant_reference="PXI-abc123",
        )
        from rest_framework.test import APIClient
        self.client = APIClient()
        # Patch PayFast's own server-confirmation round trip for every test.
        self.server_check = Mock(return_value=None)
        patcher = mock.patch("api.payments.payfast.verify_itn_with_server", self.server_check)
        patcher.start()
        self.addCleanup(patcher.stop)

    def payload(self, **changes):
        fields = {
            "m_payment_id": "PXI-abc123",
            "pf_payment_id": "1234567",
            "payment_status": "COMPLETE",
            "amount_gross": "99.00",
            "amount_fee": "-3.50",
            "amount_net": "95.50",
            "merchant_id": "10000100",
        }
        fields.update(changes)
        fields["signature"] = itn_signature(fields, "jt7NOE43FZPn")
        return fields

    def post(self, data, remote_addr=PAYFAST_IP):
        # PayFast posts form-encoded, so exercise that exact content type.
        return self.client.post(ITN_URL, data, REMOTE_ADDR=remote_addr)

    # ---- happy path -------------------------------------------------------

    def test_valid_itn_grants_access_once(self):
        response = self.post(self.payload())
        self.assertEqual(response.status_code, 200)
        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.status, PurchaseAttempt.Status.GRANTED)
        self.assertEqual(self.attempt.pf_payment_id, "1234567")
        self.assertEqual(self.attempt.amount_confirmed, Decimal("99.00"))
        self.assertIsNotNone(self.attempt.paid_at)

        grant = PassGrant.objects.get()
        entitlement = grant.entitlement
        # 30-day pass from the verification moment.
        self.assertEqual((entitlement.ends_at - entitlement.starts_at).days, 30)
        self.assertTrue(AccessEntitlement.objects.filter(user=self.user).exists())

    def test_duplicate_itn_does_not_double_grant(self):
        payload = self.payload()
        self.assertEqual(self.post(payload).status_code, 200)
        self.assertEqual(self.post(payload).status_code, 200)
        self.assertEqual(PassGrant.objects.count(), 1)
        self.assertEqual(AccessEntitlement.objects.count(), 1)
        # The second delivery is still recorded for audit, exactly once.
        self.assertEqual(PurchaseEvent.objects.count(), 1)

    def test_retry_after_grant_never_extends_twice(self):
        self.post(self.payload())
        self.attempt.refresh_from_db()
        ends_at = self.attempt.grant.ends_at
        self.post(self.payload())
        self.assertEqual(PassGrant.objects.get().ends_at, ends_at)

    def test_out_of_order_duplicate_event_is_tolerated(self):
        self.post(self.payload(pf_payment_id="first"))
        # A different pf_payment_id for an already-granted attempt is recorded
        # but must not create a second grant.
        response = self.post(self.payload(pf_payment_id="second"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(PassGrant.objects.count(), 1)
        self.assertEqual(PurchaseEvent.objects.count(), 2)

    # ---- each documented check, failing on its own ------------------------

    def test_invalid_signature_grants_nothing(self):
        payload = self.payload()
        payload["signature"] = "0" * 32
        self.assertEqual(self.post(payload).status_code, 200)
        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.status, PurchaseAttempt.Status.PENDING)
        self.assertFalse(PassGrant.objects.exists())

    def test_missing_signature_grants_nothing(self):
        payload = self.payload()
        payload.pop("signature")
        self.post(payload)
        self.assertFalse(PassGrant.objects.exists())

    def test_foreign_ip_grants_nothing(self):
        self.assertEqual(self.post(self.payload(), remote_addr=FOREIGN_IP).status_code, 200)
        self.assertFalse(PassGrant.objects.exists())
        # The server round trip is never reached for a rejected source.
        self.server_check.assert_not_called()

    def test_wrong_amount_grants_nothing(self):
        payload = self.payload(amount_gross="0.01")
        self.post(payload)
        self.assertFalse(PassGrant.objects.exists())
        self.server_check.assert_not_called()

    def test_overpayment_within_one_cent_is_accepted(self):
        self.assertTrue(amounts_match("99.00", "99.01"))
        self.assertTrue(amounts_match("99.00", "98.99"))
        self.assertFalse(amounts_match("99.00", "99.02"))
        self.post(self.payload(amount_gross="99.01"))
        self.assertTrue(PassGrant.objects.exists())

    def test_server_validation_failure_grants_nothing(self):
        self.server_check.side_effect = PayFastITNError("validate_failed")
        self.post(self.payload())
        self.assertFalse(PassGrant.objects.exists())

    # ---- merchant reference / attempt matching ---------------------------

    def test_unknown_merchant_reference_grants_nothing(self):
        self.post(self.payload(m_payment_id="PXI-does-not-exist"))
        self.assertFalse(PassGrant.objects.exists())
        self.server_check.assert_not_called()

    def test_missing_merchant_reference_grants_nothing(self):
        self.post(self.payload(m_payment_id=""))
        self.assertFalse(PassGrant.objects.exists())

    # ---- non-complete statuses -------------------------------------------

    def test_cancelled_payment_never_grants(self):
        response = self.post(self.payload(payment_status="CANCELLED"))
        self.assertEqual(response.status_code, 200)
        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.status, PurchaseAttempt.Status.DECLINED)
        self.assertIsNotNone(self.attempt.failed_at)
        self.assertFalse(PassGrant.objects.exists())

    def test_unexpected_status_needs_no_grant(self):
        self.post(self.payload(payment_status="PENDING"))
        self.assertFalse(PassGrant.objects.exists())

    # ---- malformed input -------------------------------------------------

    def test_empty_body_is_rejected(self):
        self.assertEqual(self.client.post(ITN_URL, {}).status_code, 400)

    # ---- repeat purchase extends -----------------------------------------

    def test_second_verified_payment_extends_existing_pass(self):
        self.post(self.payload())
        ends_at = PassGrant.objects.get().ends_at

        second = PurchaseAttempt.objects.create(
            user=self.user, product=self.product, provider=PurchaseAttempt.Provider.PAYFAST,
            status=PurchaseAttempt.Status.PENDING, idempotency_key="k2",
            amount_expected=Decimal("99.00"), merchant_reference="PXI-second",
        )
        self.post(self.payload(m_payment_id="PXI-second", pf_payment_id="second"))

        self.assertEqual(AccessEntitlement.objects.count(), 1)
        self.assertEqual(PassGrant.objects.count(), 2)
        self.assertGreater(AccessEntitlement.objects.get().ends_at, ends_at)
        second.refresh_from_db()
        self.assertEqual(second.status, PurchaseAttempt.Status.GRANTED)

    # ---- audit integrity --------------------------------------------------

    def test_audit_never_stores_the_signature(self):
        self.post(self.payload())
        event = PurchaseEvent.objects.get()
        blob = str(event.metadata)
        self.assertNotIn("signature", blob)
        self.assertNotIn("jt7NOE43FZPn", blob)


@override_settings(**PAYFAST_SETTINGS)
class PayFastRedirectTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        self.client = APIClient()

    def test_return_redirects_to_frontend_without_granting(self):
        response = self.client.get("/api/v1/payments/payfast/return/")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "https://example.test/access/result?status=success")
        self.assertFalse(PassGrant.objects.exists())

    def test_cancel_redirects_to_frontend(self):
        response = self.client.get("/api/v1/payments/payfast/cancel/")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "https://example.test/access/result?status=cancelled")

    @override_settings(PREDICTXI_SITE_URL="")
    def test_redirect_without_site_url_fails_closed(self):
        self.assertEqual(self.client.get("/api/v1/payments/payfast/return/").status_code, 503)


class ITNPrimitiveTests(TestCase):
    """Unit-level assertions on the verification primitives themselves."""

    def test_ip_allowlist_matches_documented_ranges(self):
        for address in ["197.97.145.144", "197.97.145.159", "41.74.179.200",
                        "102.216.36.5", "102.216.36.130", "144.126.193.139"]:
            with self.subTest(address=address):
                self.assertTrue(ip_is_allowed(address))
        for address in ["197.97.145.160", "41.74.179.224", "102.216.36.16",
                        "10.0.0.1", "", "not-an-ip"]:
            with self.subTest(address=address):
                self.assertFalse(ip_is_allowed(address))

    def test_malformed_allowlist_entry_does_not_widen_access(self):
        self.assertFalse(ip_is_allowed("203.0.113.7", networks=["not-a-cidr"]))

    def test_signature_comparison_requires_exact_match(self):
        fields = {"m_payment_id": "PXI-1", "amount_gross": "99.00", "pf_payment_id": "1"}
        good = itn_signature(fields, "salt")
        verify_itn_signature({**fields, "signature": good}, "salt")
        with self.assertRaises(PayFastITNError):
            verify_itn_signature({**fields, "signature": good}, "wrong-passphrase")
        with self.assertRaises(PayFastITNError):
            verify_itn_signature({**fields, "signature": "0" * 32}, "salt")

    def test_signature_is_required(self):
        with self.assertRaises(PayFastITNError):
            verify_itn_signature({"m_payment_id": "PXI-1"}, "salt")