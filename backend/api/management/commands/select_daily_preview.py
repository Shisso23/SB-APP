"""Select and cache the day's featured free-preview match.

Run once daily *after* publication, so the preview is derived from the published
list rather than from a separate forecasting run:

    0 7 * * * cd /path/to/SB-APP/backend && \\
      .venv/bin/python manage.py select_daily_preview >> /var/log/predictxi-preview.log 2>&1

Idempotent: a preview already cached for the business date is left alone, so all
visitors keep seeing the same featured match for the whole day.
"""

from datetime import date

from django.core.management.base import BaseCommand, CommandError

from api.business_time import business_date
from api.models import DailyPreview, OfficialDailyList
from api.official_list import _select_daily_preview


class Command(BaseCommand):
    help = "Cache the daily free-preview featured match from the published official list."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="Business date YYYY-MM-DD (default: today in the business timezone).")

    def handle(self, *args, **options):
        day = None
        if options["date"]:
            try:
                day = date.fromisoformat(options["date"])
            except ValueError:
                raise CommandError("--date must be YYYY-MM-DD.") from None

        target = day or business_date()
        existing = DailyPreview.objects.filter(business_date=target).exists()
        if existing:
            self.stdout.write(f"Preview already cached for {target}.")
            return

        official = OfficialDailyList.objects.filter(business_date=target).first()
        if official is None:
            # Not an error: a day with no published list has no featured match.
            self.stdout.write(f"No official list for {target}; no preview to select.")
            return

        _select_daily_preview(official, official.published_at)
        self.stdout.write(f"Selected daily preview for {target}.")