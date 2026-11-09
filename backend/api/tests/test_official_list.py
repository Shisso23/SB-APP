"""Phase 7 tests: official daily list publication, immutability and reconciliation.

All provider interaction is MOCKED. No live request is made: publication reads
already-stored `Prediction` rows and reconciliation reads already-stored
`Fixture` rows, so these tests exercise the real decision logic offline.
"""

from datetime import datetime, timedelta, time as dtime
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import TestCase, override_settings
from django.utils import timezone

from api.business_time import (
    business_date,
    business_day_bounds,
    publication_target,
    recent_business_dates,
)
from api.models import (
    DailyPreview,
    Fixture,
    LegStatus,
    OfficialDailyList,
    OfficialListCorrection,
    OfficialListLeg,
    OfficialListStatus,
    Prediction,
)
from api.official_list import PublicationError, publish_daily_list
from api.official_reconcile import reconcile_lists
from api.official_returns import (
    compute_list_return,
    quantize_money,
    summary_metrics,
)

JHB = ZoneInfo("Africa/Johannesburg")

SETTINGS = dict(
    PREDICTXI_BUSINESS_TIMEZONE="Africa/Johannesburg",
    PREDICTXI_OFFICIAL_LIST_SIZE=5,
    PREDICTXI_POSTPONEMENT_HOURS=48,
    PREDICTXI_INGESTION_ENABLED=True,
    PREDICTXI_LEAGUES="39",
)


def make_fixture(provider_id, kickoff, *, status="NS", league_id=39, home=1, away=0):
    return Fixture.objects.create(
        provider_id=provider_id, league_id=league_id, season=2026,
        home_team_id=provider_id * 10, away_team_id=provider_id * 10 + 1,
        home_team_name=f"Home {provider_id}", away_team_name=f"Away {provider_id}",
        kickoff=kickoff, status=status,
        home_goals=home if status == "FT" else None,
        away_goals=away if status == "FT" else None,
        fetched_at=timezone.now(), source_payload={},
    )


def make_prediction(fixture, probability=0.7):
    return Prediction.objects.create(
        fixture=fixture, engine_version="test-1", input_hash="x" * 8, config_hash="y" * 8,
        generated_at=fixture.kickoff - timedelta(hours=6), as_of=fixture.kickoff - timedelta(hours=6),
        inputs={}, configuration={}, provenance={},
        output={
            "fixture": {"league": {"name": "Premier League"}},
            "markets": [{"marketId": "over_2_5", "label": "Over 2.5", "modelProbability": probability}],
            "dataQuality": {"homeSampleSize": 10, "awaySampleSize": 10},
        },
    )


class _FakeContext:
    """Minimal stand-in for the claimed job context used by the real worker."""

    def guard(self):
        return None

    def checkpoint(self, **changes):
        return None


class BusinessDateTests(TestCase):
    """Africa/Johannesburg boundaries must not leak into the next UTC day."""

    @override_settings(PREDICTXI_BUSINESS_TIMEZONE="Africa/Johannesburg")
    def test_late_evening_johannesburg_is_still_the_same_business_date(self):
        # 2026-03-10 23:30 Johannesburg == 21:30 UTC the same day.
        moment = datetime(2026, 3, 10, 21, 30, tzinfo=ZoneInfo("UTC"))
        self.assertEqual(business_date(moment).isoformat(), "2026-03-10")

    @override_settings(PREDICTXI_BUSINESS_TIMEZONE="Africa/Johannesburg")
    def test_early_morning_utc_belongs_to_the_johannesburg_day(self):
        # 00:30 UTC on the 11th is 02:30 Johannesburg on the 11th.
        moment = datetime(2026, 3, 11, 0, 30, tzinfo=ZoneInfo("UTC"))
        self.assertEqual(business_date(moment).isoformat(), "2026-03-11")

    @override_settings(PREDICTXI_BUSINESS_TIMEZONE="Africa/Johannesburg")
    def test_late_utc_evening_rolls_into_the_next_johannesburg_day(self):
        # 22:30 UTC on the 10th is 00:30 Johannesburg on the 11th.
        moment = datetime(2026, 3, 10, 22, 30, tzinfo=ZoneInfo("UTC"))
        self.assertEqual(business_date(moment).isoformat(), "2026-03-11")

    @override_settings(PREDICTXI_BUSINESS_TIMEZONE="Africa/Johannesburg")
    def test_day_bounds_are_contiguous_and_exclusive_at_the_end(self):
        start, end = business_day_bounds(datetime(2026, 3, 10).date())
        self.assertEqual(start.astimezone(JHB).hour, 0)
        self.assertEqual(end.astimezone(JHB).hour, 0)
        self.assertEqual(end - start, timedelta(hours=24))

    @override_settings(PREDICTXI_BUSINESS_TIMEZONE="Africa/Johannesburg")
    def test_recent_dates_are_newest_first_and_include_today(self):
        now = datetime(2026, 3, 10, 12, 0, tzinfo=ZoneInfo("UTC"))
        dates = recent_business_dates(5, now)
        self.assertEqual(len(dates), 5)
        self.assertEqual(dates[0].isoformat(), "2026-03-10")
        self.assertEqual(dates[1].isoformat(), "2026-03-09")
        self.assertGreater(dates[0], dates[-1])


