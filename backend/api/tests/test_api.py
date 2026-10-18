from unittest.mock import patch

from rest_framework.test import APITestCase

from api.models import Fixture


class ApiTests(APITestCase):
    def test_only_liveness_is_public(self):
        self.assertEqual(self.client.get("/api/v1/health/").json(), {"status": "ok"})
        for path in ["/api/v1/me/", "/api/v1/fixtures/", "/api/v1/predictions/", "/api/v1/predictions/1/"]:
            self.assertEqual(self.client.get(path).status_code, 401)

    def test_fixture_reads_never_call_provider_or_expose_raw_payload(self):
        from django.utils import timezone
        Fixture.objects.create(provider_id=1, league_id=39, season=2026, home_team_id=1, away_team_id=2,
                               home_team_name="Home", away_team_name="Away", kickoff=timezone.now(), status="NS", source_payload={"private": "not serialized"})
        with patch("api.authentication.get_firebase_app", return_value=object()), patch("api.authentication.auth.verify_id_token", return_value={"uid": "verified-user"}):
            response = self.client.get("/api/v1/fixtures/", HTTP_AUTHORIZATION="Bearer test-token")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["results"], 1)
            self.assertEqual(len(response.data["response"]), 1)
            self.assertNotIn("source_payload", response.data["response"][0])
            self.assertEqual(self.client.post("/api/v1/fixtures/", {}, HTTP_AUTHORIZATION="Bearer test-token").status_code, 405)