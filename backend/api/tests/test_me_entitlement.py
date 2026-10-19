"""Phase 6 Stage 3 backend tests: entitlement window on GET /me/.

The frontend needs to show expiry and to tell "expired" apart from "never
purchased". `/me/` is extended additively for that; these tests pin the
contract and prove the added fields never leak another user's data.
"""

from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import AccessEntitlement, EntitlementRevocation, User


class MeEntitlementWindowTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.user = User.objects.create_user("verified-user")
        self.other = User.objects.create_user("other-user")
        patch("api.authentication.get_firebase_app", return_value=object()).start()
        patch("api.authentication.auth.verify_id_token", return_value={"uid": "verified-user"}).start()
        self.addCleanup(patch.stopall)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION="Bearer test-token")

    def entitlement(self, **changes):
        values = {
            "user": self.user,
            "starts_at": self.now - timedelta(hours=1),
            "ends_at": self.now + timedelta(days=30),
        }
        return AccessEntitlement.objects.create(**{**values, **changes})

    def test_me_requires_authentication(self):
        self.assertEqual(APIClient().get("/api/v1/me/").status_code, 401)

    def test_no_entitlement_reports_false_and_null_window(self):
        response = self.client.get("/api/v1/me/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["has_prediction_access"])
        self.assertIsNone(response.data["prediction_access_starts_at"])
        self.assertIsNone(response.data["prediction_access_ends_at"])
        self.assertEqual(response["Cache-Control"], "private, no-store")

    def test_active_entitlement_reports_window(self):
        entitlement = self.entitlement()
        response = self.client.get("/api/v1/me/")
        self.assertTrue(response.data["has_prediction_access"])
        self.assertEqual(
            response.data["prediction_access_starts_at"], entitlement.starts_at.isoformat())
        self.assertEqual(
            response.data["prediction_access_ends_at"], entitlement.ends_at.isoformat())

    def test_expired_entitlement_reports_false_with_null_window(self):
        # Expired means no *current* access, so the window is null. The
        # frontend distinguishes this from "never purchased" by the fact that
        # the purchase history/status endpoint still holds the past attempt.
        self.entitlement(starts_at=self.now - timedelta(days=60), ends_at=self.now - timedelta(days=30))
        response = self.client.get("/api/v1/me/")
        self.assertFalse(response.data["has_prediction_access"])
        self.assertIsNone(response.data["prediction_access_ends_at"])

    def test_revoked_entitlement_reports_false(self):
        entitlement = self.entitlement()
        entitlement.revoked_at = self.now
        entitlement.save()
        EntitlementRevocation.objects.create(entitlement=entitlement, reason_code="refund")
        response = self.client.get("/api/v1/me/")
        self.assertFalse(response.data["has_prediction_access"])
        self.assertIsNone(response.data["prediction_access_ends_at"])

    def test_future_entitlement_is_not_active(self):
        self.entitlement(starts_at=self.now + timedelta(hours=1), ends_at=self.now + timedelta(days=30))
        response = self.client.get("/api/v1/me/")
        self.assertFalse(response.data["has_prediction_access"])
        self.assertIsNone(response.data["prediction_access_ends_at"])

    def test_another_users_entitlement_is_not_reported(self):
        AccessEntitlement.objects.create(
            user=self.other, starts_at=self.now - timedelta(hours=1),
            ends_at=self.now + timedelta(days=30))
        response = self.client.get("/api/v1/me/")
        self.assertFalse(response.data["has_prediction_access"])
        self.assertIsNone(response.data["prediction_access_ends_at"])

    def test_overlapping_entitlements_report_the_latest_end(self):
        self.entitlement(ends_at=self.now + timedelta(days=5))
        later = self.entitlement(starts_at=self.now, ends_at=self.now + timedelta(days=60))
        response = self.client.get("/api/v1/me/")
        self.assertEqual(
            response.data["prediction_access_ends_at"], later.ends_at.isoformat())