class PublicationTests(TestCase):
    """Publication writes an immutable snapshot, or nothing at all."""

    def setUp(self):
        # A fixed early-UTC instant (05:00 UTC == 07:00 Johannesburg) so all
        # kickoffs land inside the SAME Johannesburg business day.
        self.now = datetime(2026, 3, 10, 5, 0, tzinfo=ZoneInfo("UTC"))
        self.day = business_date(self.now)

    @override_settings(**SETTINGS)
    @patch("api.official_list._run_selection")
    @patch("api.official_list.claim_job")
    def test_publishes_exactly_five_legs_with_frozen_snapshot(self, claim, selection):
        claim.return_value.__enter__.return_value = _FakeContext()
        fixtures = [
            make_fixture(1000 + i, self.now + timedelta(hours=6 + i * 2))
            for i in range(5)
        ]
        for fixture in fixtures:
            make_prediction(fixture)
        selection.return_value = [
            {
                "providerFixtureId": f.provider_id, "marketId": "over_2_5",
                "marketLabel": "Over 2.5", "marketLine": "", "probability": 0.7,
                "explanation": "Strong goals signal.", "level": "strong",
                "priceStatus": "checked",
            }
            for f in fixtures
        ]

        outcome = publish_daily_list(now=self.now, day=self.day)
        self.assertTrue(outcome.published, outcome.reason)

        official = OfficialDailyList.objects.get(business_date=self.day)
        self.assertEqual(official.legs.count(), 5)
        # Exactly one selection per DISTINCT fixture.
        ids = list(official.legs.values_list("provider_fixture_id", flat=True))
        self.assertEqual(len(ids), len(set(ids)))
        leg = official.legs.first()
        self.assertEqual(leg.market_id, "over_2_5")
        self.assertEqual(leg.probability, Decimal("0.70000"))
        # The leg records the ENGINE build that produced the selection, not the
        # version stamped on the (synthetic) stored prediction.
        self.assertTrue(leg.engine_version)

    @override_settings(**SETTINGS)
    @patch("api.official_list._run_selection")
    @patch("api.official_list.claim_job")
    def test_republishing_the_same_date_does_not_duplicate(self, claim, selection):
        claim.return_value.__enter__.return_value = _FakeContext()
        for i in range(5):
            make_prediction(make_fixture(2000 + i, self.now + timedelta(hours=6 + i)))
        selection.return_value = [
            {"providerFixtureId": 2000 + i, "marketId": "over_2_5", "marketLabel": "Over 2.5",
             "marketLine": "", "probability": 0.7, "explanation": "", "level": "strong",
             "priceStatus": "checked"}
            for i in range(5)
        ]
        first = publish_daily_list(now=self.now, day=self.day)
        second = publish_daily_list(now=self.now, day=self.day)

        self.assertTrue(first.published)
        self.assertFalse(second.published)
        self.assertIn("Already published", second.reason)
        self.assertEqual(OfficialDailyList.objects.filter(business_date=self.day).count(), 1)

    @override_settings(**SETTINGS)
    @patch("api.official_list._run_selection")
    @patch("api.official_list.claim_job")
    def test_fewer_than_five_suitable_fixtures_publishes_nothing(self, claim, selection):
        claim.return_value.__enter__.return_value = _FakeContext()
        for i in range(4):
            make_prediction(make_fixture(3000 + i, self.now + timedelta(hours=6 + i)))
        selection.return_value = [
            {"providerFixtureId": 3000 + i, "marketId": "over_2_5", "marketLabel": "Over 2.5",
             "marketLine": "", "probability": 0.7, "explanation": "", "level": "strong",
             "priceStatus": "checked"}
            for i in range(4)
        ]

        outcome = publish_daily_list(now=self.now, day=self.day)
        self.assertFalse(outcome.published)
        # A short list must never be presented as a five-match list.
        self.assertEqual(OfficialDailyList.objects.filter(business_date=self.day).count(), 0)

    @override_settings(**SETTINGS)
    @patch("api.official_list._run_selection")
    @patch("api.official_list.claim_job")
    def test_duplicate_fixture_in_selection_is_deduplicated(self, claim, selection):
        claim.return_value.__enter__.return_value = _FakeContext()
        fixtures = [make_fixture(4000 + i, self.now + timedelta(hours=6 + i)) for i in range(5)]
        for f in fixtures:
            make_prediction(f)
        rows = [
            {"providerFixtureId": f.provider_id, "marketId": "over_2_5", "marketLabel": "",
             "marketLine": "", "probability": 0.7, "explanation": "", "level": "strong",
             "priceStatus": "checked"}
            for f in fixtures
        ]
        # Selection repeats one fixture, so only 4 distinct remain -> no publish.
        selection.return_value = rows[:4] + [rows[0]]

        outcome = publish_daily_list(now=self.now, day=self.day)
        self.assertFalse(outcome.published)
        self.assertEqual(OfficialDailyList.objects.filter(business_date=self.day).count(), 0)

    @override_settings(**{**SETTINGS, "PREDICTXI_LEAGUES": ""})
    @patch("api.official_list.claim_job")
    def test_no_configured_leagues_refuses_publication(self, claim):
        claim.return_value.__enter__.return_value = _FakeContext()
        with self.assertRaises(PublicationError):
            publish_daily_list(now=self.now, day=self.day)

    @override_settings(**SETTINGS)
    @patch("api.official_list._run_selection")
    @patch("api.official_list.claim_job")
    def test_publication_is_never_rewritten_by_a_later_run(self, claim, selection):
        claim.return_value.__enter__.return_value = _FakeContext()
        fixtures = [make_fixture(5000 + i, self.now + timedelta(hours=6 + i)) for i in range(5)]
        for f in fixtures:
            make_prediction(f)
        selection.return_value = [
            {"providerFixtureId": f.provider_id, "marketId": "over_2_5", "marketLabel": "Over 2.5",
             "marketLine": "", "probability": 0.7, "explanation": "orig", "level": "strong",
             "priceStatus": "checked"}
            for f in fixtures
        ]
        publish_daily_list(now=self.now, day=self.day)
        original = OfficialListLeg.objects.get(provider_fixture_id=5000)
        original_prob = original.probability
        original_market = original.market_id

        # A later run with a different selection must not touch the published row.
        selection.return_value = [
            {"providerFixtureId": f.provider_id, "marketId": "home_win", "marketLabel": "Home win",
             "marketLine": "", "probability": 0.3, "explanation": "changed", "level": "suggested",
             "priceStatus": "checked"}
            for f in fixtures
        ]
        publish_daily_list(now=self.now, day=self.day)

        original.refresh_from_db()
        self.assertEqual(original.probability, original_prob)
        self.assertEqual(original.market_id, original_market)

    @override_settings(**SETTINGS)
    @patch("api.official_list._run_selection")
    @patch("api.official_list.claim_job")
    def test_daily_preview_is_cached_once_and_matches_a_leg(self, claim, selection):
        claim.return_value.__enter__.return_value = _FakeContext()
        fixtures = [make_fixture(6000 + i, self.now + timedelta(hours=6 + i)) for i in range(5)]
        for f in fixtures:
            make_prediction(f)
        selection.return_value = [
            {"providerFixtureId": f.provider_id, "marketId": "over_2_5", "marketLabel": "Over 2.5",
             "marketLine": "", "probability": 0.7, "explanation": "e", "level": "strong",
             "priceStatus": "checked"}
            for f in fixtures
        ]
        publish_daily_list(now=self.now, day=self.day)

        preview = DailyPreview.objects.get(business_date=self.day)
        official = OfficialDailyList.objects.get(business_date=self.day)
        self.assertIn(preview.leg_id, list(official.legs.values_list("id", flat=True)))


