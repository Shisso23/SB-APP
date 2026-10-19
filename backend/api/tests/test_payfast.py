"""Phase 6 Stage 1 tests: PayFast checkout initiation.

ALL PayFast interaction is MOCKED / offline. No live payment request is made:
these tests only assert the server builds a correct, signed payload from
server-owned data and refuses to start when it is not safe to do so.
"""

import hashlib
import urllib.parse
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from api.models import AccessProduct, PurchaseAttempt, User
from api.payments.payfast import (
    CHECKOUT_FIELD_ORDER,
    PayFastConfigurationError,
    PayFastUnavailable,
    build_checkout_payload,
    generate_signature,
)


PAYFAST_SETTINGS = dict(
    PAYFAST_ENABLED=True,
    PAYFAST_MERCHANT_ID="10000100",
    PAYFAST_MERCHANT_KEY="46f0cd694581a",
    PAYFAST_PASSPHRASE="jt7NOE43FZPn",
    PAYFAST_PROCESS_URL="https://sandbox.payfast.co.za/eng/process",
    PREDICTXI_SITE_URL="https://example.test",
)


class SignatureTests(TestCase):
    """The signature must match PayFast's documented algorithm exactly."""

    def test_documented_ordering_uppercase_encoding_and_passphrase(self):
        data = {
            "merchant_id": "10000100",
            "merchant_key": "46f0cd694581a",
            "return_url": "http://www.yourdomain.co.za/return.php",
            "cancel_url": "http://www.yourdomain.co.za/cancel.php",
            "notify_url": "http://www.yourdomain.co.za/notify.php",
            "amount": "10.00",
            "item_name": "Order#123",
        }
        signature = generate_signature(data, "jt7NOE43FZPn")

        # Independently rebuild the string the documented way and re-hash it.
        expected_string = (
            "merchant_id=10000100&merchant_key=46f0cd694581a"
            "&return_url=http%3A%2F%2Fwww.yourdomain.co.za%2Freturn.php"
            "&cancel_url=http%3A%2F%2Fwww.yourdomain.co.za%2Fcancel.php"
            "&notify_url=http%3A%2F%2Fwww.yourdomain.co.za%2Fnotify.php"
            "&amount=10.00&item_name=Order%23123&passphrase=jt7NOE43FZPn"
        )
        self.assertEqual(signature, hashlib.md5(expected_string.encode()).hexdigest())
        self.assertEqual(len(signature), 32)
        self.assertEqual(signature, signature.lower())

    def test_blank_values_are_excluded_and_signature_key_ignored(self):
        with_blank = generate_signature({"merchant_id": "1", "amount": "5.00", "item_name": ""})
        without = generate_signature({"merchant_id": "1", "amount": "5.00"})
        self.assertEqual(with_blank, without)

        spoofed = generate_signature({"merchant_id": "1", "amount": "5.00", "signature": "deadbeef"})
        self.assertEqual(spoofed, without)

    def test_field_order_is_documents_order_not_alphabetical(self):
        # item_name precedes amount in the request but must be hashed in
        # documentation order (amount before item_name).
        data = {"item_name": "X", "amount": "5.00"}
        signature = generate_signature(data)
        documented = hashlib.md5(b"amount=5.00&item_name=X").hexdigest()
        alphabetical = hashlib.md5(b"amount=5.00&item_name=X").hexdigest()
        self.assertEqual(signature, documented)
        self.assertNotEqual(
            signature,
            hashlib.md5(b"item_name=X&amount=5.00").hexdigest(),
        )
        self.assertEqual(CHECKOUT_FIELD_ORDER.index("amount"),
                         CHECKOUT_FIELD_ORDER.index("item_name") - 1)

    def test_passphrase_is_optional(self):
        data = {"merchant_id": "1", "amount": "5.00"}
        self.assertNotEqual(generate_signature(data, None), generate_signature(data, "salt"))

    def test_spaces_encode_as_plus(self):
        signature = generate_signature({"item_name": "Test Product"})
        self.assertEqual(signature, hashlib.md5(b"item_name=Test+Product").hexdigest())


class CheckoutFixtureMixin:
    def make_product(self, **changes):
        values = {
            "code": "pxi-30d", "name": "30-Day Predictions Pass",
            "price_amount": Decimal("99.00"), "currency": "ZAR", "duration_days": 30,
        }
        return AccessProduct.objects.create(**{**values, **changes})


