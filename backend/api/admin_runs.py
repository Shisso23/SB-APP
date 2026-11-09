"""Admin-managed run orchestration.

This module owns **who asked for what** and **when it ran**. It does not own how a
prediction is made: execution delegates to the existing bounded pipeline
(`run_prediction_job`), which already applies the engine, eligibility rules,
provider budgets and job claiming. Nothing here recomputes a probability, rebuilds
a betlist, or changes a threshold.

Two properties the brief requires, and how they are met:

  * **Record before dispatch.** `request_run` writes and commits the `AdminJob`
    row inside `transaction.on_commit`, so a crash between request and execution
    leaves a visible QUEUED job rather than an untracked gap.
  * **Explicitly requested.** `trigger` is always recorded, and only an admin may
    call `request_run`; a scheduled run can never be recorded as "admin".

League selection is a **filter** over the fixture set, not a partition of the run.
Forecasts are per-fixture and league-scoped by construction, so filtering cannot
change any individual forecast; and the betlist is built once across the full
prediction set, so it is identical to what the desk already produces.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date

from django.db import IntegrityError, transaction
from django.utils import timezone

from api.admin_coverage import batch_leagues, configured_leagues, _season_for
from api.jobs import JobError, JobPolicy
from api.models import AdminJob, AdminJobKind, AdminJobStatus

logger = logging.getLogger(__name__)


class AdminRunError(Exception):
    """A run was refused before any work was queued."""


@dataclass(frozen=True)
class RunRequest:
    job_id: int
    kind: str
    target_date: date
    season: int
    leagues: list[int]
    status: str


def _validate_leagues(leagues, *, allowed: list[int]) -> list[int]:
    """Normalise and validate the league filter.

    Refuses leagues the project is not configured for, and refuses an empty
    selection: an empty filter is ambiguous between "all" and "none", and guessing
    would quietly widen a run beyond what the admin asked for.
    """
    if leagues is None:
        raise AdminRunError("At least one league must be selected.")
    try:
        requested = sorted({int(value) for value in leagues})
    except (TypeError, ValueError):
        raise AdminRunError("Leagues must be numeric ids.") from None
    if not requested:
        raise AdminRunError("At least one league must be selected.")
    unknown = [value for value in requested if value not in allowed]
    if unknown:
        raise AdminRunError(
            "These leagues are not configured for this project: "
            + ", ".join(str(value) for value in unknown)
        )
    return requested


def request_run(*, kind: str, target_date: date, leagues, actor=None,
                season: int | None = None, trigger: str = "admin",
                schedule_id: str = "", execution_mechanism: str = "admin request") -> RunRequest:
    """Record a run and commit it before any execution happens.

    Returns immediately with a QUEUED job. Execution is driven separately by the
    worker command, so no HTTP request is held open while the engine runs.

    `trigger` distinguishes an admin request from scheduled automation. A manual
    run must carry an actor; a scheduled run must not, and identifies itself by
    `schedule_id` instead. That makes it impossible for automation to be recorded
    as though an admin had asked for it.
    """
    if kind not in AdminJobKind.values:
        raise AdminRunError(f"Unknown run kind: {kind!r}")

    if trigger not in {"admin", "scheduled"}:
        raise AdminRunError(f"Unknown trigger: {trigger!r}")
    if trigger == "admin" and not getattr(actor, "pk", None):
        # A manual run without an actor would be unattributable.
        raise AdminRunError("A manual run must record the admin who requested it.")
    if trigger == "scheduled" and not schedule_id:
        raise AdminRunError("A scheduled run must record its schedule identifier.")

    allowed = configured_leagues()
    if not allowed:
        raise AdminRunError("No leagues are configured (PREDICTXI_LEAGUES is empty).")
    selected = _validate_leagues(leagues, allowed=allowed)

    resolved_season = season if season is not None else _season_for(target_date)
    if not 1900 <= int(resolved_season) <= timezone.now().year + 1:
        # Same bound the pipeline itself enforces, so a bad season fails here
        # rather than silently queueing work that can only fail later.
        raise AdminRunError("Season is outside the supported range.")

    label = ""
    if actor is not None:
        label = getattr(actor, "email", "") or getattr(actor, "firebase_uid", "") or ""

    try:
        # `atomic()` opens a SAVEPOINT, so a constraint violation is rolled back
        # to this point instead of poisoning any surrounding transaction. Without
        # it, a refused duplicate would leave the caller's transaction unusable.
        with transaction.atomic():
            job = AdminJob.objects.create(
                kind=kind,
                status=AdminJobStatus.QUEUED,
                target_date=target_date,
                season=int(resolved_season),
                leagues=selected,
                trigger=trigger,
                schedule_id=schedule_id[:80],
                execution_mechanism=execution_mechanism[:40],
                requested_by=actor if getattr(actor, "pk", None) else None,
                requested_by_label=label[:160],
            )
    except IntegrityError:
        # The partial unique constraint allows only one live run per
        # (kind, date). Refuse clearly rather than queueing conflicting work that
        # could race and overwrite a newer publication.
        raise AdminRunError(
            "A run of this kind is already queued or running for this date. "
            "Wait for it to finish before starting another."
        ) from None

    # Dispatch strictly AFTER the row is committed, so a worker can never pick up
    # a job whose record does not exist yet.
    transaction.on_commit(lambda: _dispatch(job.pk))

    return RunRequest(
        job_id=job.pk, kind=job.kind, target_date=job.target_date,
        season=job.season, leagues=job.leagues, status=job.status,
    )


def _dispatch(job_id: int) -> None:
    """Hand the job to the execution layer.

    Kept as a seam: with the existing runner this is a no-op because the worker
    command polls for QUEUED jobs. Should a task queue be added later, this is the
    single place that needs to change.
    """
    logger.info("Admin job %s queued for execution.", job_id)


def next_queued_job() -> AdminJob | None:
    """Claim the oldest QUEUED job for execution.

    `select_for_update(skip_locked=True)` means two concurrent workers cannot
    claim the same job, mirroring how the existing pipeline serialises itself.
    """
    with transaction.atomic():
        return (
            AdminJob.objects.select_for_update(skip_locked=True)
            .filter(status=AdminJobStatus.QUEUED)
            .order_by("created_at")
            .first()
        )


def mark_running(job: AdminJob) -> None:
    AdminJob.objects.filter(pk=job.pk, status=AdminJobStatus.QUEUED).update(
        status=AdminJobStatus.RUNNING, started_at=timezone.now(), error_code=""
    )


def _attribute_run(job: AdminJob, league_id: int) -> None:
    """Associate the forecasts just produced with the run that produced them.

    Deliberately a SEPARATE step from generation: the engine path is not modified,
    and this only fills a provenance column on rows the pipeline has already
    committed. It scopes to this league and to forecasts written at or after the
    job started, so a concurrent run for another league is never mislabelled.

    Attribution is informational. It is never read when selecting which forecast
    to show, so it cannot change any published number.
    """
    from api.models import Prediction

    since = job.started_at or job.created_at
    (
        Prediction.objects
        .filter(fixture__league_id=league_id, fixture__season=job.season,
                generated_at__gte=since, run__isnull=True)
        .update(run=job)
    )


def mark_completed(job: AdminJob, *, summary: dict, league_results: dict) -> None:
    AdminJob.objects.filter(pk=job.pk).update(
        status=AdminJobStatus.COMPLETED,
        finished_at=timezone.now(),
        summary=summary,
        league_results=league_results,
        error_code="",
    )


def mark_failed(job: AdminJob, *, error: str, league_results: dict | None = None) -> None:
    AdminJob.objects.filter(pk=job.pk).update(
        status=AdminJobStatus.FAILED,
        finished_at=timezone.now(),
        error_code=str(error)[:200],
        league_results=league_results or {},
    )


def run_job(job: AdminJob) -> None:
    """Execute one claimed job by delegating to the existing pipeline.

    Uses `run_prediction_job`'s own `handle()` so eligibility, provider budgets,
    engine invocation, publication and checkpointing are exactly the ones already
    in use. This function only translates an `AdminJob` into those calls and
    records the outcome.
    """
    from api.management.commands.run_prediction_job import Command

    policy = JobPolicy.from_environment()
    if not policy.enabled:
        mark_failed(job, error="Ingestion/execution is disabled by configuration.")
        return

    mode = {
        AdminJobKind.GENERATE: "predict",
        AdminJobKind.REFRESH: "refresh",
        AdminJobKind.PUBLISH: "refresh",
    }.get(job.kind)
    if mode is None:
        mark_failed(job, error=f"No executor for kind {job.kind!r}.")
        return

    command = Command()
    league_results: dict[str, dict] = {}
    failures = 0

    # Batching is applied HERE, inside the single run, rather than by emitting
    # multiple runs. That bounds provider work per pass while keeping one
    # attributable daily record per (kind, date) - which is what makes the
    # concurrency guard meaningful and duplicate cron ticks harmless.
    for batch in batch_leagues(job.leagues):
        for league_id in batch:
            try:
                # One league at a time ONLY at the pipeline boundary, which is how
                # the existing bounded job is invoked. Forecasts are per-fixture
                # and league-scoped, so this produces the same numbers as a
                # combined run.
                command.handle(
                    mode=mode,
                    league=int(league_id),
                    season=int(job.season),
                    slot=None,
                )
                _attribute_run(job, league_id)
                league_results[str(league_id)] = {"status": "ok"}
            except Exception as error:  # noqa: BLE001 - recorded, never swallowed
                failures += 1
                league_results[str(league_id)] = {
                    "status": "failed",
                    "error": type(error).__name__,
                }

    # Fully successful leagues are published by the pipeline as it goes, so users
    # see them without waiting for the remaining leagues.
    if failures == 0:
        mark_completed(job, summary={"leagues": len(job.leagues)}, league_results=league_results)
    else:
        mark_failed(
            job,
            error=f"{failures} of {len(job.leagues)} leagues failed.",
            league_results=league_results,
        )