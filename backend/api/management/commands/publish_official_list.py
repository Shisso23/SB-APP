"""Publish the official daily five-match list.

Idempotent and safe to schedule: publishing an already-published business date is
a no-op, so a retried cron entry or a second worker cannot create a duplicate.

Typical cron (06:00 Johannesburg, weekdays):

    0 6 * * * cd /path/to/SB-APP/backend && \\
      .venv/bin/python manage.py publish_official_list >> /var/log/predictxi-official.log 2>&1
"""

from datetime import date, datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils.dateparse import parse_datetime

from api.business_time import business_date
from api.official_list import PublicationError, publish_daily_list


class Command(BaseCommand):
    help = "Publish the official daily five-match list. Idempotent per business date."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="Business date YYYY-MM-DD (default: today in the business timezone).")
        parser.add_argument("--actor", default="scheduler", help="Who triggered publication, for the audit note.")
        parser.add_argument(
            "--now",
            help="Override the current instant (ISO-8601). Useful for replaying a past date deterministically.",
        )

    def handle(self, *args, **options):
        day = None
        if options["date"]:
            try:
                day = date.fromisoformat(options["date"])
            except ValueError:
                raise CommandError("--date must be YYYY-MM-DD.") from None

        now = None
        if options["now"]:
            now = parse_datetime(options["now"])
            if now is None:
                raise CommandError("--now must be an ISO-8601 datetime.")

        try:
            outcome = publish_daily_list(now=now, day=day, actor=options["actor"])
        except PublicationError as exc:
            raise CommandError(f"Publication refused: {exc}") from None

        target = day or business_date(now)
        if outcome.published:
            self.stdout.write(f"Published official list for {target} (id={outcome.list_id}).")
        else:
            # Not an error: "no suitable fixtures" is a valid, publishable state
            # in which nothing is written.
            self.stdout.write(f"No list published for {target}: {outcome.reason}")