@override_settings(**PAYFAST_SETTINGS)
class BuildCheckoutPayloadTests(CheckoutFixtureMixin, TestCase):
    def setUp(self):
        self.user = User.objects.create_user("verified-uid", email="buyer@example.test")
        self.product = self.make_product()
        self.attempt = PurchaseAttempt.objects.create(
            user=self.user, product=self.product, provider=PurchaseAttempt.Provider.PAYFAST,
            idempotency_key="k1", amount_expected=self.product.price_amount,
            merchant_reference="PXI-abc123",
        )

    def test_payload_uses_server_price_and_locked_reference(self):
        fields, process_url = build_checkout_payload(attempt=self.attempt, product=self.product)
        self.assertEqual(fields["amount"], "99.00")
        self.assertEqual(fields["m_payment_id"], "PXI-abc123")
        self.assertEqual(fields["merchant_id"], "10000100")
        self.assertEqual(process_url, "https://sandbox.payfast.co.za/eng/process")

    def test_payload_signature_validates_against_itself(self):
        fields, _ = build_checkout_payload(attempt=self.attempt, product=self.product)
        signature = fields.pop("signature")
        # A forged/replayed payload must not verify.
        self.assertNotEqual(generate_signature(fields, "jt7NOE43FZPn"), "0" * 32)
        self.assertEqual(signature, generate_signature({**fields}, "jt7NOE43FZPn"))

    def test_callback_urls_are_server_owned_absolute(self):
        fields, _ = build_checkout_payload(attempt=self.attempt, product=self.product)
        self.assertEqual(fields["notify_url"], "https://example.test/api/v1/payments/payfast/itn/")
        self.assertEqual(fields["return_url"], "https://example.test/api/v1/payments/payfast/return/")
        self.assertEqual(fields["cancel_url"], "https://example.test/api/v1/payments/payfast/cancel/")

    def test_below_minimum_price_is_refused(self):
        cheap = self.make_product(code="cheap", price_amount=Decimal("1.00"))
        attempt = PurchaseAttempt.objects.create(
            user=self.user, product=cheap, provider=PurchaseAttempt.Provider.PAYFAST,
            idempotency_key="k-cheap", amount_expected=cheap.price_amount,
            merchant_reference="PXI-cheap",
        )
        with self.assertRaises(PayFastConfigurationError):
            build_checkout_payload(attempt=attempt, product=cheap)


class ConfigurationFailClosedTests(CheckoutFixtureMixin, TestCase):
    def setUp(self):
        self.user = User.objects.create_user("verified-uid")
        self.product = self.make_product()
        self.attempt = PurchaseAttempt.objects.create(
            user=self.user, product=self.product, provider=PurchaseAttempt.Provider.PAYFAST,
            idempotency_key="k1", amount_expected=self.product.price_amount,
            merchant_reference="PXI-abc123",
        )

    @override_settings(PAYFAST_ENABLED=False)
    def test_disabled_raises_unavailable(self):
        with self.assertRaises(PayFastUnavailable):
            build_checkout_payload(attempt=self.attempt, product=self.product)

    @override_settings(PAYFAST_ENABLED=True, PAYFAST_MERCHANT_ID="", PAYFAST_MERCHANT_KEY="")
    def test_missing_credentials_raise(self):
        with self.assertRaises(PayFastConfigurationError):
            build_checkout_payload(attempt=self.attempt, product=self.product)

    @override_settings(PAYFAST_ENABLED=True, PREDICTXI_SITE_URL="")
    def test_missing_site_url_raises(self):
        with self.assertRaises(PayFastConfigurationError):
            build_checkout_payload(attempt=self.attempt, product=self.product)