class SettlementTests(TestCase):
    """Settlement rules, boundaries and unresolved handling."""

    def setUp(self):
        self.now = timezone.now()
        self.day = business_date(self.now)

    def _published(self):
        official = OfficialDailyList.objects.create(
            business_date=self.day, published_at=self.now, leagues=[39],
            engine_version="test-1", config_hash="z" * 8, status=OfficialListStatus.PENDING,
        )
        return official

    def _leg(self, official, provider_id, market_id, kickoff=None, odds="2.00"):
        return OfficialListLeg.objects.create(
            official_list=official, provider_fixture_id=provider_id,
            league_id=39, home_team_name="H", away_team_name="A",
            kickoff=kickoff or (self.now - timedelta(hours=3)),
            market_id=market_id, probability=Decimal("0.5"),
            decimal_odds=Decimal(odds) if odds else None,
        )

    def test_finished_fixture_settles_won_and_lost(self):
        official = self._published()
        win = self._leg(official, 7001, "over_2_5")
        lose = self._leg(official, 7002, "under_1_5")
        make_fixture(7001, self.now - timedelta(hours=4), status="FT", home=2, away=1)
        make_fixture(7002, self.now - timedelta(hours=4), status="FT", home=2, away=1)
        win.fixture = Fixture.objects.get(provider_id=7001); win.save()
        lose.fixture = Fixture.objects.get(provider_id=7002); lose.save()

        reconcile_lists(now=self.now, dates=[self.day])
        win.refresh_from_db(); lose.refresh_from_db()
        self.assertEqual(win.status, LegStatus.WON)      # 3 goals -> over 2.5
        self.assertEqual(lose.status, LegStatus.LOST)    # 3 goals -> not under 1.5

    def test_boundary_over_2_5_needs_exactly_three_goals(self):
        official = self._published()
        leg = self._leg(official, 7101, "over_2_5")
        make_fixture(7101, self.now - timedelta(hours=4), status="FT", home=1, away=1)
        leg.fixture = Fixture.objects.get(provider_id=7101); leg.save()
        reconcile_lists(now=self.now, dates=[self.day])
        leg.refresh_from_db()
        # Exactly 2 goals must NOT satisfy over 2.5.
        self.assertEqual(leg.status, LegStatus.LOST)

    def test_boundary_over_1_5_settles_at_exactly_two_goals(self):
        """Over 1.5 is inclusive at 2 goals: the boundary must settle, not push."""
        official = self._published()
        leg = self._leg(official, 7201, "over_1_5")
        make_fixture(7201, self.now - timedelta(hours=4), status="FT", home=1, away=1)
        leg.fixture = Fixture.objects.get(provider_id=7201); leg.save()
        reconcile_lists(now=self.now, dates=[self.day])
        leg.refresh_from_db()
        self.assertEqual(leg.status, LegStatus.WON)

    def test_boundary_over_1_5_loses_at_exactly_one_goal(self):
        official = self._published()
        leg = self._leg(official, 7202, "over_1_5")
        make_fixture(7202, self.now - timedelta(hours=4), status="FT", home=1, away=0)
        leg.fixture = Fixture.objects.get(provider_id=7202); leg.save()
        reconcile_lists(now=self.now, dates=[self.day])
        leg.refresh_from_db()
        self.assertEqual(leg.status, LegStatus.LOST)

    def test_draw_no_bet_on_a_draw_is_void_not_guessed(self):
        """A push market must be voided, never forced to won/lost."""
        official = self._published()
        leg = self._leg(official, 7203, "home_dnb")
        make_fixture(7203, self.now - timedelta(hours=4), status="FT", home=1, away=1)
        leg.fixture = Fixture.objects.get(provider_id=7203); leg.save()
        reconcile_lists(now=self.now, dates=[self.day])
        leg.refresh_from_db()
        self.assertEqual(leg.status, LegStatus.VOID)

    def test_unsupported_derived_market_stays_unresolved_never_guessed(self):
        """A market the engine cannot settle must never be guessed at."""
        official = self._published()
        leg = self._leg(official, 7204, "total_2_5")
        make_fixture(7204, self.now - timedelta(hours=4), status="FT", home=1, away=1)
        leg.fixture = Fixture.objects.get(provider_id=7204); leg.save()
        reconcile_lists(now=self.now, dates=[self.day])
        leg.refresh_from_db()
        # Unresolved, with an explanation, rather than a fabricated result.
        self.assertEqual(leg.status, LegStatus.UNRESOLVED)
        self.assertIn("No settlement rule", leg.resolution_note)

    def test_btts_boundary_needs_both_teams_to_score(self):
        official = self._published()
        leg = self._leg(official, 7301, "btts_yes")
        make_fixture(7301, self.now - timedelta(hours=4), status="FT", home=3, away=0)
        leg.fixture = Fixture.objects.get(provider_id=7301); leg.save()
        reconcile_lists(now=self.now, dates=[self.day])
        leg.refresh_from_db()
        self.assertEqual(leg.status, LegStatus.LOST)

    def test_double_chance_home_or_draw_wins_on_draw(self):
        official = self._published()
        leg = self._leg(official, 7401, "home_or_draw")
        make_fixture(7401, self.now - timedelta(hours=4), status="FT", home=2, away=2)
        leg.fixture = Fixture.objects.get(provider_id=7401); leg.save()
        reconcile_lists(now=self.now, dates=[self.day])
        leg.refresh_from_db()
        self.assertEqual(leg.status, LegStatus.WON)

    def test_unplayed_fixture_stays_unresolved_within_the_window(self):
        official = self._published()
        leg = self._leg(official, 7501, "home_win", kickoff=self.now - timedelta(hours=2))
        make_fixture(7501, self.now - timedelta(hours=2), status="PST")
        leg.fixture = Fixture.objects.get(provider_id=7501); leg.save()

        reconcile_lists(now=self.now, dates=[self.day])
        leg.refresh_from_db()
        # Inside 48h: unresolved, never guessed.
        self.assertEqual(leg.status, LegStatus.UNRESOLVED)

    def test_unplayed_fixture_voids_after_the_window(self):
        official = self._published()
        leg = self._leg(official, 7601, "home_win", kickoff=self.now - timedelta(hours=60))
        make_fixture(7601, self.now - timedelta(hours=60), status="PST")
        leg.fixture = Fixture.objects.get(provider_id=7601); leg.save()

        reconcile_lists(now=self.now, dates=[self.day])
        leg.refresh_from_db()
        self.assertEqual(leg.status, LegStatus.VOID)
        self.assertIn("postponement", leg.resolution_note)
        # The void is audited.
        self.assertTrue(OfficialListCorrection.objects.filter(leg=leg).exists())

    def test_unsettled_fixture_without_result_voids_after_window(self):
        official = self._published()
        leg = self._leg(official, 7701, "home_win", kickoff=self.now - timedelta(hours=72))
        make_fixture(7701, self.now - timedelta(hours=72), status="NS")
        leg.fixture = Fixture.objects.get(provider_id=7701); leg.save()
        reconcile_lists(now=self.now, dates=[self.day])
        leg.refresh_from_db()
        self.assertEqual(leg.status, LegStatus.VOID)

    def test_list_is_lost_but_other_legs_keep_settling(self):
        official = self._published()
        loser = self._leg(official, 7801, "under_1_5")
        winner = self._leg(official, 7802, "over_2_5")
        make_fixture(7801, self.now - timedelta(hours=4), status="FT", home=3, away=0)
        make_fixture(7802, self.now - timedelta(hours=4), status="FT", home=3, away=0)
        loser.fixture = Fixture.objects.get(provider_id=7801); loser.save()
        winner.fixture = Fixture.objects.get(provider_id=7802); winner.save()

        reconcile_lists(now=self.now, dates=[self.day])
        official.refresh_from_db(); winner.refresh_from_db()
        self.assertEqual(official.status, OfficialListStatus.LOST)
        # The complete record stays visible: the other leg still settled.
        self.assertEqual(winner.status, LegStatus.WON)

    def test_reconciliation_is_idempotent(self):
        official = self._published()
        leg = self._leg(official, 7901, "over_2_5")
        make_fixture(7901, self.now - timedelta(hours=4), status="FT", home=3, away=0)
        leg.fixture = Fixture.objects.get(provider_id=7901); leg.save()

        first = reconcile_lists(now=self.now, dates=[self.day])
        second = reconcile_lists(now=self.now, dates=[self.day])
        self.assertEqual(first.legs_settled, 1)
        # A second pass must not re-settle or duplicate anything.
        self.assertEqual(second.legs_settled, 0)
        self.assertEqual(OfficialListCorrection.objects.count(), 0)

    def test_last_checked_timestamp_is_recorded(self):
        official = self._published()
        reconcile_lists(now=self.now, dates=[self.day])
        official.refresh_from_db()
        self.assertIsNotNone(official.last_checked_at)


