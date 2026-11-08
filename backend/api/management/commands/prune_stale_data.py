from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import JobRun, OddsSnapshot, Prediction, SourceObservation


class Command(BaseCommand):
    help = "Delete old operational data that is no longer needed, keeping anything a Settlement still references."

    def add_arguments(self, parser):
        parser.add_argument("--prediction-days", type=int, default=14, help="Drop predictions for fixtures whose kickoff is older than this.")
        parser.add_argument("--odds-days", type=int, default=3, help="Drop odds snapshots for fixtures whose kickoff is older than this.")
        parser.add_argument("--observation-days", type=int, default=3, help="Drop source observations older than this.")
        parser.add_argument("--jobrun-days", type=int, default=14, help="Drop finished job runs older than this.")
        parser.add_argument("--dry-run", action="store_true", help="Report counts without deleting anything.")

    def handle(self, *args, **options):
        now = timezone.now()
        dry_run = options["dry_run"]

        # Superseded (non-latest) prediction versions are safe to drop immediately; settled
        # predictions are kept regardless of age since Settlement rows reference them.
        stale_predictions = Prediction.objects.exclude(settlements__isnull=False).filter(
            fixture__kickoff__lt=now - timedelta(days=options["prediction_days"]),
        )
        self._delete("Prediction", stale_predictions, dry_run)

        stale_odds = OddsSnapshot.objects.filter(fixture__kickoff__lt=now - timedelta(days=options["odds_days"]))
        self._delete("OddsSnapshot", stale_odds, dry_run)

        stale_observations = SourceObservation.objects.exclude(
            oddssnapshot__isnull=False,
        ).exclude(settlement__isnull=False).exclude(flagged_settlements__isnull=False).filter(
            observed_at__lt=now - timedelta(days=options["observation_days"]),
        )
        self._delete("SourceObservation", stale_observations, dry_run)

        stale_jobs = JobRun.objects.exclude(sourceobservation__isnull=False).filter(
            status__in=["completed", "failed"],
            finished_at__lt=now - timedelta(days=options["jobrun_days"]),
        )
        self._delete("JobRun", stale_jobs, dry_run)

    def _delete(self, label, queryset, dry_run):
        count = queryset.count()
        if dry_run:
            self.stdout.write(f"{label}: would delete {count}")
            return
        queryset.delete()
        self.stdout.write(f"{label}: deleted {count}")
