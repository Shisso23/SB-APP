"""Administrative API for the prediction workflow.

Every view here is gated by `IsAdmin`, which is a **server-side Django staff**
check and entirely separate from membership. Hiding navigation in the frontend is
not the control: an ordinary authenticated user calling these endpoints directly
receives 403, and an unauthenticated caller receives 401.

These endpoints orchestrate. They do not compute predictions, rebuild betlists, or
alter thresholds — see `api/admin_runs.py` and `api/admin_coverage.py`.
"""

from __future__ import annotations

from datetime import date

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.admin_coverage import configured_leagues, build_coverage, league_freshness
from api.admin_runs import AdminRunError, request_run
from api.models import AdminJob, AdminJobKind, AdminJobStatus
from api.permissions import IsAdmin, has_prediction_access


def _parse_date(value, *, default=None):
    if not value:
        return default
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValueError("Dates must be YYYY-MM-DD.") from None


def _parse_leagues(value):
    """Accept `?leagues=39,140` or a JSON list body."""
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return list(value)
    return [part for part in str(value).split(",") if part.strip()]


class AdminStatusView(APIView):
    """Tells the frontend whether to render the Admin section.

    This is a convenience for the UI, not a security boundary: every
    administrative endpoint independently enforces `IsAdmin`.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        admin = bool(
            (
                getattr(request.user, "is_staff", False)
                or getattr(request.user, "is_superuser", False)
            )
            and getattr(request.user, "is_active", False)
        )
        return Response({
            "isAdmin": admin,
            # Membership is reported separately, from the entitlement truth, so the
            # UI can never imply that paying makes someone an admin (or vice versa).
            "isMember": has_prediction_access(request.user),
            "configuredLeagues": configured_leagues() if admin else [],
        })


class AdminCoverageView(APIView):
    """Per-league coverage for a date, including the "N of M published" line."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        try:
            target = _parse_date(request.query_params.get("date"), default=timezone.localdate())
        except ValueError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        try:
            leagues = _parse_leagues(request.query_params.get("leagues"))
        except ValueError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        report = build_coverage(target_date=target, leagues=leagues)
        payload = report.as_dict()
        payload["requestedLeagues"] = leagues if leagues is not None else configured_leagues()
        # Read-only freshness so the browse UI can show unpublished/stale/empty
        # states without any customer request touching the engine or provider.
        payload["freshness"] = {
            str(league_id): value
            for league_id, value in league_freshness(
                season=report.season, leagues=payload["requestedLeagues"]
            ).items()
        }
        return Response(payload)


class AdminRunView(APIView):
    """Request a generation/refresh/publication run.

    The job row is committed before dispatch and the response returns immediately
    with QUEUED, so the client polls status rather than holding the request open.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        kind = str(request.data.get("kind") or AdminJobKind.GENERATE)
        try:
            target = _parse_date(request.data.get("date"), default=timezone.localdate())
        except ValueError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            leagues = _parse_leagues(request.data.get("leagues"))
        except ValueError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        season = request.data.get("season")
        try:
            season_value = int(season) if season not in (None, "") else None
        except (TypeError, ValueError):
            return Response({"detail": "Season must be a number."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            run = request_run(
                kind=kind, target_date=target, leagues=leagues,
                actor=request.user, season=season_value,
            )
        except AdminRunError as error:
            # A refusal is a client error with an actionable message, never a 500.
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "jobId": run.job_id,
                "kind": run.kind,
                "targetDate": run.target_date.isoformat(),
                "season": run.season,
                "leagues": run.leagues,
                "status": run.status,
            },
            status=status.HTTP_202_ACCEPTED,
        )


class AdminJobListView(APIView):
    """Recent runs, so the UI can show queued/running/completed/failed."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        try:
            limit = min(100, max(1, int(request.query_params.get("limit", 25))))
        except (TypeError, ValueError):
            limit = 25

        queryset = AdminJob.objects.all()
        target = request.query_params.get("date")
        if target:
            try:
                queryset = queryset.filter(target_date=_parse_date(target))
            except ValueError as error:
                return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "jobs": [
                {
                    "jobId": job.pk,
                    "kind": job.kind,
                    "status": job.status,
                    "targetDate": job.target_date.isoformat(),
                    "season": job.season,
                    "leagues": job.leagues,
                    "trigger": job.trigger,
                    # Present for scheduled runs, empty for a manual admin run.
                    "scheduleId": job.schedule_id,
                    "executionMechanism": job.execution_mechanism,
                    "requestedBy": job.requested_by_label,
                    "createdAt": job.created_at.isoformat(),
                    "startedAt": job.started_at.isoformat() if job.started_at else None,
                    "finishedAt": job.finished_at.isoformat() if job.finished_at else None,
                    "error": job.error_code,
                    "summary": job.summary,
                    "leagueResults": job.league_results,
                }
                for job in queryset[:limit]
            ]
        })


class AdminJobDetailView(APIView):
    """Status of one run, polled by the UI while work is in progress."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, job_id: int):
        job = AdminJob.objects.filter(pk=job_id).first()
        if job is None:
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "jobId": job.pk,
            "kind": job.kind,
            "status": job.status,
            "targetDate": job.target_date.isoformat(),
            "season": job.season,
            "leagues": job.leagues,
            "trigger": job.trigger,
            "scheduleId": job.schedule_id,
            "executionMechanism": job.execution_mechanism,
            "requestedBy": job.requested_by_label,
            "createdAt": job.created_at.isoformat(),
            "startedAt": job.started_at.isoformat() if job.started_at else None,
            "finishedAt": job.finished_at.isoformat() if job.finished_at else None,
            "error": job.error_code,
            "summary": job.summary,
            "leagueResults": job.league_results,
            "isTerminal": job.status in {
                AdminJobStatus.COMPLETED, AdminJobStatus.FAILED, AdminJobStatus.CANCELLED,
            },
        })