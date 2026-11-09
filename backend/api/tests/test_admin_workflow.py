"""Phase 8 tests: admin-managed prediction workflow.

Scope of these tests is orchestration, permissions and reporting. They assert
nothing about prediction values, thresholds or betlist selection — that logic is
untouched, and re-asserting it here would risk implying it had changed.

No test performs provider or engine I/O: execution is either mocked or exercised
against an intentionally disabled pipeline.
"""

from datetime import date, timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.admin_coverage import CoverageStatus, build_coverage, configured_leagues
from api.admin_runs import AdminRunError, _validate_leagues, request_run
from api.models import (
    AdminJob,
    AdminJobKind,
    AdminJobStatus,
    Fixture,
    OfficialDailyList,
    Prediction,
    User,
)

ADMIN_SETTINGS = dict(
    ALLOWED_HOSTS=["testserver", "localhost"],
    PREDICTXI_LEAGUES=["39", "140", "78"],
    PREDICTXI_INGESTION_ENABLED=True,
)


def make_user(uid, **kw):
    return User.objects.create_user(firebase_uid=uid, **kw)


def make_admin(uid="admin-1"):
    return make_user(uid, is_staff=True)


def authenticate(user):
    """Return an APIClient authenticated as `user`.

    The project authenticates with a Firebase ID token, not a session (and
    `django.contrib.sessions` is not installed), so the verified token is patched
    for the duration of the test - the same approach the existing access tests use.
    """
    patch("api.authentication.get_firebase_app", return_value=object()).start()
    patch(
        "api.authentication.auth.verify_id_token",
        return_value={"uid": user.firebase_uid, "email": user.email or ""},
    ).start()
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer test-token")
    return client


def make_fixture(provider_id, kickoff, *, status="NS", league_id=39, season=2026):
    return Fixture.objects.create(
        provider_id=provider_id, league_id=league_id, season=season,
        home_team_id=1, away_team_id=2, home_team_name="H", away_team_name="A",
        kickoff=kickoff, status=status, fetched_at=timezone.now(), source_payload={},
    )