class ReturnArithmeticTests(TestCase):
    """Decimal arithmetic and the void/missing-odds rules."""

    class _Leg:
        def __init__(self, pid, status, odds):
            self.provider_fixture_id = pid
            self.status = status
            self.decimal_odds = Decimal(odds) if odds is not None else None

    def test_all_winners_multiplies_odds_and_includes_stake(self):
        legs = [self._Leg(i, LegStatus.WON, "2.00") for i in range(5)]
        r = compute_list_return(legs, stake=Decimal("1000.00"))
        self.assertTrue(r.available)
        self.assertEqual(r.combined_odds, Decimal("32.0000"))
        self.assertEqual(r.total_return, Decimal("32000.0000"))
        self.assertEqual(r.net, Decimal("31000.0000"))

    def test_any_loss_returns_zero(self):
        legs = [self._Leg(i, LegStatus.WON, "2.00") for i in range(4)]
        legs.append(self._Leg(99, LegStatus.LOST, "2.00"))
        r = compute_list_return(legs, stake=Decimal("1000.00"))
        self.assertEqual(r.total_return, Decimal("0.00"))
        self.assertEqual(r.net, Decimal("-1000.00"))

    def test_void_leg_uses_odds_one(self):
        legs = [self._Leg(i, LegStatus.WON, "2.00") for i in range(4)]
        legs.append(self._Leg(99, LegStatus.VOID, "2.00"))
        r = compute_list_return(legs, stake=Decimal("1000.00"))
        self.assertEqual(r.combined_odds, Decimal("16.0000"))
        self.assertEqual(r.total_return, Decimal("16000.0000"))

    def test_entirely_void_list_returns_the_stake(self):
        legs = [self._Leg(i, LegStatus.VOID, "2.00") for i in range(5)]
        r = compute_list_return(legs, stake=Decimal("1000.00"))
        self.assertEqual(r.total_return, Decimal("1000.00"))
        self.assertEqual(r.net, Decimal("0.00"))

    def test_missing_odds_makes_money_unavailable_not_zero(self):
        legs = [self._Leg(i, LegStatus.WON, "2.00") for i in range(4)]
        legs.append(self._Leg(99, LegStatus.WON, None))
        r = compute_list_return(legs, stake=Decimal("1000.00"))
        # Never substitute 1/probability; show "unavailable" instead.
        self.assertFalse(r.available)
        self.assertIsNone(r.total_return)
        self.assertIsNone(r.net)
        self.assertEqual(r.missing_odds_count, 1)

    def test_unsettled_list_reports_potential_not_realised(self):
        legs = [self._Leg(i, LegStatus.PENDING, "2.00") for i in range(5)]
        r = compute_list_return(legs, stake=Decimal("1000.00"))
        self.assertFalse(r.settled_fully)
        self.assertIsNone(r.total_return)

    def test_currency_rounds_only_at_display(self):
        self.assertEqual(quantize_money(Decimal("32000.005")), Decimal("32000.01"))
        self.assertEqual(quantize_money(Decimal("1000.004")), Decimal("1000.00"))
        self.assertIsNone(quantize_money(None))


