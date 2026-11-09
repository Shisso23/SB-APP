"""Cron-driven scheduling for the prediction workflow.

Design decisions, and why:

**One dispatcher, schedules in Django.** Cron entries are intentionally trivial: a
single frequent tick calls `run_schedule --due`. The *due* decision is made here
from `PREDICTXI_SCHEDULE_*` settings, so there is exactly one place a schedule is
defined. Maintaining times in both crontab and Django would create two sources of
truth that can silently disagree.

**No Celery.** Cron invokes management commands that call the same orchestration
service the admin UI uses (`api.admin_runs`). Nothing here needs a broker, a
worker, or a task id.

**Timezone.** Due times are compared in the configured business timezone
(`Africa/Johannesburg` by default), NOT the host's local time. Because the
comparison happens in Python rather than in crontab, this works even where the
host does not support `CRON_TZ`.

**Attribution.** A scheduled run is recorded with `trigger="scheduled"`, a stable
`schedule_id`, and `execution_mechanism` naming the mechanism. `initiated_by` is
deliberately absent: no admin requested it, and cron must never need an admin
credential.

**Disabled by default.** `PREDICTXI_AUTOMATION_ENABLED` defaults to `False`, so
merely installing the cron entry changes nothing until an operator opts in.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time as dtime, timedelta, timezone as dt_timezone

from django.conf import settings
from django.utils import timezone

from api.admin_coverage import batch_leagues, configured_leagues
from api.admin_runs import AdminRunError, request_run
from api.business_time import business_date, business_timezone
from api.models import AdminJob, AdminJobKind, AdminJobStatus

logger = logging.getLogger(__name__)

#: Stable schedule identifiers. These appear in run records, so renaming one
#: changes what an audit trail means.
SCHEDULE_DAILY_GENERATE = "daily-generate"
SCHEDULE_PRE_KICKOFF_REFRESH = "pre-kickoff-refresh"


class AutomationDisabled(Exception):
    """Automation is switched off; a scheduled command must do nothing."""


@dataclass(frozen=True)
class ScheduleWindow:
    """How long after its due time a schedule may still be considered due.

    This is what makes a frequent cron tick safe: a tick that arrives late (host
    suspended, previous run overran) still fires the day's work exactly once,
    because `is_due` is paired with the per-(kind, date) uniqueness guard.
    """

    due_at: datetime
    window: timedelta

    def contains(self, now: datetime) -> bool:
        return self.due_at <= now < self.due_at + self.window


def automation_enabled() -> bool:
    """Automation is OFF unless explicitly switched on in deployment config."""
    return bool(getattr(settings, "PREDICTXI_AUTOMATION_ENABLED", False))


def require_automation_enabled() -> None:
    if not automation_enabled():
        raise AutomationDisabled(
            "Automation is disabled (PREDICTXI_AUTOMATION_ENABLED is not True)."
        )


def _parse_time(value: str, *, setting_name: str) -> dtime:
    try:
        hour, minute = (int(part) for part in str(value).split(":", 1))
    except (TypeError, ValueError):
        raise AutomationDisabled(f"{setting_name} must look like HH:MM.") from None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise AutomationDisabled(f"{setting_name} must be a valid time of day.")
    return dtime(hour, minute)


def daily_generation_time() -> dtime:
    return _parse_time(
        getattr(settings, "PREDICTXI_SCHEDULE_DAILY_TIME", "05:00"),
        setting_name="PREDICTXI_SCHEDULE_DAILY_TIME",
    )


def pre_kickoff_refresh_time() -> dtime | None:
    """Optional second daily refresh, or None when not configured."""
    raw = getattr(settings, "PREDICTXI_SCHEDULE_REFRESH_TIME", "") or ""
    if not str(raw).strip():
        return None
    return _parse_time(raw, setting_name="PREDICTXI_SCHEDULE_REFRESH_TIME")


def schedule_window() -> timedelta:
    """How late a scheduled run may still fire (default 6 hours)."""
    hours = float(getattr(settings, "PREDICTXI_SCHEDULE_WINDOW_HOURS", 6))
    if hours <= 0:
        raise AutomationDisabled("PREDICTXI_SCHEDULE_WINDOW_HOURS must be positive.")
    return timedelta(hours=hours)


def window_for(target_date: date, at: dtime) -> ScheduleWindow:
    """The due window for `at` on `target_date`, expressed in the business tz.

    The window is derived purely from the date and the configured time, so it is
    deterministic and directly testable.
    """
    tz = business_timezone()
    local = datetime.combine(target_date, at, tzinfo=tz)
    return ScheduleWindow(due_at=local.astimezone(dt_timezone.utc), window=schedule_window())


def scheduled_leagues() -> list[int]:
    """Leagues automation may touch. Falls back to the configured set."""
    return configured_leagues()


@dataclass
class ScheduleOutcome:
    ran: bool
    reason: str = ""
    jobs: list[int] = field(default_factory=list)


def run_daily_generation(*, now: datetime | None = None, force: bool = False) -> ScheduleOutcome:
    """Queue generation for today's business date, covering all configured leagues.

    ONE run per (kind, business date), not one per batch. This matters:

    * The concurrency guard established in Phase 2 is keyed on
      `(kind, target_date)`, so a single run is what makes duplicate cron ticks
      harmless. Emitting one run per batch would either bypass that guard or fight
      it, and two runs for the same date could race and publish over each other.
    * Batching is therefore applied *inside* the run (see `run_job`), which bounds
      provider work per pass while keeping a single, attributable daily record.

    Idempotent: a second invocation on the same day is refused as already
    queued/running, which is a normal outcome for a frequent cron tick.
    """
    now = now or timezone.now()
    require_automation_enabled()

    today = business_date(now)
    if not force:
        window = window_for(today, daily_generation_time())
        if not window.contains(now):
            return ScheduleOutcome(False, reason="Outside the configured daily window.")

    leagues = scheduled_leagues()
    if not leagues:
        return ScheduleOutcome(False, reason="No leagues are configured.")

    try:
        run = request_run(
            kind=AdminJobKind.GENERATE,
            target_date=today,
            leagues=leagues,
            actor=None,
            trigger="scheduled",
            schedule_id=SCHEDULE_DAILY_GENERATE,
            execution_mechanism="cron",
        )
    except AdminRunError as error:
        # Already queued/running for this date: expected on a repeated tick.
        logger.info("Scheduled generation skipped: %s", error)
        return ScheduleOutcome(False, reason="Already queued or running for today.")

    return ScheduleOutcome(True, jobs=[run.job_id])


def run_pre_kickoff_refresh(*, now: datetime | None = None, force: bool = False) -> ScheduleOutcome:
    """Queue a refresh, preserving the last successful publication on failure."""
    now = now or timezone.now()
    require_automation_enabled()

    at = pre_kickoff_refresh_time()
    if at is None and not force:
        return ScheduleOutcome(False, reason="No refresh time is configured.")

    today = business_date(now)
    if not force and at is not None:
        window = window_for(today, at)
        if not window.contains(now):
            return ScheduleOutcome(False, reason="Outside the configured refresh window.")

    leagues = scheduled_leagues()
    if not leagues:
        return ScheduleOutcome(False, reason="No leagues are configured.")

    try:
        run = request_run(
            kind=AdminJobKind.REFRESH,
            target_date=today,
            leagues=leagues,
            actor=None,
            trigger="scheduled",
            schedule_id=SCHEDULE_PRE_KICKOFF_REFRESH,
            execution_mechanism="cron",
        )
    except AdminRunError as error:
        logger.info("Scheduled refresh skipped: %s", error)
        return ScheduleOutcome(False, reason="Already queued or running for today.")

    return ScheduleOutcome(True, jobs=[run.job_id])


def recover_stale_jobs(*, now: datetime | None = None) -> int:
    """Mark long-RUNNING jobs as failed so a killed process cannot wedge the queue.

    A crash mid-run leaves a job in RUNNING forever, which would block new runs of
    the same kind and date via the concurrency guard. Recovery is safe because a
    failed refresh never removes already-published forecasts.
    """
    now = now or timezone.now()
    limit = timedelta(hours=float(getattr(settings, "PREDICTXI_STALE_JOB_HOURS", 3)))
    cutoff = now - limit
    stale = AdminJob.objects.filter(
        status=AdminJobStatus.RUNNING, started_at__lt=cutoff,
    )
    count = 0
    for job in stale:
        AdminJob.objects.filter(pk=job.pk).update(
            status=AdminJobStatus.FAILED,
            finished_at=now,
            error_code="Interrupted: run exceeded the stale-job window.",
        )
        count += 1
    if count:
        logger.warning("Recovered %s stale admin job(s).", count)
    return count


def resume_interrupted(*, now: datetime | None = None) -> ScheduleOutcome:
    """Re-queue work that was interrupted, without duplicating successes.

    Completed scopes are never re-queued, so a resume cannot publish the same work
    twice. Only the interrupted job's own leagues are retried.
    """
    now = now or timezone.now()
    require_automation_enabled()
    recovered = recover_stale_jobs(now=now)
    if not recovered:
        return ScheduleOutcome(False, reason="Nothing to resume.")

    requeued: list[int] = []
    today = business_date(now)
    for job in AdminJob.objects.filter(
        kind=AdminJobKind.GENERATE, target_date=today, status=AdminJobStatus.FAILED,
    ).order_by("-created_at")[:1]:
        try:
            run = request_run(
                kind=job.kind, target_date=job.target_date, leagues=job.leagues,
                actor=None, trigger="scheduled", schedule_id="resume-interrupted",
                execution_mechanism="cron",
            )
            requeued.append(run.job_id)
        except AdminRunError as error:
            logger.info("Resume skipped: %s", error)
    return ScheduleOutcome(bool(requeued), jobs=requeued)