@override_settings(**PAYFAST_SETTINGS)
class CheckoutEndpointTests(CheckoutFixtureMixin, APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("verified-user", email="buyer@example.test")
        self.product = self.make_product()
        patch("api.authentication.get_firebase_app", return_value=object()).start()
        patch("api.authentication.auth.verify_id_token",
              return_value={"uid": "verified-user"}).start()
        self.addCleanup(patch.stopall)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION="Bearer test-token")

    def test_checkout_requires_authentication(self):
        response = APIClient().post("/api/v1/access/checkout/", {"product_code": "pxi-30d"}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_checkout_requires_idempotency_key(self):
        response = self.client.post("/api/v1/access/checkout/", {"product_code": "pxi-30d"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_checkout_returns_signed_payload_with_server_price(self):
        response = self.client.post("/api/v1/access/checkout/", {"product_code": "pxi-30d"},
                                    format="json", HTTP_IDEMPOTENCY_KEY="key-1")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["amount"], "99.00")
        self.assertEqual(response.data["currency"], "ZAR")
        self.assertEqual(response.data["payfast_data"]["amount"], "99.00")
        self.assertIn("signature", response.data["payfast_data"])
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(PurchaseAttempt.objects.get().status, PurchaseAttempt.Status.PENDING)

    def test_client_supplied_amount_is_ignored(self):
        response = self.client.post(
            "/api/v1/access/checkout/",
            {"product_code": "pxi-30d", "amount": "0.01", "currency": "USD", "status": "granted"},
            format="json", HTTP_IDEMPOTENCY_KEY="key-amount",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["payfast_data"]["amount"], "99.00")
        self.assertEqual(PurchaseAttempt.objects.get().amount_expected, Decimal("99.00"))

    def test_checkout_never_grants_access(self):
        from api.models import AccessEntitlement, PassGrant
        self.client.post("/api/v1/access/checkout/", {"product_code": "pxi-30d"},
                         format="json", HTTP_IDEMPOTENCY_KEY="key-2")
        self.assertFalse(AccessEntitlement.objects.exists())
        self.assertFalse(PassGrant.objects.exists())

    def test_replayed_idempotency_key_does_not_create_second_attempt(self):
        first = self.client.post("/api/v1/access/checkout/", {"product_code": "pxi-30d"},
                                 format="json", HTTP_IDEMPOTENCY_KEY="same-key")
        second = self.client.post("/api/v1/access/checkout/", {"product_code": "pxi-30d"},
                                  format="json", HTTP_IDEMPOTENCY_KEY="same-key")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(PurchaseAttempt.objects.count(), 1)
        self.assertEqual(first.data["attempt_id"], second.data["attempt_id"])
        self.assertEqual(first.data["payfast_data"]["m_payment_id"],
                         second.data["payfast_data"]["m_payment_id"])

    def test_unknown_or_inactive_product_is_generic_503(self):
        for code in ["nope", "pxi-30d"]:
            if code == "pxi-30d":
                self.product.is_active = False
                self.product.save()
            with self.subTest(code=code):
                response = self.client.post("/api/v1/access/checkout/", {"product_code": code},
                                            format="json", HTTP_IDEMPOTENCY_KEY=f"key-{code}")
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.data["detail"], "Checkout is currently unavailable.")

    def test_non_zar_product_is_refused_generically(self):
        self.make_product(code="usd", currency="USD")
        response = self.client.post("/api/v1/access/checkout/", {"product_code": "usd"},
                                    format="json", HTTP_IDEMPOTENCY_KEY="key-usd")
        self.assertEqual(response.status_code, 503)

    @override_settings(PAYFAST_ENABLED=False)
    def test_disabled_payfast_is_generic_503(self):
        response = self.client.post("/api/v1/access/checkout/", {"product_code": "pxi-30d"},
                                    format="json", HTTP_IDEMPOTENCY_KEY="key-off")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["detail"], "Checkout is currently unavailable.")
        self.assertFalse(PurchaseAttempt.objects.exists())

    def test_response_never_contains_the_passphrase(self):
        response = self.client.post("/api/v1/access/checkout/", {"product_code": "pxi-30d"},
                                    format="json", HTTP_IDEMPOTENCY_KEY="key-secret")
        self.assertNotIn("jt7NOE43FZPn", response.content.decode())
        self.assertNotIn("passphrase", response.data["payfast_data"])

    def test_merchant_reference_is_unique_and_server_generated(self):
        self.client.post("/api/v1/access/checkout/", {"product_code": "pxi-30d"},
                         format="json", HTTP_IDEMPOTENCY_KEY="key-a")
        attempt = PurchaseAttempt.objects.get()
        self.assertTrue(attempt.merchant_reference.startswith("PXI-"))
        self.assertEqual(len(attempt.merchant_reference), 4 + 32)