class SummaryMetricTests(TestCase):
    """Denominators must exclude void/unresolved and be reported separately."""

    def setUp(self):
        self.now = timezone.now()
        self.day = business_date(self.now)

    def _list(self, offset, status, leg_statuses):
        official = OfficialDailyList.objects.create(
            business_date=self.day - timedelta(days=offset), published_at=self.now,
            leagues=[39], engine_version="t", config_hash="h", status=status,
        )
        for i, leg_status in enumerate(leg_statuses):
            OfficialListLeg.objects.create(
                official_list=official, provider_fixture_id=offset * 100 + i,
                league_id=39, home_team_name="H", away_team_name="A", kickoff=self.now,
                market_id="over_2_5", probability=Decimal("0.5"), status=leg_status,
            )
        return official

    def test_win_rate_denominator_excludes_void_and_unresolved(self):
        self._list(1, OfficialListStatus.WON, [LegStatus.WON] * 5)
        self._list(2, OfficialListStatus.LOST, [LegStatus.WON] * 4 + [LegStatus.LOST])
        self._list(3, OfficialListStatus.VOID, [LegStatus.VOID] * 5)
        self._list(4, OfficialListStatus.UNRESOLVED, [LegStatus.UNRESOLVED] * 5)

        metrics = summary_metrics(OfficialDailyList.objects.all())
        lists = metrics["lists"]
        self.assertEqual(lists["won"], 1)
        self.assertEqual(lists["lost"], 1)
        self.assertEqual(lists["void"], 1)
        self.assertEqual(lists["unresolved"], 1)
        # 1 / (1 + 1), NOT 1/4: void and unresolved are excluded.
        self.assertEqual(lists["denominator"], 2)
        self.assertEqual(lists["win_rate"], Decimal("0.5"))

    def test_selection_hit_rate_uses_selection_denominator(self):
        self._list(1, OfficialListStatus.WON, [LegStatus.WON] * 5)
        self._list(2, OfficialListStatus.LOST, [LegStatus.WON] * 4 + [LegStatus.LOST])
        metrics = summary_metrics(OfficialDailyList.objects.all())
        sel = metrics["selections"]
        self.assertEqual(sel["won"], 9)
        self.assertEqual(sel["lost"], 1)
        self.assertEqual(sel["denominator"], 10)
        self.assertEqual(sel["hit_rate"], Decimal("0.9"))

    def test_no_settled_lists_yields_no_rate_rather_than_zero(self):
        self._list(1, OfficialListStatus.PENDING, [LegStatus.PENDING] * 5)
        metrics = summary_metrics(OfficialDailyList.objects.all())
        self.assertIsNone(metrics["lists"]["win_rate"])
        self.assertIsNone(metrics["selections"]["hit_rate"])


