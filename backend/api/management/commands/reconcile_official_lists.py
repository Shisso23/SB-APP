"""Reconcile published official lists against final results.

Checks the previous business day each morning, plus every older list that still
has unsettled legs, so a late result is always picked up.

Typical cron (07:00 Johannesburg daily):

    0 7 * * * cd /path/to/SB-APP/backend && \\
      .venv/bin/python manage.py reconcile_official_lists >> /var/log/predictxi-reconcile.log 2>&1
"""

from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.utils.dateparse import parse_datetime

from api.official_reconcile import ReconciliationError, reconcile_lists


class Command(BaseCommand):
    help = "Settle published official lists from final results. Safe to re-run."

    def add_arguments(self, parser):
        parser.add_argument("--date", action="append",
                            help="Restrict to a business date YYYY-MM-DD. Repeatable.")
        parser.add_argument(
            "--now",
            help="Override the current instant (ISO-8601), e.g. to replay the postponement window.",
        )

    def handle(self, *args, **options):
        dates = None
        if options["date"]:
            dates = []
            for value in options["date"]:
                try:
                    dates.append(date.fromisoformat(value))
                except ValueError:
                    raise CommandError("--date must be YYYY-MM-DD.") from None

        now = None
        if options["now"]:
            now = parse_datetime(options["now"])
            if now is None:
                raise CommandError("--now must be an ISO-8601 datetime.")

        try:
            outcome = reconcile_lists(now=now, dates=dates)
        except ReconciliationError as exc:
            raise CommandError(f"Reconciliation refused: {exc}") from None

        self.stdout.write(
            "Reconciled {n} date(s): {s} settled, {v} voided, {u} unresolved, {f} list(s) finalised."
            .format(n=len(outcome.checked_dates), s=outcome.legs_settled,
                    v=outcome.legs_voided, u=outcome.legs_unresolved,
                    f=outcome.lists_finalised)
        )
        for error in outcome.errors:
            # Surfaced rather than swallowed: failed/unresolved checks must be
            # visible to an operator.
            self.stderr.write(f"Unresolved check: {error}")