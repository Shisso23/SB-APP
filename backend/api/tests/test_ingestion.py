from datetime import timedelta
from unittest.mock import patch

from django.test import TransactionTestCase
from django.utils import timezone

from api.execution import run_engine
from api.ingestion import IngestionError, assemble_input, milliseconds, store_fixtures, store_odds, store_standings, utc
from api.jobs import claim_job
from api.models import Fixture, OddsSnapshot, SourceObservation


def fixture_payload(now, *, provider_id=1, finished=False):
    kickoff = now - timedelta(days=1) if finished else now + timedelta(hours=1)
    return {"fixture": {"id": provider_id, "timestamp": int(kickoff.timestamp()), "date": kickoff.isoformat(), "status": {"short": "FT" if finished else "NS"}},
            "league": {"id": 39, "season": 2026, "name": "Test League"},
            "teams": {"home": {"id": 1, "name": "Home"}, "away": {"id": 2, "name": "Away"}},
            "goals": {"home": 2 if finished else None, "away": 1 if finished else None},
            "score": {"halftime": {"home": 1 if finished else None, "away": 0 if finished else None}}}


class IngestionTests(TransactionTestCase):
    def setUp(self):
        self.now = timezone.now()
        self.configuration = run_engine({"operation": "describe", "now": milliseconds(self.now)})["configuration"]

    def test_canonical_upsert_and_observation_idempotency(self):
        with claim_job("refresh", "39:2026", self.now) as run:
            payload = {"response": [fixture_payload(self.now)]}
            first = store_fixtures(run, payload, 39, 2026)
            second = store_fixtures(run, payload, 39, 2026)
            self.assertEqual(first.pk, second.pk)
        self.assertEqual(Fixture.objects.count(), 1)
        self.assertEqual(SourceObservation.objects.count(), 1)

    def test_invalid_or_partial_batch_does_not_commit(self):
        with claim_job("refresh", "39:2026", self.now) as run:
            bad = fixture_payload(self.now, provider_id=2)
            bad["fixture"]["timestamp"] *= 1000
            with self.assertRaises(IngestionError):
                store_fixtures(run, {"response": [fixture_payload(self.now), bad]}, 39, 2026)
            self.assertFalse(Fixture.objects.exists())
            self.assertFalse(SourceObservation.objects.exists())

    def test_only_available_completed_history_and_fresh_standings_are_used(self):
        with claim_job("refresh", "39:2026", self.now) as run:
            store_fixtures(run, {"response": [fixture_payload(self.now), fixture_payload(self.now, provider_id=2, finished=True)]}, 39, 2026)
            fixture = Fixture.objects.get(provider_id=1)
            as_of = timezone.now()
            store_standings(run, {"response": []}, 39, 2026)
            data, provenance, _expiry = assemble_input(fixture, as_of, self.configuration)
            self.assertEqual(len(data["allFixtures"]), 1)
            self.assertEqual(data["leaguesStandings"], [])
            self.assertTrue(provenance)
            with self.assertRaises(IngestionError):
                assemble_input(fixture, as_of - timedelta(minutes=1), self.configuration, historical=True)

    def test_stale_target_and_post_kickoff_clocks_are_rejected(self):
        with claim_job("refresh", "39:2026", self.now) as run:
            source = store_fixtures(run, {"response": [fixture_payload(self.now)]}, 39, 2026)
            fixture = Fixture.objects.get()
            SourceObservation.objects.filter(pk=source.pk).update(observed_at=self.now - timedelta(hours=1))
            with self.assertRaises(IngestionError):
                assemble_input(fixture, timezone.now(), self.configuration)
            with self.assertRaises(IngestionError):
                assemble_input(fixture, fixture.kickoff, self.configuration)

    def test_stale_and_missing_quote_update_are_not_actionable(self):
        with claim_job("refresh", "39:2026", self.now) as run:
            store_fixtures(run, {"response": [fixture_payload(self.now)]}, 39, 2026)
            fixture = Fixture.objects.get()
            raw = {"fixture": {"id": 1}, "update": (self.now - timedelta(days=2)).isoformat(),
                   "bookmakers": [{"name": "Test Book", "bets": [{"id": 1, "values": [{"value": "Home", "odd": "2"}]}]}]}
            store_odds(run, {"response": [raw]}, 39, 2026)
            data, _provenance, _expiry = assemble_input(fixture, timezone.now(), self.configuration)
            self.assertEqual(data["odds"], [])
            self.assertEqual(OddsSnapshot.objects.count(), 1)
            raw.pop("update")
            store_odds(run, {"response": [raw]}, 39, 2026)
            data, _provenance, _expiry = assemble_input(fixture, timezone.now(), self.configuration)
            self.assertEqual(data["odds"], [])

    def test_utc_offsets_are_normalized_and_naive_dates_rejected(self):
        self.assertEqual(utc("2026-10-18T12:00:00+02:00"), utc("2026-10-18T10:00:00Z"))
        with self.assertRaises(IngestionError):
            utc("2026-10-18T10:00:00")