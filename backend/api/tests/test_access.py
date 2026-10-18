"""Phase 5A access-pass tests.

All provider interactions are MOCKED. No live provider or payment request is
ever made; the default adapters are disabled and raise ProviderNotConfigured.
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from api import access as access_service
from api.models import (
    AccessEntitlement,
    AccessProduct,
    EntitlementRevocation,
    PassGrant,
    PurchaseAttempt,
    PurchaseEvent,
    RefundRecord,
    User,
)
from api.payments.base import ProviderNotConfigured, RedemptionResult
from api.permissions import has_prediction_access


class AccessPassFixtureMixin:
    def make_product(self, **changes):
        values = {
            "code": "monthly", "name": "Monthly pass", "price_amount": Decimal("50"),
            "currency": "ZAR", "duration_days": 30,
        }
        return AccessProduct.objects.create(**{**values, **changes})


class ProductAndModelTests(AccessPassFixtureMixin, TestCase):
    def setUp(self):
        self.user = User.objects.create_user("verified-uid")
        self.product = self.make_product()

    def test_products_reject_invalid_price_and_duration(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            AccessProduct.objects.create(code="bad-price", name="x", price_amount=Decimal("-1"),
                                         duration_days=30)
        with self.assertRaises(IntegrityError), transaction.atomic():
            AccessProduct.objects.create(code="bad-duration", name="x", price_amount=Decimal("10"),
                                         duration_days=0)

    def test_attempt_rejects_negative_expected_amount(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                           idempotency_key="k1", amount_expected=Decimal("-1"))

    def test_idempotency_key_is_unique(self):
        PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                       idempotency_key="dup", amount_expected=Decimal("50"))
        with self.assertRaises(IntegrityError), transaction.atomic():
            PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                           idempotency_key="dup", amount_expected=Decimal("50"))

    def test_purchase_event_is_unique_per_provider_event(self):
        attempt = PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                                 idempotency_key="k2", amount_expected=Decimal("50"))
        values = dict(attempt=attempt, provider="1voucher", provider_event_id="evt-1", status="confirmed")
        PurchaseEvent.objects.create(**values)
        with self.assertRaises(IntegrityError), transaction.atomic():
            PurchaseEvent.objects.create(**values)

    def test_purchase_event_metadata_rejects_voucher_pin(self):
        attempt = PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                                 idempotency_key="k3", amount_expected=Decimal("50"))
        event = PurchaseEvent(attempt=attempt, provider="1voucher", provider_event_id="evt-2",
                              status="confirmed", metadata={"voucher_pin": "secret"})
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            event.full_clean()

    def test_pass_grant_is_once_per_attempt(self):
        attempt = PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                                 idempotency_key="k4", amount_expected=Decimal("50"))
        now = timezone.now()
        entitlement = AccessEntitlement.objects.create(user=self.user, starts_at=now, ends_at=now + timedelta(days=30))
        PassGrant.objects.create(attempt=attempt, entitlement=entitlement, starts_at=now, ends_at=now + timedelta(days=30))
        other = AccessEntitlement.objects.create(user=self.user, starts_at=now, ends_at=now + timedelta(days=30))
        with self.assertRaises(IntegrityError), transaction.atomic():
            PassGrant.objects.create(attempt=attempt, entitlement=other, starts_at=now, ends_at=now + timedelta(days=30))

    def test_pass_grant_window_must_be_positive(self):
        attempt = PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                                 idempotency_key="k5", amount_expected=Decimal("50"))
        now = timezone.now()
        entitlement = AccessEntitlement.objects.create(user=self.user, starts_at=now, ends_at=now + timedelta(days=30))
        with self.assertRaises(IntegrityError), transaction.atomic():
            PassGrant.objects.create(attempt=attempt, entitlement=entitlement, starts_at=now, ends_at=now)

    def test_refund_reference_is_unique(self):
        attempt = PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                                 idempotency_key="k6", amount_expected=Decimal("50"))
        RefundRecord.objects.create(attempt=attempt, amount=Decimal("50"), reason_code="reversal",
                                    provider_reference="ref-1")
        with self.assertRaises(IntegrityError), transaction.atomic():
            RefundRecord.objects.create(attempt=attempt, amount=Decimal("50"), reason_code="reversal",
                                        provider_reference="ref-1")

    def test_purchase_event_alone_never_grants_access(self):
        attempt = PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                                 idempotency_key="k7", amount_expected=Decimal("50"))
        PurchaseEvent.objects.create(attempt=attempt, provider="1voucher", provider_event_id="evt-9", status="confirmed")
        self.assertFalse(AccessEntitlement.objects.exists())
        self.assertFalse(has_prediction_access(self.user))


class OrchestrationTests(AccessPassFixtureMixin, TestCase):
    """Direct orchestrator tests with an enabled, mocked provider."""

    def setUp(self):
        self.user = User.objects.create_user("verified-uid")
        self.product = self.make_product()
        self.now = timezone.now()

    def _enabled_provider(self, result):
        provider = type("P", (), {"name": "1voucher", "enabled": True, "redeem": lambda self, req: result})
        return patch.object(access_service, "get_provider", return_value=provider())

    def _start(self, result, pin="12345678", key="key-1"):
        with self._enabled_provider(result):
            return access_service.start_purchase(
                user=self.user, product_code=self.product.code, provider_name="1voucher",
                voucher_pin=pin, idempotency_key=key,
            )

    def test_confirmed_purchase_grants_once_and_records_grant(self):
        result = RedemptionResult(outcome="confirmed", provider_reference="pref-1",
                                  provider_event_id="evt-1", amount_confirmed=Decimal("50"))
        attempt, entitlement = self._start(result)
        self.assertEqual(attempt.status, PurchaseAttempt.Status.GRANTED)
        self.assertIsNotNone(entitlement)
        self.assertTrue(has_prediction_access(self.user))
        self.assertEqual(PassGrant.objects.count(), 1)
        self.assertTrue(AccessEntitlement.objects.exists())

    def test_repeat_purchase_extends_without_double_granting(self):
        first = RedemptionResult(outcome="confirmed", provider_reference="p1", provider_event_id="e1",
                                 amount_confirmed=Decimal("50"))
        _attempt, entitlement = self._start(first, key="k-a")
        original_end = entitlement.ends_at
        second = RedemptionResult(outcome="confirmed", provider_reference="p2", provider_event_id="e2",
                                  amount_confirmed=Decimal("50"))
        _attempt2, entitlement2 = self._start(second, key="k-b")
        self.assertEqual(AccessEntitlement.objects.count(), 1)
        self.assertGreater(entitlement2.ends_at, original_end)
        self.assertEqual(PassGrant.objects.count(), 2)

    def test_declined_purchase_grants_nothing(self):
        attempt, entitlement = self._start(RedemptionResult(outcome="declined", status_code="000"))
        self.assertEqual(attempt.status, PurchaseAttempt.Status.DECLINED)
        self.assertIsNone(entitlement)
        self.assertFalse(has_prediction_access(self.user))

    def test_ambiguous_outcome_needs_review_and_grants_nothing(self):
        attempt, entitlement = self._start(RedemptionResult(outcome="ambiguous", status_code="timeout"))
        self.assertEqual(attempt.status, PurchaseAttempt.Status.NEEDS_REVIEW)
        self.assertIsNone(entitlement)
        self.assertFalse(has_prediction_access(self.user))

    def test_underpayment_needs_review_and_grants_nothing(self):
        attempt, entitlement = self._start(RedemptionResult(outcome="confirmed", provider_reference="p",
                                                            provider_event_id="e", amount_confirmed=Decimal("10")))
        self.assertEqual(attempt.status, PurchaseAttempt.Status.NEEDS_REVIEW)
        self.assertEqual(attempt.failure_code, "amount_mismatch")
        self.assertIsNone(entitlement)

    def test_overpayment_is_accepted_and_recorded(self):
        attempt, entitlement = self._start(RedemptionResult(outcome="confirmed", provider_reference="p",
                                                            provider_event_id="e", amount_confirmed=Decimal("75")))
        self.assertEqual(attempt.status, PurchaseAttempt.Status.GRANTED)
        self.assertEqual(attempt.amount_confirmed, Decimal("75"))
        self.assertIsNotNone(entitlement)

    def test_replayed_idempotency_key_does_not_redeem_again(self):
        result = RedemptionResult(outcome="confirmed", provider_reference="p", provider_event_id="e",
                                  amount_confirmed=Decimal("50"))
        calls = {"n": 0}

        def counting_redeem(self, req):
            calls["n"] += 1
            return result

        provider = type("P", (), {"name": "1voucher", "enabled": True, "redeem": counting_redeem})
        with patch.object(access_service, "get_provider", return_value=provider()):
            access_service.start_purchase(user=self.user, product_code=self.product.code,
                                          provider_name="1voucher", voucher_pin="1", idempotency_key="same")
            access_service.start_purchase(user=self.user, product_code=self.product.code,
                                          provider_name="1voucher", voucher_pin="1", idempotency_key="same")
        self.assertEqual(calls["n"], 1)
        self.assertEqual(PassGrant.objects.count(), 1)

    def test_disabled_provider_raises_not_configured(self):
        with self.assertRaises(ProviderNotConfigured):
            access_service.start_purchase(user=self.user, product_code=self.product.code,
                                          provider_name="1voucher", voucher_pin="1", idempotency_key="k")

    def test_unknown_provider_and_product_are_rejected(self):
        from api.payments.base import ProviderError
        with self.assertRaises(ProviderError):
            access_service.start_purchase(user=self.user, product_code=self.product.code,
                                          provider_name="nope", voucher_pin="1", idempotency_key="k")
        with self.assertRaises(ProviderError):
            access_service.start_purchase(user=self.user, product_code="missing",
                                          provider_name="1voucher", voucher_pin="1", idempotency_key="k")

    def test_result_for_owner_is_scoped(self):
        attempt = PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                                 idempotency_key="k", amount_expected=Decimal("50"))
        other = User.objects.create_user("other-uid")
        self.assertIsNotNone(access_service.result_for_owner(attempt, self.user))
        self.assertIsNone(access_service.result_for_owner(attempt, other))


class AccessApiTests(AccessPassFixtureMixin, APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("verified-user")
        self.other = User.objects.create_user("other-user")
        self.product = self.make_product()
        self.now = timezone.now()
        patch("api.authentication.get_firebase_app", return_value=object()).start()
        patch("api.authentication.auth.verify_id_token",
              return_value={"uid": "verified-user"}).start()
        self.addCleanup(patch.stopall)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION="Bearer test-token")

    def test_products_endpoint_requires_authentication(self):
        self.assertEqual(APIClient().get("/api/v1/access/products/").status_code, 401)

    def test_products_endpoint_lists_server_prices_only(self):
        response = self.client.get("/api/v1/access/products/")
        self.assertEqual(response.status_code, 200)
        product = response.data["products"][0]
        self.assertEqual(product["code"], "monthly")
        self.assertEqual(str(product["price_amount"]), "50.00")
        self.assertNotIn("duration_days" if False else "is_active", product)

    def test_purchase_requires_idempotency_key(self):
        response = self.client.post("/api/v1/access/purchases/",
                                    {"product_code": "monthly", "provider": "1voucher", "voucher_pin": "12345678"},
                                    format="json")
        self.assertEqual(response.status_code, 400)

    def test_purchase_with_disabled_provider_returns_generic_error(self):
        response = self.client.post("/api/v1/access/purchases/",
                                    {"product_code": "monthly", "provider": "1voucher", "voucher_pin": "12345678"},
                                    format="json", HTTP_IDEMPOTENCY_KEY="key-1")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["detail"], "The voucher could not be redeemed.")
        # The PIN must never be echoed back.
        self.assertNotIn("12345678", response.content.decode())

    def test_status_is_owner_scoped(self):
        attempt = PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                                 idempotency_key="k", amount_expected=Decimal("50"))
        self.assertEqual(self.client.get(f"/api/v1/access/purchases/{attempt.pk}/").status_code, 200)
        other_client = APIClient()
        patch("api.authentication.auth.verify_id_token", return_value={"uid": "other-user"}).start()
        other_client.credentials(HTTP_AUTHORIZATION="Bearer other-token")
        self.assertEqual(other_client.get(f"/api/v1/access/purchases/{attempt.pk}/").status_code, 404)

    def test_status_never_contains_a_pin_field(self):
        attempt = PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                                 idempotency_key="k", amount_expected=Decimal("50"))
        body = self.client.get(f"/api/v1/access/purchases/{attempt.pk}/").content.decode()
        for marker in ["voucher_pin", "pin", "Voucher PIN"]:
            self.assertNotIn(marker, body)

    def test_customers_cannot_write_status(self):
        attempt = PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                                 idempotency_key="k", amount_expected=Decimal("50"))
        response = self.client.patch(f"/api/v1/access/purchases/{attempt.pk}/",
                                     {"status": "granted", "amount_confirmed": "999"}, format="json")
        self.assertEqual(response.status_code, 405)
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, PurchaseAttempt.Status.CREATED)

    def test_no_customer_routes_for_entitlements_or_grants(self):
        for path in ["/api/v1/entitlements/", "/api/v1/pass-grants/", "/api/v1/purchase-events/",
                     "/api/v1/refunds/", "/api/v1/revocations/"]:
            with self.subTest(path=path):
                self.assertEqual(self.client.post(path, {"status": "granted"}).status_code, 404)

    def test_rate_limit_returns_generic_error(self):
        for _ in range(5):
            self.client.post("/api/v1/access/purchases/",
                             {"product_code": "monthly", "provider": "1voucher", "voucher_pin": "12345678"},
                             format="json", HTTP_IDEMPOTENCY_KEY="rl")
        response = self.client.post("/api/v1/access/purchases/",
                                    {"product_code": "monthly", "provider": "1voucher", "voucher_pin": "12345678"},
                                    format="json", HTTP_IDEMPOTENCY_KEY="rl")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["detail"], "The voucher could not be redeemed.")

    def test_expiry_and_revocation_are_enforced_server_side(self):
        attempt = PurchaseAttempt.objects.create(user=self.user, product=self.product, provider="1voucher",
                                                 idempotency_key="k", amount_expected=Decimal("50"))
        grant_now = self.now
        entitlement = AccessEntitlement.objects.create(user=self.user, starts_at=grant_now,
                                                       ends_at=grant_now + timedelta(days=30))
        PassGrant.objects.create(attempt=attempt, entitlement=entitlement, starts_at=grant_now,
                                 ends_at=grant_now + timedelta(days=30))
        self.assertTrue(has_prediction_access(self.user))
        # Expired: keep ends_at > starts_at (the DB constraint) but in the past.
        entitlement.starts_at = grant_now - timedelta(days=60)
        entitlement.ends_at = grant_now - timedelta(seconds=1)
        entitlement.save(update_fields=["starts_at", "ends_at"])
        self.assertFalse(has_prediction_access(self.user))
        # Recovered then revoked
        entitlement.starts_at = grant_now
        entitlement.ends_at = grant_now + timedelta(days=30)
        entitlement.save(update_fields=["starts_at", "ends_at"])
        self.assertTrue(has_prediction_access(self.user))
        entitlement.revoked_at = grant_now
        entitlement.save(update_fields=["revoked_at"])
        self.assertFalse(has_prediction_access(self.user))
        EntitlementRevocation.objects.create(entitlement=entitlement, reason_code="chargeback")
        self.assertEqual(entitlement.revocations.count(), 1)