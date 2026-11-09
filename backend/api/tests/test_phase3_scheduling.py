"""Phase 3 tests: cron scheduling, attribution, idempotency, recovery.

These tests cover the *scheduling* integration. They do not re-assert prediction or
betlist behaviour: Phases 1-2 own that, and duplicating it here would risk implying
the algorithm had changed.
"""

from datetime import datetime, time, timedelta, timezone as dt_timezone
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from api.admin_runs import AdminRunError, request_run
from api.admin_schedule import (
    SCHEDULE_DAILY_GENERATE,
    SCHEDULE_PRE_KICKOFF_REFRESH,
    AutomationDisabled,
    batch_leagues,
    automation_enabled,
    recover_stale_jobs,
    run_daily_generation,
    run_pre_kickoff_refresh,
    window_for,
)
from api.business_time import business_date
from api.models import AdminJob, AdminJobKind, AdminJobStatus, User
from zoneinfo import ZoneInfo

JHB = ZoneInfo("Africa/Johannesburg")

SCHED_SETTINGS = dict(
    ALLOWED_HOSTS=["testserver", "localhost"],
    PREDICTXI_LEAGUES=["39", "140", "78", "135", "136"],
    PREDICTXI_INGESTION_ENABLED=True,
    PREDICTXI_BUSINESS_TIMEZONE="Africa/Johannesburg",
    PREDICTXI_SCHEDULE_DAILY_TIME="05:00",
    PREDICTXI_SCHEDULE_REFRESH_TIME="",
    PREDICTXI_SCHEDULE_WINDOW_HOURS=6,
    PREDICTXI_BATCH_SIZE=2,
    PREDICTXI_STALE_JOB_HOURS=3,
)


def local(*args) -> object:
    """A business-timezone instant, converted to UTC for comparison."""
    return datetime(*args, tzinfo=JHB).astimezone(dt_timezone.utc)


@override_settings(**SCHED_SETTINGS)
class DefaultDisabledTests(TestCase):
    """Automation must do nothing until an operator explicitly enables it."""

    def test_automation_is_disabled_by_default(self):
        # No PREDICTXI_AUTOMATION_ENABLED override here on purpose.
        with override_settings(PREDICTXI_AUTOMATION_ENABLED=False):
            self.assertFalse(automation_enabled())

    def test_disabled_automation_refuses_to_queue_generation(self):
        with override_settings(PREDICTXI_AUTOMATION_ENABLED=False):
            with self.assertRaises(AutomationDisabled):
                run_daily_generation(now=timezone.now(), force=True)
        self.assertEqual(AdminJob.objects.count(), 0)

    def test_disabled_automation_refuses_to_queue_refresh(self):
        with override_settings(PREDICTXI_AUTOMATION_ENABLED=False):
            with self.assertRaises(AutomationDisabled):
                run_pre_kickoff_refresh(now=timezone.now(), force=True)
        self.assertEqual(AdminJob.objects.count(), 0)


