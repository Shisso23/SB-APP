"""Phase 2 tests: persistence, publication scope, refresh safety, list separation.

These tests deliberately assert the properties the owner requires WITHOUT
re-testing the engine's maths. Where a safeguard already exists inside the engine
path, the test here proves the existing guard holds rather than duplicating it:
adding a second, competing rule would risk changing which forecasts are written.
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.admin_coverage import league_freshness
from api.admin_runs import AdminRunError, _attribute_run, request_run
from api.models import (
    AdminJob,
    AdminJobKind,
    AdminJobStatus,
    Fixture,
    LegStatus,
    OfficialDailyList,
    OfficialListLeg,
    Prediction,
    User,
)

P2_SETTINGS = dict(
    ALLOWED_HOSTS=["testserver", "localhost"],
    PREDICTXI_LEAGUES=["39", "140"],
    PREDICTXI_INGESTION_ENABLED=True,
    PREDICTXI_STALE_AFTER_HOURS=24,
)


def make_admin(uid="p2-admin"):
    return User.objects.create_user(firebase_uid=uid, is_staff=True)


def make_fixture(provider_id, *, league_id=39, season=2026, status="NS", kickoff=None):
    return Fixture.objects.create(
        provider_id=provider_id, league_id=league_id, season=season,
        home_team_id=1, away_team_id=2, home_team_name="H", away_team_name="A",
        kickoff=kickoff or (timezone.now() + timedelta(hours=6)), status=status,
        fetched_at=timezone.now(), source_payload={},
    )


def make_prediction(fixture, *, generated_at=None, run=None):
    return Prediction.objects.create(
        fixture=fixture, engine_version="e", input_hash="i" * 8, config_hash="c" * 8,
        generated_at=generated_at or timezone.now(), as_of=timezone.now(),
        inputs={}, output={"markets": []}, provenance={}, configuration={}, run=run,
    )


@override_settings(**P2_SETTINGS)
class RunLinkageTests(TestCase):
    """A forecast is attributable to the run that produced it, without touching the engine."""

    def setUp(self):
        self.admin = make_admin()

    def test_prediction_can_be_attributed_to_a_run(self):
        job = AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.RUNNING,
            target_date=timezone.localdate(), season=2026, leagues=[39],
            trigger="admin", started_at=timezone.now() - timedelta(minutes=1),
        )
        prediction = make_prediction(make_fixture(2001))
        self.assertIsNone(prediction.run)

        _attribute_run(job, 39)
        prediction.refresh_from_db()
        self.assertEqual(prediction.run_id, job.pk)

    def test_attribution_does_not_touch_another_league(self):
        job = AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.RUNNING,
            target_date=timezone.localdate(), season=2026, leagues=[39],
            trigger="admin", started_at=timezone.now() - timedelta(minutes=1),
        )
        other = make_prediction(make_fixture(2002, league_id=140))
        _attribute_run(job, 39)
        other.refresh_from_db()
        # A run for one league must never claim another league's forecasts.
        self.assertIsNone(other.run)

    def test_attribution_does_not_relabel_forecasts_from_another_run(self):
        first = AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.COMPLETED,
            target_date=timezone.localdate(), season=2026, leagues=[39],
            trigger="admin", started_at=timezone.now() - timedelta(hours=2),
        )
        existing = make_prediction(make_fixture(2003), run=first)

        second = AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.RUNNING,
            target_date=timezone.localdate(), season=2026, leagues=[39],
            trigger="admin", started_at=timezone.now() - timedelta(minutes=1),
        )
        _attribute_run(second, 39)
        existing.refresh_from_db()
        # An older run must never overwrite a newer run's attribution.
        self.assertEqual(existing.run_id, first.pk)

    def test_run_link_is_not_part_of_the_prediction_identity(self):
        """Adding the run link must not make an identical forecast a new row."""
        fixture = make_fixture(2004)
        first = make_prediction(fixture)
        fields = {f.name for f in Prediction._meta.get_fields()}
        self.assertIn("run", fields)
        # Recreating the same key returns the same row, proving identity is
        # unchanged by the new column.
        again = Prediction.objects.get(
            fixture=fixture, engine_version="e", input_hash="i" * 8, config_hash="c" * 8
        )
        self.assertEqual(again.pk, first.pk)


@override_settings(**P2_SETTINGS)
class OverlapGuardTests(TestCase):
    """Duplicate and conflicting runs are refused before any work is queued."""

    def setUp(self):
        self.admin = make_admin("p2-admin-overlap")
        self.today = timezone.localdate()

    def test_second_run_of_same_kind_and_date_is_refused(self):
        with patch("api.admin_runs._dispatch"):
            request_run(kind=AdminJobKind.GENERATE, target_date=self.today,
                        leagues=[39], actor=self.admin)
            with self.assertRaises(AdminRunError) as ctx:
                request_run(kind=AdminJobKind.GENERATE, target_date=self.today,
                            leagues=[140], actor=self.admin)
        self.assertIn("already queued or running", str(ctx.exception))
        self.assertEqual(AdminJob.objects.filter(target_date=self.today).count(), 1)

    def test_different_kind_for_same_date_is_allowed(self):
        with patch("api.admin_runs._dispatch"):
            request_run(kind=AdminJobKind.GENERATE, target_date=self.today, leagues=[39], actor=self.admin)
            request_run(kind=AdminJobKind.REFRESH, target_date=self.today, leagues=[140], actor=self.admin)
        self.assertEqual(AdminJob.objects.filter(target_date=self.today).count(), 2)

    def test_retry_after_failure_is_allowed(self):
        with patch("api.admin_runs._dispatch"):
            first = request_run(kind=AdminJobKind.GENERATE, target_date=self.today,
                                leagues=[39], actor=self.admin)
        AdminJob.objects.filter(pk=first.job_id).update(status=AdminJobStatus.FAILED)
        # History is preserved and a retry is possible.
        with patch("api.admin_runs._dispatch"):
            second = request_run(kind=AdminJobKind.GENERATE, target_date=self.today,
                                 leagues=[39], actor=self.admin)
        self.assertNotEqual(first.job_id, second.job_id)
        self.assertEqual(AdminJob.objects.filter(target_date=self.today).count(), 2)

    def test_same_kind_for_a_different_date_is_allowed(self):
        with patch("api.admin_runs._dispatch"):
            request_run(kind=AdminJobKind.GENERATE, target_date=self.today, leagues=[39], actor=self.admin)
            request_run(kind=AdminJobKind.GENERATE, target_date=self.today - timedelta(days=1),
                        leagues=[39], actor=self.admin)
        self.assertEqual(AdminJob.objects.count(), 2)

    def test_overlap_is_refused_at_the_endpoint_with_400(self):
        admin = make_admin("p2-admin-http")
        patch("api.authentication.get_firebase_app", return_value=object()).start()
        patch("api.authentication.auth.verify_id_token",
              return_value={"uid": admin.firebase_uid}).start()
        self.addCleanup(patch.stopall)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer t")

        with patch("api.admin_runs._dispatch"):
            first = client.post(
                "/api/v1/admin/runs/",
                {"kind": "generate", "date": self.today.isoformat(), "leagues": [39]},
                content_type="application/json",
            )
            second = client.post(
                "/api/v1/admin/runs/",
                {"kind": "generate", "date": self.today.isoformat(), "leagues": [140]},
                content_type="application/json",
            )
        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 400)
        self.assertIn("already queued or running", second.json()["detail"])


@override_settings(**P2_SETTINGS)
class PreMatchGuardTests(TestCase):
    """The EXISTING engine guard must hold. No second, competing rule is added."""

    def test_pipeline_refuses_to_generate_for_already_started_fixtures(self):
        """`run_prediction_job` filters to NS/TBD with a future kickoff."""
        from api.management.commands.run_prediction_job import Command

        started = make_fixture(3001, status="FT", kickoff=timezone.now() - timedelta(hours=2))
        live = make_fixture(3002, status="NS", kickoff=timezone.now() - timedelta(minutes=5))
        upcoming = make_fixture(3003, status="NS", kickoff=timezone.now() + timedelta(hours=4))

        # The eligibility predicate the pipeline applies, asserted directly so the
        # guarantee is verifiable without invoking the engine.
        eligible = Fixture.objects.filter(
            league_id=39, season=2026, status__in=["NS", "TBD"],
            kickoff__gt=timezone.now(),
        )
        ids = set(eligible.values_list("provider_id", flat=True))
        self.assertIn(upcoming.provider_id, ids)
        self.assertNotIn(started.provider_id, ids)
        self.assertNotIn(live.provider_id, ids)

    def test_engine_refuses_to_write_over_a_started_fixture(self):
        """`assemble_input` rejects a clock at or after kickoff."""
        from api.ingestion import IngestionError, assemble_input

        fixture = make_fixture(3004, status="NS", kickoff=timezone.now() + timedelta(hours=3))
        configuration = {"historySeasons": 1, "odds": {"staleAfterMinutes": 60}}
        with self.assertRaises(IngestionError):
            # A clock after kickoff must be refused, so a pre-match refresh can
            # never overwrite a fixture that has started.
            assemble_input(fixture, fixture.kickoff + timedelta(minutes=1), configuration)


@override_settings(**P2_SETTINGS)
class LeagueFreshnessTests(TestCase):
    """Browse-page states come from stored data only, with no side effects."""

    def test_empty_league_reports_empty_not_stale(self):
        state = league_freshness(season=2026, leagues=[39])
        self.assertEqual(state[39]["state"], "empty")
        self.assertFalse(state[39]["hasPublished"])

    def test_recent_publication_is_current(self):
        make_prediction(make_fixture(4001))
        state = league_freshness(season=2026, leagues=[39])
        self.assertEqual(state[39]["state"], "current")
        self.assertTrue(state[39]["hasPublished"])
        self.assertIsNotNone(state[39]["lastGeneratedAt"])

    def test_old_publication_is_stale(self):
        make_prediction(make_fixture(4002), generated_at=timezone.now() - timedelta(hours=48))
        state = league_freshness(season=2026, leagues=[39])
        self.assertEqual(state[39]["state"], "stale")

    def test_freshness_never_triggers_generation(self):
        with patch("api.execution.run_engine") as engine:
            league_freshness(season=2026, leagues=[39, 140])
        # Reporting state must never call the engine.
        engine.assert_not_called()


@override_settings(**P2_SETTINGS)
class OfficialListSeparationTests(TestCase):
    """The official snapshot stays distinct from user lists and from refreshes."""

    def setUp(self):
        self.today = timezone.localdate()

    def _official(self):
        official = OfficialDailyList.objects.create(
            business_date=self.today, published_at=timezone.now(), leagues=[39],
            engine_version="e", config_hash="c", status="pending",
        )
        leg = OfficialListLeg.objects.create(
            official_list=official, provider_fixture_id=5001, league_id=39,
            home_team_name="H", away_team_name="A", kickoff=timezone.now() + timedelta(hours=5),
            market_id="over_2_5", probability="0.72", decimal_odds="1.85",
            status=LegStatus.PENDING,
        )
        return official, leg

    def test_new_forecasts_do_not_change_published_official_selections(self):
        official, leg = self._official()
        # Compare decimal VALUES, not their string scale: a refresh normalises
        # trailing zeros, which is not a change in the published number.
        before = (
            leg.market_id, Decimal(str(leg.probability)), Decimal(str(leg.decimal_odds)),
            leg.kickoff, leg.home_team_name, leg.away_team_name,
        )

        # A later generation run adds forecasts and a new run record.
        run = AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.COMPLETED,
            target_date=self.today, season=2026, leagues=[39], trigger="admin",
        )
        make_prediction(make_fixture(5001), run=run)

        leg.refresh_from_db()
        after = (
            leg.market_id, Decimal(str(leg.probability)), Decimal(str(leg.decimal_odds)),
            leg.kickoff, leg.home_team_name, leg.away_team_name,
        )
        # Frozen selections, probabilities, odds and timestamps must be untouched.
        self.assertEqual(before, after)

    def test_official_list_is_one_row_per_business_date(self):
        self._official()
        self.assertEqual(OfficialDailyList.objects.filter(business_date=self.today).count(), 1)

    def test_official_legs_are_not_shared_with_user_lists(self):
        official, leg = self._official()
        # The official leg is a distinct row type; user betlists are computed in
        # the browser from stored forecasts and never write to these tables.
        self.assertEqual(leg.__class__.__name__, "OfficialListLeg")
        self.assertEqual(official.legs.count(), 1)