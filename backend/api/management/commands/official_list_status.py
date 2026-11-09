"""Operational status for the official daily list.

This project has no `django.contrib.admin` installed, so there is no admin site
to extend. Rather than introduce one purely for this feature, this command
surfaces the operational facts the specification asks to be visible:

  * when each list was last checked,
  * which checks failed,
  * how many legs are still unresolved (and why),
  * the current summary metrics.

Safe to run at any time: it reads only and never mutates a publication.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from api.business_time import business_date
from api.models import LegStatus, OfficialDailyList, OfficialListStatus
from api.official_returns import summary_metrics


class Command(BaseCommand):
    help = "Report official-list reconciliation status and summary metrics."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=14,
                            help="How many recent business dates to list (default: 14).")

    def handle(self, *args, **options):
        self.stdout.write(f"Business date today: {business_date().isoformat()}")
        self.stdout.write(f"Generated at (UTC): {timezone.now().isoformat()}")

        unresolved = OfficialDailyList.objects.filter(
            status__in=[OfficialListStatus.PENDING, OfficialListStatus.UNRESOLVED]
        ).count()
        failed = OfficialDailyList.objects.exclude(last_check_error="").count()
        self.stdout.write("")
        self.stdout.write(f"Lists awaiting resolution : {unresolved}")
        self.stdout.write(f"Lists with a failed check : {failed}")

        self.stdout.write("")
        self.stdout.write("Recent lists:")
        recent = OfficialDailyList.objects.order_by("-business_date")[: options["limit"]]
        if not recent:
            self.stdout.write("  (none published)")
        for official in recent:
            legs = list(official.legs.all())
            pending = sum(1 for leg in legs if leg.status == LegStatus.PENDING)
            un = sum(1 for leg in legs if leg.status == LegStatus.UNRESOLVED)
            self.stdout.write(
                "  {date}  status={status:<10} legs={n} pending={p} unresolved={u} "
                "checked={checked}{err}".format(
                    date=official.business_date.isoformat(),
                    status=official.status,
                    n=len(legs),
                    p=pending,
                    u=un,
                    checked=official.last_checked_at.isoformat() if official.last_checked_at else "never",
                    err=f" error={official.last_check_error}" if official.last_check_error else "",
                )
            )

        # Show WHY anything is unresolved: an operator needs the reason, not just
        # a count.
        notes = (
            official.legs.exclude(status=LegStatus.PENDING)
            .exclude(resolution_note="")
            .values_list("official_list__business_date", "home_team_name", "market_id", "status", "resolution_note")[:20]
        )
        notes = list(notes)
        if notes:
            self.stdout.write("")
            self.stdout.write("Resolution notes:")
            for day, home, market, status, note in notes:
                self.stdout.write(f"  {day} {home} [{market}] {status}: {note}")

        metrics = summary_metrics(OfficialDailyList.objects.prefetch_related("legs")[:500])
        self.stdout.write("")
        self.stdout.write("Summary metrics:")
        lists = metrics["lists"]
        selections = metrics["selections"]
        self.stdout.write(
            "  Full-list win rate  : {rate}  (won={w} lost={l} denominator={d})".format(
                rate=("-" if lists["win_rate"] is None else f"{lists['win_rate'] * 100:.1f}%"),
                w=lists["won"], l=lists["lost"], d=lists["denominator"],
            )
        )
        self.stdout.write(
            "  Selection hit rate  : {rate}  (won={w} lost={l} denominator={d})".format(
                rate=("-" if selections["hit_rate"] is None else f"{selections['hit_rate'] * 100:.1f}%"),
                w=selections["won"], l=selections["lost"], d=selections["denominator"],
            )
        )
        self.stdout.write(
            "  Void={v} Pending={p} Unresolved={u} (excluded from both rates)".format(
                v=lists["void"], p=lists["pending"], u=lists["unresolved"],
            )
        )