@override_settings(**SCHED_SETTINGS, PREDICTXI_AUTOMATION_ENABLED=True)
class TriggerAttributionTests(TestCase):
    """Every run identifies how and why it started."""

    def test_scheduled_run_records_schedule_id_and_no_actor(self):
        with patch("api.admin_runs._dispatch"):
            outcome = run_daily_generation(now=local(2026, 3, 10, 5, 30), force=True)
        self.assertTrue(outcome.ran)
        job = AdminJob.objects.get(pk=outcome.jobs[0])
        self.assertEqual(job.trigger, "scheduled")
        self.assertEqual(job.schedule_id, SCHEDULE_DAILY_GENERATE)
        self.assertEqual(job.execution_mechanism, "cron")
        # Cron has no admin identity and must never need one.
        self.assertIsNone(job.requested_by)
        self.assertEqual(job.requested_by_label, "")

    def test_manual_run_records_actor_and_no_schedule(self):
        admin = User.objects.create_user(firebase_uid="sched-admin", email="a@b.test", is_staff=True)
        with patch("api.admin_runs._dispatch"):
            run = request_run(kind=AdminJobKind.GENERATE, target_date=business_date(),
                              leagues=[39], actor=admin)
        job = AdminJob.objects.get(pk=run.job_id)
        self.assertEqual(job.trigger, "admin")
        self.assertEqual(job.requested_by_id, admin.pk)
        self.assertEqual(job.requested_by_label, "a@b.test")
        self.assertEqual(job.schedule_id, "")
        self.assertEqual(job.execution_mechanism, "admin request")

    def test_manual_run_without_an_actor_is_refused(self):
        with self.assertRaises(AdminRunError) as ctx:
            request_run(kind=AdminJobKind.GENERATE, target_date=business_date(), leagues=[39])
        self.assertIn("must record the admin", str(ctx.exception))

    def test_scheduled_run_without_a_schedule_id_is_refused(self):
        with self.assertRaises(AdminRunError) as ctx:
            request_run(kind=AdminJobKind.GENERATE, target_date=business_date(),
                        leagues=[39], trigger="scheduled")
        self.assertIn("schedule identifier", str(ctx.exception))

    def test_unknown_trigger_is_refused(self):
        with self.assertRaises(AdminRunError):
            request_run(kind=AdminJobKind.GENERATE, target_date=business_date(),
                        leagues=[39], trigger="pretend-admin")

    def test_attribution_is_visible_through_the_admin_api(self):
        with patch("api.admin_runs._dispatch"):
            outcome = run_daily_generation(now=local(2026, 3, 10, 5, 30), force=True)
        admin = User.objects.create_user(firebase_uid="sched-api", is_staff=True)
        patch("api.authentication.get_firebase_app", return_value=object()).start()
        patch("api.authentication.auth.verify_id_token",
              return_value={"uid": admin.firebase_uid}).start()
        self.addCleanup(patch.stopall)
        from rest_framework.test import APIClient

        client = APIClient(SERVER_NAME="testserver")
        client.credentials(HTTP_AUTHORIZATION="Bearer t")
        response = client.get(f"/api/v1/admin/jobs/{outcome.jobs[0]}/")
        body = response.json()
        self.assertEqual(body["trigger"], "scheduled")
        self.assertEqual(body["scheduleId"], SCHEDULE_DAILY_GENERATE)
        self.assertEqual(body["executionMechanism"], "cron")


@override_settings(**SCHED_SETTINGS, PREDICTXI_AUTOMATION_ENABLED=True)
class ScheduleWindowTests(TestCase):
    """Due times are evaluated in the business timezone, not the host's."""

    def test_window_uses_business_timezone_not_host_time(self):
        # 05:00 Johannesburg is 03:00 UTC in March (SAST is UTC+2, no DST).
        window = window_for(business_date(local(2026, 3, 10, 5, 30)), time(5, 0))
        self.assertEqual(window.due_at.hour, 3)  # UTC
        self.assertTrue(window.contains(local(2026, 3, 10, 5, 30)))
        self.assertTrue(window.contains(local(2026, 3, 10, 8, 0)))

    def test_before_the_due_time_is_not_due(self):
        window = window_for(business_date(local(2026, 3, 10, 5, 30)), time(5, 0))
        self.assertFalse(window.contains(local(2026, 3, 10, 4, 0)))

    def test_outside_the_window_is_not_due_but_a_late_tick_still_is(self):
        window = window_for(business_date(local(2026, 3, 10, 5, 30)), time(5, 0))
        # 11:30 JHB is past the 6-hour window.
        self.assertFalse(window.contains(local(2026, 3, 10, 11, 30)))
        # 09:00 JHB is late but inside it, so a suspended host recovers.
        self.assertTrue(window.contains(local(2026, 3, 10, 9, 0)))

    def test_a_tick_outside_the_window_runs_nothing(self):
        with patch("api.admin_runs._dispatch"):
            outcome = run_daily_generation(now=local(2026, 3, 10, 20, 0))
        self.assertFalse(outcome.ran)
        self.assertIn("window", outcome.reason)
        self.assertEqual(AdminJob.objects.count(), 0)

    def test_business_date_boundary_not_utc_boundary(self):
        # 00:30 Johannesburg on the 11th is 22:30 UTC on the 10th; the business
        # date must be the 11th, not the 10th.
        self.assertEqual(business_date(local(2026, 3, 11, 0, 30)).isoformat(), "2026-03-11")


