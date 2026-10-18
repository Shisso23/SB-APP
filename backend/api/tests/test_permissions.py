from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone
from rest_framework.test import APITestCase

from api.models import AccessEntitlement, Fixture, PaymentEvent, Prediction, User


class PermissionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("verified-user")
        self.other = User.objects.create_user("other-user")
        self.now = timezone.now()
        self.fixture = Fixture.objects.create(provider_id=10, league_id=39, season=2026, home_team_id=1, away_team_id=2,
                                              home_team_name="Home", away_team_name="Away", kickoff=self.now + timedelta(days=1), status="NS",
                                              source_payload={"private_source": "not public"})
        self.prediction = Prediction.objects.create(fixture=self.fixture, engine_version="v1", input_hash="a" * 64,
                                                    config_hash="b" * 64, as_of=self.now, valid_until=self.now + timedelta(minutes=15), inputs={"private_inputs": True}, output={"homeWin": 0.6})
        patch("api.authentication.get_firebase_app", return_value=object()).start()
        patch("api.authentication.auth.verify_id_token", return_value={"uid": "verified-user", "subscription_status": "active", "is_staff": True}).start()
        patch("api.permissions.timezone.now", return_value=self.now).start()
        self.addCleanup(patch.stopall)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer test-token")

    def entitlement(self, **changes):
        values = {"user": self.user, "starts_at": self.now - timedelta(hours=1), "ends_at": self.now + timedelta(hours=1)}
        return AccessEntitlement.objects.create(**{**values, **changes})

    def test_no_entitlement_denies_list_and_detail_despite_claims(self):
        for path in ["/api/v1/predictions/", f"/api/v1/predictions/{self.prediction.pk}/"]:
            response = self.client.get(path, {"user_id": self.other.pk, "has_access": True, "payment_status": "completed"})
            self.assertEqual(response.status_code, 403)
            self.assertNotIn("homeWin", response.content.decode())
            self.assertEqual(response["Cache-Control"], "private, no-store")

    def test_active_entitlement_allows_read_only_predictions(self):
        self.entitlement(starts_at=self.now)
        response = self.client.get("/api/v1/predictions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["response"][0]["output"], {"homeWin": 0.6})
        self.assertNotIn("inputs", response.data["response"][0])
        self.assertEqual(self.client.post("/api/v1/predictions/", {}).status_code, 405)
        self.assertEqual(self.client.patch(f"/api/v1/predictions/{self.prediction.pk}/", {"output": {}}, format="json").status_code, 405)

    def test_expired_future_revoked_and_other_user_entitlements_do_not_apply(self):
        variants = [
            {"ends_at": self.now}, {"starts_at": self.now + timedelta(minutes=1)},
            {"revoked_at": self.now}, {"user": self.other},
        ]
        for changes in variants:
            with self.subTest(changes=list(changes)):
                entitlement = self.entitlement(**changes)
                self.assertEqual(self.client.get("/api/v1/predictions/").status_code, 403)
                entitlement.revoked_at = self.now
                entitlement.save()

    def test_completed_payment_event_does_not_unlock_access(self):
        PaymentEvent.objects.create(user=self.user, provider="example", event_id="unverified", amount="20", status="completed")
        self.assertEqual(self.client.get("/api/v1/predictions/").status_code, 403)

    def test_no_customer_write_routes_for_entitlements_or_payments(self):
        for path in ["/api/v1/entitlements/", "/api/v1/payment-events/", "/api/v1/provider/odds/"]:
            self.assertEqual(self.client.post(path, {"status": "completed"}).status_code, 404)

    def test_historical_versions_remain_premium_and_are_not_current_picks(self):
        self.entitlement()
        Prediction.objects.filter(pk=self.prediction.pk).update(valid_until=self.now - timedelta(seconds=1))
        current = self.client.get("/api/v1/predictions/")
        self.assertEqual(current.data["response"], [])
        history = self.client.get("/api/v1/predictions/?history=true")
        self.assertEqual(len(history.data["response"]), 1)
        self.assertFalse(history.data["response"][0]["is_actionable"])
        self.client.credentials()
        self.assertEqual(self.client.get("/api/v1/predictions/?history=true").status_code, 401)

    def test_old_version_is_not_used_when_latest_has_expired(self):
        self.entitlement()
        Prediction.objects.create(fixture=self.fixture, engine_version="v2", input_hash="c" * 64,
                                  config_hash="b" * 64, as_of=self.now, valid_until=self.now - timedelta(seconds=1), output={})
        self.assertEqual(self.client.get("/api/v1/predictions/").data["response"], [])