@override_settings(**ADMIN_SETTINGS)
class AdminPermissionTests(TestCase):
    """Administrative permission is separate from membership and screened server-side."""

    def test_ordinary_member_is_refused_by_every_admin_endpoint(self):
        member = make_user("member-1")
        client = authenticate(member)
        # `/admin/status/` is intentionally readable by any signed-in user so the
        # UI can decide whether to render the section. It is not an admin action
        # and exposes nothing privileged.
        status = client.get("/api/v1/admin/status/")
        self.assertEqual(status.status_code, 200)
        self.assertFalse(status.json()["isAdmin"])

        # Every endpoint that reads coverage or drives work must refuse a member.
        for path in [
            "/api/v1/admin/coverage/",
            "/api/v1/admin/jobs/",
        ]:
            with self.subTest(path=path):
                self.assertIn(client.get(path).status_code, (401, 403))
        # A write path must be refused too, not merely hidden.
        refused = client.post(
            "/api/v1/admin/runs/",
            {"kind": "generate", "leagues": [39]},
            content_type="application/json",
        )
        self.assertIn(refused.status_code, (401, 403))

    def test_anonymous_is_refused(self):
        self.assertIn(APIClient().get("/api/v1/admin/coverage/").status_code, (401, 403))

    def test_inactive_staff_is_refused(self):
        user = make_user("staff-inactive", is_staff=True)
        user.is_active = False
        user.save()
        client = authenticate(user)
        self.assertIn(client.get("/api/v1/admin/coverage/").status_code, (401, 403))

    def test_admin_status_reports_admin_and_membership_separately(self):
        admin = make_admin()
        client = authenticate(admin)
        response = client.get("/api/v1/admin/status/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["isAdmin"])
        # Staff bypass entitlement by design, so an admin IS reported as having
        # access. The important property is that the two flags are reported
        # independently rather than one being derived from the other.
        self.assertIn("isMember", body)
        self.assertIn("isAdmin", body)
        self.assertEqual(body["configuredLeagues"], [39, 78, 140])

    def test_staff_may_read_coverage(self):
        admin = make_admin()
        client = authenticate(admin)
        self.assertEqual(client.get("/api/v1/admin/coverage/").status_code, 200)


@override_settings(**ADMIN_SETTINGS)
class RequestRunTests(TestCase):
    """A run is recorded before dispatch and carries full audit context."""

    def setUp(self):
        self.admin = make_admin()
        self.today = timezone.localdate()

    def test_run_is_recorded_as_queued_with_audit_fields(self):
        run = request_run(kind=AdminJobKind.GENERATE, target_date=self.today,
                          leagues=[39, 140], actor=self.admin)
        job = AdminJob.objects.get(pk=run.job_id)
        self.assertEqual(job.status, AdminJobStatus.QUEUED)
        self.assertEqual(job.trigger, "admin")
        self.assertEqual(job.requested_by_id, self.admin.pk)
        self.assertEqual(job.leagues, [39, 140])
        self.assertEqual(job.target_date, self.today)
        self.assertIsNone(job.started_at)

    def test_empty_league_selection_is_refused(self):
        # An empty filter is ambiguous between "all" and "none"; guessing would
        # silently widen the run.
        with self.assertRaises(AdminRunError):
            request_run(kind=AdminJobKind.GENERATE, target_date=self.today, leagues=[], actor=self.admin)

    def test_unconfigured_league_is_refused(self):
        with self.assertRaises(AdminRunError) as ctx:
            request_run(kind=AdminJobKind.GENERATE, target_date=self.today, leagues=[999], actor=self.admin)
        self.assertIn("not configured", str(ctx.exception))

    def test_non_numeric_leagues_are_refused(self):
        with self.assertRaises(AdminRunError):
            _validate_leagues(["premier-league"], allowed=[39])

    def test_unknown_kind_is_refused(self):
        with self.assertRaises(AdminRunError):
            request_run(kind="delete_everything", target_date=self.today, leagues=[39], actor=self.admin)

    def test_out_of_range_season_is_refused(self):
        with self.assertRaises(AdminRunError):
            request_run(kind=AdminJobKind.GENERATE, target_date=self.today,
                        leagues=[39], actor=self.admin, season=1200)

    def test_dispatch_happens_after_commit_not_during_request(self):
        calls = []
        with patch("api.admin_runs._dispatch", side_effect=lambda pk: calls.append(pk)):
            with self.captureOnCommitCallbacks(execute=True):
                run = request_run(kind=AdminJobKind.GENERATE, target_date=self.today,
                                  leagues=[39], actor=self.admin)
            # The row exists before dispatch ran.
            self.assertTrue(AdminJob.objects.filter(pk=run.job_id).exists())
        self.assertEqual(calls, [run.job_id])


@override_settings(**ADMIN_SETTINGS)
class CoverageTests(TestCase):
    """Coverage must distinguish "not generated" from "no eligible fixtures"."""

    def setUp(self):
        self.today = timezone.localdate()
        self.future = timezone.now() + timedelta(hours=6)

    def test_leagues_with_no_fixtures_are_no_eligible_fixtures_not_not_generated(self):
        report = build_coverage(target_date=self.today)
        statuses = {row.league_id: row.status for row in report.leagues}
        # All three configured leagues have nothing to do, which is different
        # from having work outstanding.
        self.assertEqual(statuses[39], CoverageStatus.NO_ELIGIBLE_FIXTURES)
        self.assertEqual(report.eligible_leagues, 0)
        self.assertEqual(report.published_leagues, 0)

    def test_eligible_fixture_without_prediction_is_not_generated(self):
        make_fixture(1001, self.future)
        report = build_coverage(target_date=self.today)
        row = next(r for r in report.leagues if r.league_id == 39)
        self.assertEqual(row.eligible_fixtures, 1)
        self.assertEqual(row.predictions, 0)
        self.assertEqual(row.status, CoverageStatus.NOT_GENERATED)
        self.assertEqual(report.eligible_leagues, 1)

    def test_published_list_marks_league_published(self):
        fixture = make_fixture(1002, self.future)
        Prediction.objects.create(
            fixture=fixture, engine_version="e", input_hash="i", config_hash="c",
            generated_at=timezone.now(), as_of=timezone.now(),
            inputs={}, output={}, provenance={}, configuration={},
        )
        OfficialDailyList.objects.create(
            business_date=self.today, published_at=timezone.now(),
            leagues=[39], engine_version="e", config_hash="c", status="pending",
        )
        report = build_coverage(target_date=self.today)
        row = next(r for r in report.leagues if r.league_id == 39)
        self.assertEqual(row.status, CoverageStatus.PUBLISHED)
        self.assertEqual(report.published_leagues, 1)
        self.assertIn("1 of 1 eligible leagues published", report.as_dict()["summary"]["label"])

    def test_failed_job_keeps_previous_version_visible(self):
        make_fixture(1003, self.future)
        OfficialDailyList.objects.create(
            business_date=self.today, published_at=timezone.now(),
            leagues=[39], engine_version="e", config_hash="c", status="pending",
        )
        AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.FAILED,
            target_date=self.today, season=self.today.year, leagues=[39],
            trigger="admin", error_code="ProviderError",
        )
        report = build_coverage(target_date=self.today)
        row = next(r for r in report.leagues if r.league_id == 39)
        self.assertEqual(row.status, CoverageStatus.FAILED)
        self.assertEqual(row.error, "ProviderError")
        # A failed run must not imply the previously published version vanished.
        self.assertTrue(row.previous_version_available)

    def test_queued_job_reports_queued(self):
        make_fixture(1004, self.future)
        AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.QUEUED,
            target_date=self.today, season=self.today.year, leagues=[78], trigger="admin",
        )
        report = build_coverage(target_date=self.today)
        row = next(r for r in report.leagues if r.league_id == 78)
        self.assertEqual(row.status, CoverageStatus.QUEUED)

    def test_league_filter_narrows_the_report_without_changing_the_run(self):
        make_fixture(1005, self.future, league_id=39)
        make_fixture(1006, self.future, league_id=140)
        report = build_coverage(target_date=self.today, leagues=[39])
        self.assertEqual([row.league_id for row in report.leagues], [39])

    def test_configured_leagues_are_read_from_settings(self):
        self.assertEqual(configured_leagues(), [39, 78, 140])

    def test_no_hardcoded_season_year(self):
        # Season must follow the target date, not a literal.
        report = build_coverage(target_date=date(2031, 5, 1))
        self.assertEqual(report.season, 2031)