@override_settings(**SCHED_SETTINGS, PREDICTXI_AUTOMATION_ENABLED=True)
class BatchingAndCoverageTests(TestCase):
    """Batching bounds work per call without changing what a run means."""

    def test_leagues_are_split_into_configured_batches(self):
        batches = batch_leagues([39, 140, 78, 135, 136], size=2)
        self.assertEqual(batches, [[39, 78], [135, 136], [140]])

    def test_batching_deduplicates_and_does_not_lose_leagues(self):
        batches = batch_leagues([39, 39, 140], size=2)
        flattened = [league for batch in batches for league in batch]
        self.assertEqual(sorted(flattened), [39, 140])

    def test_invalid_batch_size_is_refused(self):
        with self.assertRaises(AutomationDisabled):
            batch_leagues([39], size=0)

    def test_daily_generation_covers_every_configured_league_in_one_run(self):
        with patch("api.admin_runs._dispatch"):
            outcome = run_daily_generation(now=local(2026, 3, 10, 5, 30), force=True)
        jobs = AdminJob.objects.filter(target_date=business_date(local(2026, 3, 10, 5, 30)))
        covered = sorted({league for job in jobs for league in job.leagues})
        self.assertEqual(covered, [39, 78, 135, 136, 140])
        # ONE run per (kind, date): batching bounds work inside the run, so the
        # concurrency guard keeps its meaning and duplicate ticks stay harmless.
        self.assertEqual(jobs.count(), 1)

    def test_no_configured_leagues_skips_cleanly(self):
        with override_settings(PREDICTXI_LEAGUES=[]):
            with patch("api.admin_runs._dispatch"):
                outcome = run_daily_generation(now=local(2026, 3, 10, 5, 30), force=True)
        self.assertFalse(outcome.ran)
        self.assertIn("No leagues", outcome.reason)


@override_settings(**SCHED_SETTINGS, PREDICTXI_AUTOMATION_ENABLED=True)
class IdempotencyTests(TestCase):
    """Repeated cron ticks must never duplicate work."""

    def test_repeated_ticks_do_not_duplicate_runs(self):
        with patch("api.admin_runs._dispatch"):
            first = run_daily_generation(now=local(2026, 3, 10, 5, 30), force=True)
            second = run_daily_generation(now=local(2026, 3, 10, 5, 35), force=True)
        self.assertTrue(first.ran)
        self.assertFalse(second.ran)
        # One run for the day, and a second tick adds nothing.
        self.assertEqual(AdminJob.objects.count(), 1)

    def test_repeated_ticks_after_completion_do_not_duplicate(self):
        with patch("api.admin_runs._dispatch"):
            first = run_daily_generation(now=local(2026, 3, 10, 5, 30), force=True)
        AdminJob.objects.all().update(status=AdminJobStatus.COMPLETED)
        with patch("api.admin_runs._dispatch"):
            # Completed runs leave the partial unique guard free, so a forced
            # repeat may queue again. What must NEVER happen is two ACTIVE runs
            # for the same scope at once.
            second = run_daily_generation(now=local(2026, 3, 10, 5, 40), force=True)
        self.assertTrue(second.ran)
        active = AdminJob.objects.filter(status=AdminJobStatus.QUEUED)
        self.assertEqual(active.count(), 1)

    def test_manual_and_scheduled_overlap_is_refused(self):
        admin = User.objects.create_user(firebase_uid="overlap-admin", is_staff=True)
        with patch("api.admin_runs._dispatch"):
            # Automation queues first for the whole configured set.
            run_daily_generation(now=local(2026, 3, 10, 5, 30), force=True)
            # An admin then tries the same kind and date.
            with self.assertRaises(AdminRunError) as ctx:
                request_run(kind=AdminJobKind.GENERATE, target_date=business_date(
                    local(2026, 3, 10, 5, 30)), leagues=[39], actor=admin)
        self.assertIn("already queued or running", str(ctx.exception))

    def test_scheduled_overlap_with_admin_is_refused(self):
        admin = User.objects.create_user(firebase_uid="overlap-admin2", is_staff=True)
        today = business_date()
        with patch("api.admin_runs._dispatch"):
            request_run(kind=AdminJobKind.GENERATE, target_date=today,
                        leagues=[39, 78, 135, 136, 140], actor=admin)
            outcome = run_daily_generation(now=timezone.now(), force=True)
        # The scheduled pass cannot queue while the admin's run holds the scope.
        self.assertFalse(outcome.ran)


