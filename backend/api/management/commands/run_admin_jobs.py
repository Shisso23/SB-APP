"""Execute queued admin runs.

This is the worker side of the admin workflow. It polls for QUEUED `AdminJob` rows
and executes them outside any HTTP request, so the admin UI never holds a
connection open while the engine runs.

Run it as a long-lived process alongside the API:

    cd /path/to/SB-APP/backend
    PREDICTXI_INGESTION_ENABLED=True \\
      .venv/bin/python manage.py run_admin_jobs --loop --interval 15

Or as a cron entry (one pass per invocation):

    * * * * * cd /path/to/SB-APP/backend && \\
      .venv/bin/python manage.py run_admin_jobs >> /var/log/predictxi-admin.log 2>&1

Requires the same environment the pipeline already needs:
`PREDICTXI_INGESTION_ENABLED=True` and `PREDICTXI_LEAGUES`, plus the compiled
private runner. No new broker or service is introduced.
"""

import time

from django.core.management.base import BaseCommand

from api.admin_runs import mark_failed, mark_running, next_queued_job, run_job


class Command(BaseCommand):
    help = "Execute queued admin prediction runs. Safe to run repeatedly."

    def add_arguments(self, parser):
        parser.add_argument("--loop", action="store_true",
                            help="Poll continuously instead of processing one pass.")
        parser.add_argument("--interval", type=int, default=15,
                            help="Seconds between polls in --loop mode (default: 15).")

    def handle(self, *args, **options):
        if options["loop"]:
            self.stdout.write("Polling for admin jobs. Press Ctrl-C to stop.")
            while True:
                self._pass()
                time.sleep(max(1, options["interval"]))
        else:
            processed = self._pass()
            self.stdout.write(f"Processed {processed} admin job(s).")

    def _pass(self) -> int:
        processed = 0
        # Drain the queue in one pass: the loop re-queries each time so freshly
        # queued work is picked up without a restart.
        while True:
            job = next_queued_job()
            if job is None:
                return processed
            self.stdout.write(f"Running admin job {job.pk} ({job.kind} {job.target_date}).")
            mark_running(job)
            job.refresh_from_db()
            try:
                run_job(job)
            except Exception as error:  # noqa: BLE001 - must never kill the worker
                # A single bad job must not stop the worker; it is recorded and
                # the loop continues to the next one.
                mark_failed(job, error=f"Unhandled: {type(error).__name__}")
                self.stderr.write(f"Admin job {job.pk} failed: {type(error).__name__}")
            processed += 1