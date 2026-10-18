from datetime import timedelta
from io import StringIO
import json
from threading import Thread
from unittest.mock import Mock, patch

from django.db import close_old_connections
from django.test import TransactionTestCase
from django.utils import timezone

from api.jobs import BudgetExceeded, JobBusy, JobError, JobPolicy, claim_job
from api.models import JobRun, ProviderBudget
from api.models import Fixture, Prediction, Settlement
from api.providers import ApiFootballProvider
from api.tests.test_ingestion import fixture_payload
from api.tests.test_provider import response
from django.core.management import call_command
from django.core.management.base import CommandError


class JobTests(TransactionTestCase):
    def setUp(self):
        self.slot = timezone.now().replace(second=0, microsecond=0)

    def test_duplicate_completed_slot_is_skipped(self):
        with claim_job("refresh", "39:2026", self.slot) as run:
            run.checkpoint(fixtures=True)
        with claim_job("refresh", "39:2026", self.slot) as duplicate:
            self.assertIsNone(duplicate)
        self.assertEqual(JobRun.objects.get().attempts, 1)

    def test_concurrent_worker_is_rejected_by_postgresql(self):
        outcomes = []
        def competing_worker():
            close_old_connections()
            try:
                with claim_job("refresh", "39:2026", self.slot):
                    outcomes.append("incorrectly-acquired")
            except JobBusy:
                outcomes.append("busy")
            finally:
                close_old_connections()
        with claim_job("refresh", "39:2026", self.slot):
            worker = Thread(target=competing_worker)
            worker.start()
            worker.join(timeout=10)
            self.assertFalse(worker.is_alive())
        self.assertEqual(outcomes, ["busy"])

    def test_crash_recovery_retains_checkpoint_and_replaces_claim(self):
        with self.assertRaises(KeyboardInterrupt):
            with claim_job("refresh", "39:2026", self.slot) as run:
                run.checkpoint(done=[1])
                old_token = run.token
                raise KeyboardInterrupt()
        with claim_job("refresh", "39:2026", self.slot) as recovered:
            self.assertEqual(recovered.run.checkpoint["done"], [1])
            self.assertNotEqual(recovered.token, old_token)
            self.assertEqual(recovered.run.attempts, 2)

    def test_shared_and_per_job_budgets_charge_before_requests(self):
        with claim_job("refresh", "39:2026", self.slot, JobPolicy(max_requests=2, per_minute=2)) as run:
            run.charge_request()
            run.charge_request()
            with self.assertRaises(BudgetExceeded):
                run.charge_request()
        self.assertEqual(ProviderBudget.objects.get().daily_requests, 2)
        with claim_job("refresh", "39:2026", self.slot + timedelta(minutes=1), JobPolicy(per_minute=2)) as run:
            with self.assertRaises(BudgetExceeded):
                run.charge_request()

    def test_stale_claim_and_deadline_cannot_write(self):
        with claim_job("predict", "39:2026", self.slot) as run:
            with patch("api.jobs.time.monotonic", return_value=run.deadline + 1):
                with self.assertRaises(JobError):
                    run.checkpoint(unsafe=True)
            original = run.token
            run.token = None
            with self.assertRaises(JobError):
                run.checkpoint(unsafe=True)
            run.token = original

    def test_lost_lock_session_cannot_commit(self):
        with self.assertRaises(JobError):
            with claim_job("predict", "39:2026", self.slot) as run:
                run.lock.close()
                run.checkpoint(unsafe=True)
        self.assertNotIn("unsafe", JobRun.objects.get().checkpoint)

    def test_failures_are_sanitized_and_retry_delay_is_enforced(self):
        with self.assertRaises(ValueError):
            with claim_job("refresh", "39:2026", self.slot):
                raise ValueError("private details must not be stored")
        row = JobRun.objects.get()
        self.assertEqual(row.error_code, "ValueError")
        with self.assertRaises(JobError):
            with claim_job("refresh", "39:2026", self.slot):
                self.fail("retry should be delayed")

    def test_management_command_is_disabled_without_any_provider_call(self):
        with patch.dict("os.environ", {"PREDICTXI_INGESTION_ENABLED": "False"}):
            with patch("api.management.commands.run_prediction_job.ApiFootballProvider") as provider:
                with self.assertRaises(CommandError):
                    call_command("run_prediction_job", mode="refresh", league=39, season=2026)
                provider.assert_not_called()
        self.assertFalse(JobRun.objects.exists())

    def test_quota_cooldown_and_crash_attempt_limit(self):
        with claim_job("refresh", "39:2026", self.slot) as run:
            run.charge_request()
            run.quota_cooldown()
            with self.assertRaises(BudgetExceeded):
                run.charge_request()
        crash_slot = self.slot + timedelta(minutes=1)
        for _attempt in range(3):
            with self.assertRaises(KeyboardInterrupt):
                with claim_job("predict", "39:2026", crash_slot):
                    raise KeyboardInterrupt()
        with self.assertRaises(JobError):
            with claim_job("predict", "39:2026", crash_slot):
                self.fail("attempt limit must stop execution")

    def test_management_pipeline_uses_only_mocked_http_and_settles_separately(self):
        original = fixture_payload(self.slot)
        session = Mock()
        def request(url, **kwargs):
            if url.endswith("/fixtures"):
                return response([original])
            if url.endswith("/standings"):
                return response([])
            if url.endswith("/odds"):
                return response([{"fixture": {"id": 1}, "update": self.slot.isoformat(),
                                  "bookmakers": [{"name": "Test", "bets": [{"id": 1, "values": [{"value": "Home", "odd": "3"}]}]}]}])
            raise AssertionError("Unexpected provider endpoint")
        session.get.side_effect = request
        with patch.dict("os.environ", {"PREDICTXI_INGESTION_ENABLED": "True", "PREDICTXI_LEAGUES": "39"}):
            with self.settings(API_FOOTBALL_KEY="synthetic-test-only"):
                with patch("api.management.commands.run_prediction_job.ApiFootballProvider", side_effect=lambda **kwargs: ApiFootballProvider(session=session, **kwargs)):
                    for mode in ["refresh", "predict"]:
                        call_command("run_prediction_job", mode=mode, league=39, season=2026, stdout=StringIO())
                    self.assertEqual(Prediction.objects.count(), 1)
                    self.assertFalse(Settlement.objects.exists())
                    self.assertEqual(ProviderBudget.objects.get().daily_requests, 3)
                    original["fixture"]["status"]["short"] = "FT"
                    original["goals"] = {"home": 2, "away": 1}
                    later = Fixture.objects.get().kickoff + timedelta(hours=2)
                    with patch("api.jobs.timezone.now", return_value=later):
                        call_command("run_prediction_job", mode="refresh", league=39, season=2026, stdout=StringIO())
                        call_command("run_prediction_job", mode="settle", league=39, season=2026, stdout=StringIO())
                        self.assertEqual(Settlement.objects.count(), 1)
                        count = session.get.call_count
                        call_command("run_prediction_job", mode="settle", league=39, season=2026, stdout=StringIO())
                        self.assertEqual(session.get.call_count, count)
                        self.assertEqual(Settlement.objects.count(), 1)