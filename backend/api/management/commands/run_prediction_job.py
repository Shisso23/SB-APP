from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from api.execution import ExecutionError, engine_version, generate_prediction, run_engine, settle_fixture
from api.ingestion import IngestionError, milliseconds, store_fixtures, store_leagues, store_odds, store_standings, utc
from api.jobs import JobError, JobPolicy, claim_job, digest
from api.models import Fixture
from api.providers import ApiFootballProvider, ProviderError


class Command(BaseCommand):
    help = "Run one bounded private bootstrap, refresh, prediction, or settlement job. Disabled by default."

    def add_arguments(self, parser):
        parser.add_argument("--mode", required=True, choices=["bootstrap", "refresh", "predict", "settle"])
        parser.add_argument("--league", required=True, type=int)
        parser.add_argument("--season", required=True, type=int)
        parser.add_argument("--slot", help="Aware ISO schedule slot; defaults to the current five-minute UTC slot.")

    def handle(self, *args, **options):
        try:
            policy = JobPolicy.from_environment()
            if not policy.enabled:
                raise JobError("Ingestion/execution is disabled by default.")
            league, season, mode = options["league"], options["season"], options["mode"]
            if league not in policy.allowed_leagues or not 1900 <= season <= timezone.now().year + 1:
                raise JobError("League or season is not allowed.")
            now = timezone.now()
            slot = utc(options["slot"]) if options["slot"] else now.replace(minute=now.minute // 5 * 5, second=0, microsecond=0)
            if slot > now:
                raise JobError("Schedule slots cannot be in the future.")
            with claim_job(mode, f"{league}:{season}", slot, policy) as context:
                if context is None:
                    self.stdout.write("Job slot is already complete; skipped.")
                    return
                if mode in {"bootstrap", "refresh"}:
                    self.ingest(context, mode, league, season)
                else:
                    self.execute_pipeline(context, mode, league, season)
            self.stdout.write("Bounded job completed.")
        except (JobError, ProviderError, IngestionError, ExecutionError, ValueError):
            raise CommandError("Job refused or failed; inspect its sanitized status and configured limits.") from None

    def ingest(self, context, mode, league, season):
        configuration = run_engine({"operation": "describe", "now": milliseconds(timezone.now())})["configuration"]
        provider = ApiFootballProvider(before_request=context.charge_request, on_quota=context.quota_cooldown,
                          check_deadline=context.remaining_seconds)
        try:
            seasons = [season - offset for offset in range(configuration["historySeasons"])] if mode == "bootstrap" else [season]
            for year in seasons:
                step = f"fixtures:{league}:{year}"
                if step not in context.run.checkpoint:
                    store_fixtures(context, provider.fixtures(league=league, season=year), league, year)
            if mode == "refresh":
                if "leagues" not in context.run.checkpoint:
                    store_leagues(context, provider.leagues(current=True, type="League"))
                if f"standings:{league}:{season}" not in context.run.checkpoint:
                    store_standings(context, provider.standings(league=league, season=season), league, season)
                if f"odds:{league}:{season}" not in context.run.checkpoint:
                    store_odds(context, provider.odds(league=league, season=season), league, season)
        finally:
            provider.close()

    def execute_pipeline(self, context, mode, league, season):
        version = engine_version()
        configuration = run_engine({"operation": "describe", "now": milliseconds(timezone.now())})["configuration"]
        frozen = context.run.checkpoint.get("execution")
        if frozen is None:
            frozen = {"clock": timezone.now().isoformat(), "engine": version, "configuration": digest(configuration)}
            context.checkpoint(execution=frozen)
        if frozen["engine"] != version or frozen["configuration"] != digest(configuration):
            raise JobError("Job cannot resume with a different engine/configuration build.")
        fixtures = Fixture.objects.filter(league_id=league, season=season)
        if mode == "predict":
            fixtures = fixtures.filter(status__in=["NS", "TBD"], kickoff__gt=timezone.now(), kickoff__lte=timezone.now() + timedelta(days=2))
        else:
            fixtures = fixtures.filter(status="FT", kickoff__lt=timezone.now(), predictions__isnull=False).distinct()
        completed = set(context.run.checkpoint.get("done", []))
        attempted = 0
        for fixture in fixtures.order_by("kickoff", "id"):
            if fixture.provider_id in completed:
                continue
            if attempted >= context.policy.max_fixtures:
                break
            with transaction.atomic():
                context.guard()
            if mode == "predict":
                generate_prediction(context, fixture, as_of=utc(frozen["clock"]))
                attempted += 1
            else:
                outcome = settle_fixture(context, fixture)
                if outcome["settled"] or outcome["corrections"]:
                    attempted += 1
            completed.add(fixture.provider_id)
            context.checkpoint(done=sorted(completed))