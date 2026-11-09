"""Cron entry point for scheduled generation and refresh.

Cron calls this frequently; the *due* decision is made in Django (see
`api.admin_schedule`), so the crontab holds no schedule times and there is no
second source of truth.

    # every 5 minutes: fire whatever is due
    */5 * * * * cd /srv/sb-app/backend && \\
      /srv/sb-app/backend/.venv/bin/python manage.py run_schedule --due >> /var/log/predictxi-schedule.log 2>&1

Exit codes:

    0  work ran, or nothing was due (both normal)
    1  automation is disabled, or a refusal the operator must fix
    2  an unexpected error was recorded against the run

Safe to run repeatedly: the per-(kind, date) uniqueness guard means a duplicate
tick cannot queue a second run, so a missed or doubled cron tick is harmless.
"""

import logging
import sys

from django.core.management.base import BaseCommand, CommandError

from api.admin_schedule import (
    AutomationDisabled,
    automation_enabled,
    daily_generation_time,
    pre_kickoff_refresh_time,
    recover_stale_jobs,
    resume_interrupted,
    run_daily_generation,
    run_pre_kickoff_refresh,
    schedule_window,
)
from api.business_time import business_date
from django.utils import timezone

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run due scheduled generation/refresh. Cron calls this frequently."

    def add_arguments(self, parser):
        parser.add_argument("--due", action="store_true",
                            help="Run only what is currently due (the cron mode).")
        parser.add_argument("--daily-generate", action="store_true",
                            help="Force the daily generation pass regardless of time.")
        parser.add_argument("--refresh", action="store_true",
                            help="Force the pre-kickoff refresh pass regardless of time.")
        parser.add_argument("--resume", action="store_true",
                            help="Recover stale RUNNING jobs and re-queue interrupted work.")

    def handle(self, *args, **options):
        if not automation_enabled():
            # Not an error in itself, but a cron entry that can never do anything
            # should be visible to the operator, so it is reported clearly.
            self.stdout.write(
                "Automation is disabled (PREDICTXI_AUTOMATION_ENABLED is not True). Nothing to do."
            )
            return

        now = timezone.now()
        self.stdout.write(f"[run_schedule] business date {business_date(now)} (UTC {now.isoformat()})")

        try:
            # Validate the schedule configuration on EVERY invocation, before any
            # work. A typo in a due time is an operator error that must surface
            # immediately rather than being silently skipped until a window
            # happens to be checked.
            daily_generation_time()
            pre_kickoff_refresh_time()
            schedule_window()

            recovered = recover_stale_jobs(now=now)
            if recovered:
                self.stdout.write(f"[run_schedule] recovered {recovered} stale run(s)")

            if options["resume"]:
                outcome = resume_interrupted(now=now)
                self._report("resume", outcome)
                return

            if options["daily_generate"]:
                outcome = run_daily_generation(now=now, force=True)
                self._report("daily-generate", outcome)
                return

            if options["refresh"]:
                outcome = run_pre_kickoff_refresh(now=now, force=True)
                self._report("refresh", outcome)
                return

            # Default (and --due): run whatever is inside its window now.
            generate = run_daily_generation(now=now)
            self._report("daily-generate", generate)
            refresh = run_pre_kickoff_refresh(now=now)
            self._report("refresh", refresh)

        except AutomationDisabled as error:
            # A configuration problem the operator must correct: a distinct exit
            # code makes it visible in cron mail rather than looking like success.
            raise CommandError(str(error)) from None
        except Exception as error:  # noqa: BLE001 - surfaced, never swallowed
            logger.exception("Scheduled run failed")
            self.stderr.write(f"[run_schedule] FAILED: {type(error).__name__}")
            sys.exit(2)

    def _report(self, name: str, outcome) -> None:
        state = "ran" if outcome.ran else "skipped"
        detail = f" jobs={outcome.jobs}" if outcome.jobs else ""
        reason = f" ({outcome.reason})" if outcome.reason else ""
        self.stdout.write(f"[run_schedule] {name}: {state}{detail}{reason}")