import json
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase

from api.execution import ExecutionError, engine_version, run_engine
from api.jobs import digest


class RunnerTests(SimpleTestCase):
    def setUp(self):
        self.golden = json.loads((Path(__file__).parent / "data" / "prediction-golden.json").read_text())
        self.payload = {"operation": "predict", "now": self.golden["now"], "input": {
            "fixture": self.golden["fixture"], "allFixtures": [], "leaguesStandings": [], "standingsAreCurrent": False,
        }}

    def test_golden_outputs_and_repeatability(self):
        output = run_engine(self.payload)
        self.assertEqual({key: output["probabilities"][key] for key in self.golden["expected"]}, self.golden["expected"])
        self.assertEqual(output["selections"], [])
        self.assertEqual(digest(output), digest(run_engine(self.payload)))
        self.assertEqual(len(engine_version()), 64)

    def test_configuration_is_the_existing_engine_default(self):
        configuration = run_engine({"operation": "describe", "now": self.golden["now"]})["configuration"]
        self.assertEqual(configuration["recentWindow"], 20)
        self.assertEqual(configuration["goalModel"]["recentFormWeight"]["btts_yes"], 0)

    def test_executable_bundle_excludes_browser_networking(self):
        from api.execution import RUNNER
        runtime = RUNNER.read_text()
        for marker in ["auth-network-service", "x-apisports-key", "xApiSportsKey"]:
            self.assertNotIn(marker, runtime)

    def test_timeout_invalid_input_and_size_limits(self):
        with self.assertRaises(ExecutionError):
            run_engine(self.payload, timeout_seconds=0.000001)
        with self.assertRaises(ExecutionError):
            run_engine({"operation": "unknown", "now": self.golden["now"]})
        with self.assertRaises(ExecutionError):
            run_engine({"oversize": "x" * (4 * 1024 * 1024)})

    def test_child_process_never_inherits_application_credentials(self):
        import api.execution as execution
        actual_popen = execution.subprocess.Popen
        with patch.dict("os.environ", {"API_FOOTBALL_KEY": "not-forwarded", "DATABASE_URL": "not-forwarded", "GOOGLE_APPLICATION_CREDENTIALS": "not-forwarded"}):
            with patch("api.execution.subprocess.Popen", wraps=actual_popen) as process:
                run_engine(self.payload)
                self.assertEqual(process.call_args.kwargs["env"], {"TZ": "UTC", "LANG": "C.UTF-8"})
                self.assertFalse(process.call_args.kwargs["shell"])


from datetime import timedelta
from django.test import TransactionTestCase
from django.utils import timezone
from api.execution import generate_prediction, settle_fixture
from api.ingestion import store_fixtures, store_odds
from api.jobs import claim_job
from api.models import Fixture, Prediction, Settlement
from api.tests.test_ingestion import fixture_payload


class PublicationTests(TransactionTestCase):
    def setUp(self):
        self.now = timezone.now()

    def prepare(self, run):
        store_fixtures(run, {"response": [fixture_payload(self.now)]}, 39, 2026)
        store_odds(run, {"response": [{"fixture": {"id": 1}, "update": (self.now - timedelta(minutes=1)).isoformat(),
                                      "bookmakers": [{"name": "Test", "bets": [{"id": 1, "values": [{"value": "Home", "odd": "3"}]}]}]}]}, 39, 2026)
        return Fixture.objects.get()

    def test_same_input_is_deduplicated_with_versioned_provenance(self):
        with claim_job("predict", "39:2026", self.now) as run:
            fixture = self.prepare(run)
            as_of = timezone.now()
            first = generate_prediction(run, fixture, as_of=as_of)
            second = generate_prediction(run, fixture, as_of=as_of)
            self.assertEqual(first.pk, second.pk)
            self.assertEqual(Prediction.objects.count(), 1)
            self.assertTrue(first.provenance)
            self.assertEqual(first.config_hash, digest(first.configuration))
            self.assertEqual(first.input_hash, digest(first.inputs))
            self.assertLess(first.as_of, fixture.kickoff)

    def test_crossing_kickoff_or_fixture_change_discards_output(self):
        import api.execution as execution
        actual = execution.run_engine
        def change_kickoff(payload, **kwargs):
            output = actual(payload, **kwargs)
            if payload["operation"] == "predict":
                Fixture.objects.update(kickoff=timezone.now() - timedelta(seconds=1))
            return output
        with claim_job("predict", "39:2026", self.now) as run:
            fixture = self.prepare(run)
            with patch("api.execution.run_engine", side_effect=change_kickoff):
                with self.assertRaises(ExecutionError):
                    generate_prediction(run, fixture)
            self.assertFalse(Prediction.objects.exists())

    def test_settlement_is_separate_idempotent_and_flags_result_corrections(self):
        with claim_job("predict", "39:2026", self.now) as run:
            fixture = self.prepare(run)
            prediction = generate_prediction(run, fixture)
            self.assertFalse(Settlement.objects.exists())
            self.assertEqual(settle_fixture(run, fixture)["settled"], 0)
            completed = fixture_payload(self.now)
            completed["fixture"]["status"]["short"] = "FT"
            completed["goals"] = {"home": 2, "away": 1}
            after_kickoff = fixture.kickoff + timedelta(hours=2)
            with patch("api.execution.timezone.now", return_value=after_kickoff):
                store_fixtures(run, {"response": [completed]}, 39, 2026)
                fixture.refresh_from_db()
                self.assertEqual(settle_fixture(run, fixture)["settled"], 1)
                self.assertEqual(settle_fixture(run, fixture), {"settled": 0, "corrections": 0})
                original = Settlement.objects.get(prediction=prediction)
                self.assertTrue(original.outcome)
                self.assertEqual(float(original.profit), 2)
                completed["goals"] = {"home": 0, "away": 1}
            with patch("api.execution.timezone.now", return_value=after_kickoff + timedelta(minutes=1)):
                store_fixtures(run, {"response": [completed]}, 39, 2026)
                fixture.refresh_from_db()
                self.assertEqual(settle_fixture(run, fixture)["corrections"], 1)
                original.refresh_from_db()
                self.assertTrue(original.outcome)
                self.assertEqual(float(original.profit), 2)
                self.assertIsNotNone(original.correction_flagged_at)
                self.assertEqual(settle_fixture(run, fixture)["corrections"], 0)