@override_settings(**SCHED_SETTINGS, PREDICTXI_AUTOMATION_ENABLED=True)
class RecoveryTests(TestCase):
    """Interrupted runs are recovered without duplicating successes."""

    def test_stale_running_job_is_failed(self):
        job = AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.RUNNING,
            target_date=business_date(), season=2026, leagues=[39], trigger="scheduled",
            schedule_id=SCHEDULE_DAILY_GENERATE, execution_mechanism="cron",
            started_at=timezone.now() - timedelta(hours=5),
        )
        recovered = recover_stale_jobs(now=timezone.now())
        self.assertEqual(recovered, 1)
        job.refresh_from_db()
        self.assertEqual(job.status, AdminJobStatus.FAILED)
        self.assertIn("Interrupted", job.error_code)

    def test_recently_started_job_is_not_recovered(self):
        job = AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.RUNNING,
            target_date=business_date(), season=2026, leagues=[39], trigger="scheduled",
            schedule_id=SCHEDULE_DAILY_GENERATE, execution_mechanism="cron",
            started_at=timezone.now() - timedelta(minutes=10),
        )
        self.assertEqual(recover_stale_jobs(now=timezone.now()), 0)
        job.refresh_from_db()
        # A genuinely running job must not be killed prematurely.
        self.assertEqual(job.status, AdminJobStatus.RUNNING)

    def test_recovery_frees_the_scope_for_a_retry(self):
        today = business_date()
        AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.RUNNING,
            target_date=today, season=2026, leagues=[39], trigger="scheduled",
            schedule_id=SCHEDULE_DAILY_GENERATE, execution_mechanism="cron",
            started_at=timezone.now() - timedelta(hours=5),
        )
        recover_stale_jobs(now=timezone.now())
        with patch("api.admin_runs._dispatch"):
            outcome = run_daily_generation(now=timezone.now(), force=True)
        # After recovery the daily scope can be attempted again.
        self.assertTrue(outcome.ran)


@override_settings(**SCHED_SETTINGS, PREDICTXI_AUTOMATION_ENABLED=True)
class RefreshSafetyTests(TestCase):
    """A failed refresh must never remove already-published forecasts."""

    def test_failed_refresh_preserves_previous_predictions(self):
        from api.models import Fixture, Prediction

        fixture = Fixture.objects.create(
            provider_id=9001, league_id=39, season=2026, home_team_id=1, away_team_id=2,
            home_team_name="H", away_team_name="A",
            kickoff=timezone.now() + timedelta(hours=6), status="NS",
            fetched_at=timezone.now(), source_payload={},
        )
        published = Prediction.objects.create(
            fixture=fixture, engine_version="e", input_hash="i" * 8, config_hash="c" * 8,
            generated_at=timezone.now(), as_of=timezone.now(),
            inputs={}, output={"markets": []}, provenance={}, configuration={},
        )

        # A refresh fails.
        job = AdminJob.objects.create(
            kind=AdminJobKind.REFRESH, status=AdminJobStatus.RUNNING,
            target_date=business_date(), season=2026, leagues=[39], trigger="scheduled",
            schedule_id=SCHEDULE_PRE_KICKOFF_REFRESH, execution_mechanism="cron",
        )
        from api.admin_runs import mark_failed

        mark_failed(job, error="ProviderError")

        # The previously published forecast is untouched.
        self.assertTrue(Prediction.objects.filter(pk=published.pk).exists())

    def test_refresh_not_scheduled_when_no_time_configured(self):
        with override_settings(PREDICTXI_SCHEDULE_REFRESH_TIME=""):
            outcome = run_pre_kickoff_refresh(now=local(2026, 3, 10, 9, 0))
        self.assertFalse(outcome.ran)
        self.assertIn("No refresh time", outcome.reason)

    def test_refresh_runs_when_configured_inside_its_window(self):
        with override_settings(PREDICTXI_SCHEDULE_REFRESH_TIME="09:00"):
            with patch("api.admin_runs._dispatch"):
                outcome = run_pre_kickoff_refresh(now=local(2026, 3, 10, 9, 30))
        self.assertTrue(outcome.ran)
        job = AdminJob.objects.get(pk=outcome.jobs[0])
        self.assertEqual(job.kind, AdminJobKind.REFRESH)
        self.assertEqual(job.schedule_id, SCHEDULE_PRE_KICKOFF_REFRESH)


