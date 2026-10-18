from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import AccessEntitlement, Fixture, LeagueCatalog, OddsSnapshot, SourceObservation, StandingsSnapshot, User
from api.jobs import digest


def make_job():
    from api.models import JobRun
    return JobRun.objects.create(kind="refresh", scope="39:2026", slot=timezone.now(), status="completed")


class ReadApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.now = timezone.now()
        cls.user = User.objects.create_user("verified-user")
        cls.fixture = Fixture.objects.create(
            provider_id=10, league_id=39, season=2026, home_team_id=1, away_team_id=2,
            home_team_name="Home", away_team_name="Away", kickoff=cls.now + timedelta(days=1), status="NS",
            source_payload={"private_source": "must not leak"},
        )
        LeagueCatalog.objects.create(provider_id=39, payload={
            "league": {"id": 39, "name": "Premier League", "type": "League", "logo": "l.png", "private": "no"},
            "country": {"name": "England", "code": "GB", "flag": "f.png"},
            "seasons": [{"year": 2026, "start": "2026-08-01", "end": "2027-05-01", "current": True}],
        })
        cls.entitlement = AccessEntitlement.objects.create(
            user=cls.user, starts_at=cls.now - timedelta(hours=1), ends_at=cls.now + timedelta(hours=1),
        )

    def setUp(self):
        self.app = patch("api.authentication.get_firebase_app", return_value=object()).start()
        self.verify = patch("api.authentication.auth.verify_id_token", return_value={"uid": "verified-user"}).start()
        self.addCleanup(patch.stopall)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION="Bearer test-token")

    def unauthenticated(self):
        client = APIClient()
        return client

    def test_all_read_endpoints_require_authentication(self):
        for path in ["/api/v1/fixtures/", "/api/v1/leagues/", "/api/v1/standings/?league=39&season=2026", "/api/v1/odds/?fixture=10", "/api/v1/predictions/"]:
            with self.subTest(path=path):
                self.assertEqual(self.unauthenticated().get(path).status_code, 401)

    def test_fixture_filters_and_provider_shape(self):
        response = self.client.get("/api/v1/fixtures/?league=39&season=2026")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], 1)
        self.assertEqual(response.data["errors"], [])
        fixture = response.data["response"][0]
        self.assertEqual(fixture["fixture"]["id"], 10)
        self.assertEqual(fixture["league"]["id"], 39)
        self.assertEqual(fixture["teams"]["home"]["name"], "Home")
        self.assertEqual(fixture["goals"], {"home": None, "away": None})
        self.assertNotIn("private_source", response.content.decode())
        self.assertEqual(self.client.get("/api/v1/fixtures/?league=39&season=2026&bogus=1").status_code, 400)
        self.assertEqual(self.client.get("/api/v1/fixtures/?league=abc").status_code, 400)
        self.assertEqual(self.client.get("/api/v1/fixtures/?date=2026-10-18").data["results"], 0)

    def test_leagues_are_allowlisted_and_shape_is_preserved(self):
        response = self.client.get("/api/v1/leagues/?current=true&type=League")
        self.assertEqual(response.status_code, 200)
        league = response.data["response"][0]
        self.assertEqual(league["league"]["id"], 39)
        self.assertEqual(league["country"]["code"], "GB")
        self.assertTrue(league["seasons"][0]["current"])
        self.assertNotIn("private", response.content.decode())
        self.assertEqual(self.client.get("/api/v1/leagues/?current=maybe").status_code, 400)

    def test_standings_return_latest_snapshot_or_empty(self):
        self.assertEqual(self.client.get("/api/v1/standings/?league=39&season=2026").data["response"], [])
        source = SourceObservation.objects.create(job=make_job(), kind="standings", scope="39:2026", observed_at=self.now,
                                                   content_hash=digest({"a": 1}), payload={})
        StandingsSnapshot.objects.create(league_id=39, season=2026, observed_at=self.now, source=source,
                                         payload={"league": {"id": 39, "name": "Premier League", "standings": [[{"rank": 1}]]}})
        response = self.client.get("/api/v1/standings/?league=39&season=2026")
        self.assertEqual(response.data["response"][0]["league"]["standings"], [[{"rank": 1}]])
        self.assertEqual(self.client.get("/api/v1/standings/?league=39").status_code, 400)

    def test_odds_require_entitlement_and_hide_raw_payload(self):
        source = SourceObservation.objects.create(job=make_job(), kind="odds", scope="10", observed_at=self.now,
                                                   content_hash=digest({"b": 1}), payload={"private_source": "no"})
        OddsSnapshot.objects.create(fixture=self.fixture, bookmaker="Pinnacle", market_id="home_win",
                                    decimal_odds=Decimal("2.5"), provider_updated_at=self.now, captured_at=self.now, source=source)
        self.entitlement.delete()
        self.verify.return_value = {"uid": "verified-user", "subscription_status": "active", "is_staff": True}
        self.assertEqual(self.client.get("/api/v1/odds/?fixture=10").status_code, 403)
        AccessEntitlement.objects.create(user=self.user, starts_at=self.now - timedelta(hours=1), ends_at=self.now + timedelta(hours=1))
        response = self.client.get("/api/v1/odds/?fixture=10")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["response"][0]["market_id"], "home_win")
        self.assertNotIn("private_source", response.content.decode())
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(self.client.get("/api/v1/odds/?fixture=10&access=true&payment_status=completed").status_code, 400)

    def test_odds_exclude_stale_and_missing_update_timestamps(self):
        self.entitlement  # active entitlement from setUpTestData
        source = SourceObservation.objects.create(job=make_job(), kind="odds", scope="10", observed_at=self.now,
                                                   content_hash=digest({"c": 1}), payload={})
        OddsSnapshot.objects.create(fixture=self.fixture, bookmaker="A", market_id="home_win", decimal_odds=Decimal("2"),
                                    provider_updated_at=None, source=source)
        OddsSnapshot.objects.create(fixture=self.fixture, bookmaker="B", market_id="draw", decimal_odds=Decimal("3"),
                                    provider_updated_at=self.now, source=source)
        response = self.client.get("/api/v1/odds/?fixture=10")
        markets = [row["market_id"] for row in response.data["response"]]
        self.assertEqual(markets, ["draw"])

    def test_odds_require_a_filter(self):
        self.entitlement  # active entitlement from setUpTestData
        self.assertEqual(self.client.get("/api/v1/odds/").status_code, 400)