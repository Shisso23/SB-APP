from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from firebase_admin import auth
from firebase_admin.exceptions import FirebaseError
from google.auth.exceptions import DefaultCredentialsError
from rest_framework.test import APITestCase

from api.models import User


class AuthenticationTests(APITestCase):
    def setUp(self):
        self.app_patcher = patch("api.authentication.get_firebase_app", return_value=object())
        self.app = self.app_patcher.start()
        self.verify = patch("api.authentication.auth.verify_id_token", return_value={"uid": "verified-user"}).start()
        self.addCleanup(patch.stopall)

    def test_missing_token_fails_closed(self):
        response = self.client.get("/api/v1/me/")
        self.assertEqual(response.status_code, 401)
        self.verify.assert_not_called()
        self.assertFalse(User.objects.exists())

    def test_malformed_headers_are_rejected(self):
        for header in ["Basic token", "Bearer", "Bearer one two", "Bearer " + "x" * 8193]:
            with self.subTest(header_length=len(header)):
                self.assertEqual(self.client.get("/api/v1/me/", HTTP_AUTHORIZATION=header).status_code, 401)
        self.verify.assert_not_called()

    def test_uid_is_derived_only_from_verified_token(self):
        response = self.client.get("/api/v1/me/", {"firebase_uid": "attacker", "user_id": 999, "subscription_status": "active"}, HTTP_AUTHORIZATION="Bearer test-token")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["firebase_uid"], "verified-user")
        self.assertFalse(response.data["has_prediction_access"])
        self.verify.assert_called_once_with("test-token", app=self.app.return_value, check_revoked=True, clock_skew_seconds=0)
        user = User.objects.get()
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.is_staff)

    def test_invalid_expired_revoked_disabled_and_wrong_project_tokens_are_rejected(self):
        failures = [
            auth.InvalidIdTokenError("wrong audience or signature"),
            auth.ExpiredIdTokenError("private-expiration-details", cause=None),
            auth.RevokedIdTokenError("revoked"),
            auth.UserDisabledError("disabled"),
            FirebaseError("UNAVAILABLE", "sensitive verifier details"),
            ValueError("invalid token value"),
        ]
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                self.verify.side_effect = failure
                response = self.client.get("/api/v1/me/", HTTP_AUTHORIZATION="Bearer test-token")
                self.assertEqual(response.status_code, 401)
                self.assertNotIn(str(failure), response.content.decode())
        self.assertFalse(User.objects.exists())

    def test_missing_admin_configuration_is_not_an_auth_bypass(self):
        self.app.side_effect = ImproperlyConfigured("private path details")
        response = self.client.get("/api/v1/me/", HTTP_AUTHORIZATION="Bearer test-token")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private path", response.content.decode())
        self.verify.assert_not_called()

    def test_certificate_fetch_failure_is_sanitized(self):
        self.verify.side_effect = auth.CertificateFetchError("private certificate details", cause=None)
        response = self.client.get("/api/v1/me/", HTTP_AUTHORIZATION="Bearer test-token")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private certificate", response.content.decode())

    def test_lazy_missing_server_credentials_are_sanitized(self):
        self.verify.side_effect = DefaultCredentialsError("private credential location")
        response = self.client.get("/api/v1/me/", HTTP_AUTHORIZATION="Bearer test-token")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private credential", response.content.decode())
        self.assertFalse(User.objects.exists())

    def test_local_account_disable_is_enforced(self):
        User.objects.create_user("verified-user", is_active=False)
        self.assertEqual(self.client.get("/api/v1/me/", HTTP_AUTHORIZATION="Bearer test-token").status_code, 401)

    def test_missing_or_invalid_uid_never_creates_a_user(self):
        for claims in [{}, {"uid": ""}, {"uid": " "}, {"uid": 12}, {"uid": "x" * 129}]:
            self.verify.return_value = claims
            self.assertEqual(self.client.get("/api/v1/me/", HTTP_AUTHORIZATION="Bearer test-token").status_code, 401)
        self.assertFalse(User.objects.exists())

    def test_emulator_cannot_enable_fake_token_verification(self):
        self.app_patcher.stop()
        from api.authentication import get_firebase_app
        with self.settings(FIREBASE_PROJECT_ID="test-project"), patch.dict("os.environ", {"FIREBASE_AUTH_EMULATOR_HOST": "localhost:9099"}):
            with self.assertRaises(ImproperlyConfigured):
                get_firebase_app()