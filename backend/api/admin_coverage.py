"""League coverage reporting for the admin workflow.

This module is **read-only orchestration and presentation**. It answers "what is
the state of each configured league for a given date?" by querying existing rows
(`Fixture`, `Prediction`, `OfficialDailyList`, `AdminJob`). It never generates a
prediction, never re-scores a market, and never builds a betlist — those stay
entirely with the existing engine path.

Eligibility is *reused*, not redefined: the same predicate the pipeline applies in
`run_prediction_job` (`status in {NS, TBD}` and a future kickoff) is used here, so
a fixture counted as eligible really is one the engine would consider.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone

from api.business_time import business_day_bounds
from api.models import (
    AdminJob,
    AdminJobKind,
    AdminJobStatus,
    Fixture,
    OfficialDailyList,
    Prediction,
)

#: Fixture statuses the pipeline treats as actionable pre-match.
ELIGIBLE_STATUSES = ("NS", "TBD")


class CoverageStatus:
    """Per-league state for the selected date.

    `NOT_GENERATED` and `NO_ELIGIBLE_FIXTURES` are deliberately distinct: the
    first means an admin still has work to do, the second means there is nothing
    to do. Conflating them would make the dashboard imply missing work.
    """

    NOT_GENERATED = "not_generated"
    QUEUED = "queued"
    RUNNING = "running"
    PUBLISHED = "published"
    REFRESHING = "refreshing"
    FAILED = "failed"
    NO_ELIGIBLE_FIXTURES = "no_eligible_fixtures"


#: Statuses that count as "covered" for the "N of M published" line.
#: A league with no eligible fixtures is explicitly NOT counted as published.
PUBLISHED_STATUSES = {CoverageStatus.PUBLISHED}


@dataclass
class LeagueCoverage:
    league_id: int
    status: str
    eligible_fixtures: int = 0
    predictions: int = 0
    last_published_at: str | None = None
    last_successful_predictions: int = 0
    error: str = ""
    latest_job_id: int | None = None
    # True when an earlier successful publication still exists for this date,
    # so a failed refresh has not removed what users can already see.
    previous_version_available: bool = False


@dataclass
class CoverageReport:
    target_date: date
    season: int
    leagues: list[LeagueCoverage] = field(default_factory=list)
    published_leagues: int = 0
    eligible_leagues: int = 0

    def as_dict(self) -> dict:
        return {
            "targetDate": self.target_date.isoformat(),
            "season": self.season,
            "summary": {
                "publishedLeagues": self.published_leagues,
                "eligibleLeagues": self.eligible_leagues,
                # Matches the required wording: "8 of 12 eligible leagues published."
                "label": f"{self.published_leagues} of {self.eligible_leagues} eligible leagues published",
            },
            "leagues": [
                {
                    "leagueId": row.league_id,
                    "status": row.status,
                    "eligibleFixtures": row.eligible_fixtures,
                    "predictions": row.predictions,
                    "lastPublishedAt": row.last_published_at,
                    "lastSuccessfulPredictions": row.last_successful_predictions,
                    "error": row.error,
                    "latestJobId": row.latest_job_id,
                    "previousVersionAvailable": row.previous_version_available,
                }
                for row in self.leagues
            ],
        }


def configured_leagues() -> list[int]:
    """Leagues the project is configured for, from one source of truth."""
    raw = getattr(settings, "PREDICTXI_LEAGUES", None) or []
    if isinstance(raw, str):
        raw = [part for part in raw.split(",") if part.strip()]
    try:
        return sorted({int(value) for value in raw})
    except (TypeError, ValueError):
        return []


def _season_for(target_date: date) -> int:
    """Season derived from the date, never hardcoded.

    Uses the calendar year of the target date, matching the pipeline's own
    "current season" convention rather than inventing a new rule.
    """
    return target_date.year


def build_coverage(*, target_date: date, season: int | None = None,
                   leagues: list[int] | None = None) -> CoverageReport:
    """Report per-league coverage for `target_date`.

    `leagues` narrows the report; it defaults to every configured league.
    """
    selected = leagues if leagues is not None else configured_leagues()
    season = season if season is not None else _season_for(target_date)
    report = CoverageReport(target_date=target_date, season=season)

    now = timezone.now()
    start, end = business_day_bounds(target_date)

    # One query per aggregate rather than per league, so the dashboard stays
    # cheap regardless of how many leagues are configured.
    eligible_counts = dict(
        Fixture.objects.filter(
            league_id__in=selected,
            season=season,
            status__in=ELIGIBLE_STATUSES,
            kickoff__gt=now,
            kickoff__gte=start,
            kickoff__lt=end,
        )
        .values_list("league_id")
        .annotate(n=Count("id"))
    )

    prediction_counts = dict(
        Prediction.objects.filter(
            fixture__league_id__in=selected,
            fixture__season=season,
            generated_at__gte=start,
            generated_at__lt=end,
        )
        .values_list("fixture__league_id")
        .annotate(n=Count("id"))
    )

    # Latest job per league, so "queued/running/failed" reflects the most recent
    # request rather than any historical one.
    latest_jobs: dict[int, AdminJob] = {}
    for job in AdminJob.objects.filter(target_date=target_date).order_by("-created_at"):
        for league_id in job.leagues or []:
            if league_id in selected and league_id not in latest_jobs:
                latest_jobs[league_id] = job

    published_list = OfficialDailyList.objects.filter(business_date=target_date).first()

    for league_id in selected:
        eligible = int(eligible_counts.get(league_id, 0))
        predictions = int(prediction_counts.get(league_id, 0))
        job = latest_jobs.get(league_id)

        row = LeagueCoverage(
            league_id=league_id,
            status=CoverageStatus.NOT_GENERATED,
            eligible_fixtures=eligible,
            predictions=predictions,
            last_published_at=published_list.published_at.isoformat() if published_list else None,
            last_successful_predictions=predictions,
            latest_job_id=job.pk if job else None,
        )

        # Order matters: an explicit job state is the most current signal, then
        # the absence of eligible fixtures, then whether predictions exist.
        if job and job.status == AdminJobStatus.FAILED:
            row.status = CoverageStatus.FAILED
            row.error = job.error_code
            # A failed run does not remove a previous good publication.
            row.previous_version_available = published_list is not None
        elif job and job.status == AdminJobStatus.QUEUED:
            row.status = CoverageStatus.QUEUED
        elif job and job.status == AdminJobStatus.RUNNING:
            row.status = CoverageStatus.RUNNING
        elif job and job.kind == AdminJobKind.REFRESH and job.status == AdminJobStatus.COMPLETED:
            row.status = CoverageStatus.REFRESHING
        elif eligible == 0:
            # Distinct from "not generated": there is nothing here to generate.
            row.status = CoverageStatus.NO_ELIGIBLE_FIXTURES
        elif predictions > 0 and published_list is not None:
            row.status = CoverageStatus.PUBLISHED
        elif predictions > 0:
            row.status = CoverageStatus.NOT_GENERATED
        else:
            row.status = CoverageStatus.NOT_GENERATED

        report.leagues.append(row)

    report.eligible_leagues = sum(
        1 for row in report.leagues if row.eligible_fixtures > 0
    )
    report.published_leagues = sum(
        1 for row in report.leagues if row.status in PUBLISHED_STATUSES
    )
    return report

def league_freshness(*, season: int, leagues: list[int] | None = None,
                     now=None) -> dict:
    """Last successful generation time per league, for browse-page state.

    This reports **stored** publication state only. It never triggers generation
    or provider access, so a customer page load stays cheap and side-effect free.

    `stale_after_hours` is a presentation threshold (how old a publication may be
    before the UI warns), not a prediction or selection rule: it cannot change any
    forecast or betlist.
    """
    from django.db.models import Max

    from api.models import Prediction

    now = now or timezone.now()
    selected = leagues if leagues is not None else configured_leagues()
    rows = (
        Prediction.objects.filter(fixture__league_id__in=selected, fixture__season=season)
        .values("fixture__league_id")
        .annotate(latest=Max("generated_at"), count=Count("id"))
    )
    seen = {
        row["fixture__league_id"]: (row["latest"], row["count"])
        for row in rows
    }
    threshold_hours = float(getattr(settings, "PREDICTXI_STALE_AFTER_HOURS", 24))

    result = {}
    for league_id in selected:
        latest, count = seen.get(league_id, (None, 0))
        if latest is None:
            state = "empty"
        elif (now - latest).total_seconds() > threshold_hours * 3600:
            state = "stale"
        else:
            state = "current"
        result[league_id] = {
            "lastGeneratedAt": latest.isoformat() if latest else None,
            "predictions": int(count),
            "state": state,
            # Explicit so the UI never implies data exists when it does not.
            "hasPublished": latest is not None,
        }
    return result


def batch_leagues(leagues: list[int], *, size: int | None = None) -> list[list[int]]:
    """Split the configured leagues into fixed-size batches.

    Batching bounds how much work one invocation attempts. It does NOT partition
    what a run means: league selection remains a filter over eligible fixtures, so
    forecasts are identical to an unbounded run. Duplicate ids are removed so a
    misconfigured list cannot cause the same league to be processed twice.
    """
    resolved = size if size is not None else int(getattr(settings, "PREDICTXI_BATCH_SIZE", 4))
    if resolved <= 0:
        # Imported here rather than at module scope: `admin_schedule` imports this
        # module, so a module-level import would be circular.
        from api.admin_schedule import AutomationDisabled

        raise AutomationDisabled("PREDICTXI_BATCH_SIZE must be positive.")
    unique = sorted(set(leagues))
    return [unique[index:index + resolved] for index in range(0, len(unique), resolved)]