class PublicApiTests(TestCase):
    """Free endpoints must expose only the sample and public records."""

    def setUp(self):
        self.now = timezone.now()
        self.day = business_date(self.now)

    def test_today_reports_absent_list_explicitly(self):
        response = self.client.get("/api/v1/public/official/today/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["published"])
        self.assertIn("No official five-match list", body["message"])

    def test_history_includes_recent_dates_without_publication(self):
        response = self.client.get("/api/v1/public/official/history/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        # Gaps must be visible, not silently skipped.
        self.assertEqual(len(body["recent"]), 5)
        self.assertTrue(all(item["published"] is False for item in body["recent"]))

    def test_public_endpoints_require_no_authentication(self):
        for path in [
            "/api/v1/public/official/today/",
            "/api/v1/public/official/history/",
            "/api/v1/public/official/summary/",
            "/api/v1/public/official/preview/",
        ]:
            with self.subTest(path=path):
                self.assertNotEqual(self.client.get(path).status_code, 401)

    def test_preview_exposes_explainer_even_without_a_featured_match(self):
        response = self.client.get("/api/v1/public/official/preview/")
        body = response.json()
        self.assertFalse(body["available"])
        # The explainer is part of the free experience and always present.
        self.assertIn("limitations", body["explainer"])
        self.assertIn("how_the_list_is_made", body["explainer"])

    def test_premium_predictions_endpoint_still_requires_membership(self):
        response = self.client.get("/api/v1/predictions/")
        # The free preview must not have opened up premium data.
        self.assertIn(response.status_code, (401, 403))