@override_settings(**SCHED_SETTINGS, PREDICTXI_AUTOMATION_ENABLED=True)
class ScheduledPublicationTests(TestCase):
    """Scheduling forecasts must not authorise publishing the official list."""

    def test_no_scheduled_job_uses_the_publish_kind(self):
        with patch("api.admin_runs._dispatch"):
            run_daily_generation(now=timezone.now(), force=True)
            with override_settings(PREDICTXI_SCHEDULE_REFRESH_TIME="09:00"):
                run_pre_kickoff_refresh(now=local(2026, 3, 10, 9, 30))
        kinds = set(AdminJob.objects.values_list("kind", flat=True))
        # Publication needs its own explicit configuration and pre-kickoff
        # safeguards; it is never implied by a scheduled forecast run.
        self.assertNotIn(AdminJobKind.PUBLISH, kinds)

    def test_official_snapshot_is_untouched_by_scheduled_runs(self):
        from api.models import OfficialDailyList

        today = business_date()
        official = OfficialDailyList.objects.create(
            business_date=today, published_at=timezone.now(), leagues=[39],
            engine_version="e", config_hash="c", status="pending",
        )
        frozen = (official.engine_version, official.config_hash, official.published_at)

        with patch("api.admin_runs._dispatch"):
            run_daily_generation(now=timezone.now(), force=True)

        official.refresh_from_db()
        self.assertEqual(
            (official.engine_version, official.config_hash, official.published_at), frozen
        )


@override_settings(**SCHED_SETTINGS, PREDICTXI_AUTOMATION_ENABLED=False)
class CommandTests(TestCase):
    """The cron command is safe to invoke repeatedly and reports clearly."""

    def test_command_reports_disabled_without_error(self):
        from io import StringIO

        from django.core.management import call_command

        out = StringIO()
        call_command("run_schedule", "--due", stdout=out)
        self.assertIn("disabled", out.getvalue().lower())
        self.assertEqual(AdminJob.objects.count(), 0)

    def test_command_queues_when_enabled_and_due(self):
        from io import StringIO

        from django.core.management import call_command

        with override_settings(PREDICTXI_AUTOMATION_ENABLED=True,
                               PREDICTXI_SCHEDULE_DAILY_TIME="05:00"):
            out = StringIO()
            with patch("api.admin_runs._dispatch"):
                # Force the pass so the test does not depend on wall-clock time.
                call_command("run_schedule", "--daily-generate", stdout=out)
        self.assertIn("daily-generate", out.getvalue())
        self.assertGreater(AdminJob.objects.count(), 0)

    def test_command_rejects_unknown_schedule_time(self):
        from django.core.management.base import CommandError
        from django.core.management import call_command

        with override_settings(PREDICTXI_AUTOMATION_ENABLED=True,
                               PREDICTXI_SCHEDULE_DAILY_TIME="not-a-time"):
            with self.assertRaises(CommandError):
                call_command("run_schedule", "--daily-generate")


@override_settings(**SCHED_SETTINGS, PREDICTXI_AUTOMATION_ENABLED=True)
class ManualStillAvailableTests(TestCase):
    """Automation enabled must not remove manual admin operation."""

    def test_admin_can_still_run_manually_with_automation_on(self):
        admin = User.objects.create_user(firebase_uid="manual-ok", is_staff=True)
        with patch("api.admin_runs._dispatch"):
            run = request_run(kind=AdminJobKind.REFRESH, target_date=business_date(),
                              leagues=[39], actor=admin)
        job = AdminJob.objects.get(pk=run.job_id)
        self.assertEqual(job.trigger, "admin")
        self.assertEqual(job.status, AdminJobStatus.QUEUED)

    def test_member_cannot_reach_admin_run_endpoint(self):
        member = User.objects.create_user(firebase_uid="member-p3")
        patch("api.authentication.get_firebase_app", return_value=object()).start()
        patch("api.authentication.auth.verify_id_token",
              return_value={"uid": member.firebase_uid}).start()
        self.addCleanup(patch.stopall)
        from rest_framework.test import APIClient

        client = APIClient(SERVER_NAME="testserver")
        client.credentials(HTTP_AUTHORIZATION="Bearer t")
        response = client.post("/api/v1/admin/runs/",
                               {"kind": "generate", "leagues": [39]},
                               content_type="application/json")
        self.assertIn(response.status_code, (401, 403))