@override_settings(**ADMIN_SETTINGS)
class RunEndpointTests(TestCase):
    """The endpoint returns immediately with a queued job, never blocking."""

    def setUp(self):
        self.admin = make_admin("admin-endpoint")
        self.today = timezone.localdate()

    def test_post_returns_accepted_with_job_id(self):
        with patch("api.admin_runs._dispatch"):
            response = authenticate(self.admin).post(
                "/api/v1/admin/runs/",
                {"kind": "generate", "date": self.today.isoformat(), "leagues": [39]},
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 202)
        body = response.json()
        self.assertEqual(body["status"], AdminJobStatus.QUEUED)
        self.assertTrue(AdminJob.objects.filter(pk=body["jobId"]).exists())

    def test_invalid_league_returns_400_not_500(self):
        response = authenticate(self.admin).post(
            "/api/v1/admin/runs/",
            {"kind": "generate", "date": self.today.isoformat(), "leagues": [999]},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("not configured", response.json()["detail"])

    def test_job_detail_reports_terminal_state(self):
        job = AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.COMPLETED,
            target_date=self.today, season=self.today.year, leagues=[39], trigger="admin",
        )
        response = authenticate(self.admin).get(f"/api/v1/admin/jobs/{job.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["isTerminal"])

    def test_missing_job_returns_404(self):
        self.assertEqual(authenticate(self.admin).get("/api/v1/admin/jobs/999999/").status_code, 404)


class WorkerTests(TestCase):
    """The worker drains queued jobs and never dies on a single failure."""

    @override_settings(ALLOWED_HOSTS=["testserver"], PREDICTXI_LEAGUES=["39"],
                       PREDICTXI_INGESTION_ENABLED=True)
    def test_worker_marks_unhandled_failure_and_continues(self):
        from api.management.commands.run_admin_jobs import Command

        job = AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.QUEUED,
            target_date=timezone.localdate(), season=timezone.localdate().year,
            leagues=[39], trigger="admin",
        )
        with patch("api.management.commands.run_admin_jobs.run_job", side_effect=RuntimeError("boom")):
            with patch("api.management.commands.run_admin_jobs.mark_running"):
                processed = Command()._pass()

        self.assertEqual(processed, 1)
        job.refresh_from_db()
        self.assertEqual(job.status, AdminJobStatus.FAILED)
        self.assertIn("RuntimeError", job.error_code)

    @override_settings(ALLOWED_HOSTS=["testserver"], PREDICTXI_LEAGUES=["39"],
                       PREDICTXI_INGESTION_ENABLED=False)
    def test_disabled_pipeline_fails_the_job_rather_than_working_silently(self):
        from api.admin_runs import run_job

        job = AdminJob.objects.create(
            kind=AdminJobKind.GENERATE, status=AdminJobStatus.RUNNING,
            target_date=timezone.localdate(), season=timezone.localdate().year,
            leagues=[39], trigger="admin",
        )
        run_job(job)
        job.refresh_from_db()
        self.assertEqual(job.status, AdminJobStatus.FAILED)
        self.assertIn("disabled", job.error_code)