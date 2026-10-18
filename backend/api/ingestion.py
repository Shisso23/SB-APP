from datetime import datetime, timedelta, timezone as utc_timezone
from decimal import Decimal
import math

from django.db import transaction
from django.utils import timezone

from api.execution import run_engine
from api.jobs import digest
from api.models import Fixture, OddsSnapshot, SourceObservation


SOURCE_MAX_AGE = timedelta(minutes=15)


class IngestionError(Exception):
    pass


def utc(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if timezone.is_naive(parsed):
            raise ValueError
        return parsed.astimezone(utc_timezone.utc)
    except (ValueError, TypeError, AttributeError):
        raise IngestionError("Expected an aware ISO UTC-compatible timestamp.") from None


def milliseconds(value):
    return int(value.timestamp() * 1000)


def positive_integer(value):
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise IngestionError("Provider identifier must be a positive integer.")
    return value


def observation(context, kind, scope, payload, observed_at):
    context.guard()
    return SourceObservation.objects.get_or_create(
        job=context.run, kind=kind, scope=scope, content_hash=digest(payload),
        defaults={"observed_at": observed_at, "payload": payload},
    )[0]


def entries(payload):
    rows = payload.get("response") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or len(rows) > 5000 or payload.get("errors"):
        raise IngestionError("Invalid or unbounded provider batch.")
    return rows


def fixture_values(raw, league_id, season):
    try:
        fixture, league, teams, goals = raw["fixture"], raw["league"], raw["teams"], raw["goals"]
        provider_id = positive_integer(fixture["id"])
        if league["id"] != league_id or league["season"] != season:
            raise IngestionError("Fixture scope does not match the requested competition/season.")
        kickoff = utc(fixture["date"])
        stamp = positive_integer(fixture["timestamp"])
        if abs(kickoff.timestamp() - stamp) >= 1:
            raise IngestionError("Fixture timestamp units or date disagree.")
        status = fixture["status"]["short"]
        if not isinstance(status, str) or not 1 <= len(status) <= 20:
            raise IngestionError("Invalid fixture status.")
        for value in goals.values():
            if value is not None and (isinstance(value, bool) or not isinstance(value, int) or value < 0):
                raise IngestionError("Invalid fixture score.")
        if status == "FT" and (goals.get("home") is None or goals.get("away") is None):
            raise IngestionError("Completed fixtures require final scores.")
        for side in ["home", "away"]:
            positive_integer(teams[side]["id"])
            if not isinstance(teams[side]["name"], str) or not 1 <= len(teams[side]["name"]) <= 200:
                raise IngestionError("Invalid team name.")
        return provider_id, dict(
            league_id=league_id, season=season, home_team_id=teams["home"]["id"], away_team_id=teams["away"]["id"],
            home_team_name=teams["home"]["name"], away_team_name=teams["away"]["name"], kickoff=kickoff,
            status=status, home_goals=goals.get("home"), away_goals=goals.get("away"), source_payload=raw,
        )
    except (KeyError, TypeError):
        raise IngestionError("Invalid fixture payload.") from None


def store_fixtures(context, payload, league_id, season):
    validated = [fixture_values(raw, league_id, season) for raw in entries(payload)]
    observed_at = timezone.now()
    with transaction.atomic():
        source = observation(context, "fixtures", f"{league_id}:{season}", payload, observed_at)
        for provider_id, values in validated:
            current = Fixture.objects.filter(provider_id=provider_id).first()
            if current and (current.fetched_at > source.observed_at or (current.status == "FT" and values["status"] != "FT")):
                continue
            Fixture.objects.update_or_create(provider_id=provider_id, defaults={**values, "fetched_at": source.observed_at})
        context.checkpoint(**{f"fixtures:{league_id}:{season}": source.pk})
    return source


def store_standings(context, payload, league_id, season):
    for row in entries(payload):
        if not isinstance(row, dict) or row.get("league", {}).get("id") != league_id or row.get("league", {}).get("season") != season:
            raise IngestionError("Standings scope does not match the requested competition/season.")
    with transaction.atomic():
        source = observation(context, "standings", f"{league_id}:{season}", payload, timezone.now())
        context.checkpoint(**{f"standings:{league_id}:{season}": source.pk})
    return source


def store_odds(context, payload, league_id, season):
    sources = []
    now = timezone.now()
    allowed = set(Fixture.objects.filter(league_id=league_id, season=season, status__in=["NS", "TBD"],
                                        kickoff__gt=now, kickoff__lte=now + timedelta(days=2))
                  .order_by("kickoff", "id").values_list("provider_id", flat=True)[:context.policy.max_fixtures])
    for raw in entries(payload):
        provider_id = raw.get("fixture", {}).get("id") if isinstance(raw, dict) else None
        if provider_id not in allowed:
            continue
        fixture = Fixture.objects.filter(provider_id=provider_id, league_id=league_id, season=season).first()
        if not fixture:
            continue
        with transaction.atomic():
            context.guard()
        observed_at = timezone.now()
        mapped = run_engine({"operation": "map_odds", "response": raw, "now": milliseconds(observed_at)})
        with transaction.atomic():
            source = observation(context, "odds", str(fixture.provider_id), raw, observed_at)
            for market in mapped["markets"]:
                stamp = market.get("timestamp")
                updated_at = datetime.fromtimestamp(stamp / 1000, utc_timezone.utc) if isinstance(stamp, (int, float)) and math.isfinite(stamp) else None
                OddsSnapshot.objects.get_or_create(
                    source=source, fixture=fixture, bookmaker=market["bookmaker"], market_id=market["marketId"],
                    defaults={"decimal_odds": Decimal(str(market["decimalOdds"])), "provider_updated_at": updated_at,
                              "captured_at": source.observed_at,
                              "margin_adjusted_probability": Decimal(str(market["marginAdjustedProbability"])) if market.get("marginAdjustedProbability") is not None else None},
                )
            sources.append(source.pk)
    context.checkpoint(**{f"odds:{league_id}:{season}": sources})
    return sources


def assemble_input(fixture, as_of, configuration, *, historical=False):
    if timezone.is_naive(as_of) or as_of >= fixture.kickoff or as_of > timezone.now():
        raise IngestionError("Prediction clock must precede kickoff and not be in the future.")
    if not historical and fixture.kickoff <= timezone.now():
        raise IngestionError("Actionable predictions cannot be generated after kickoff.")
    scopes = [f"{fixture.league_id}:{fixture.season - offset}" for offset in range(configuration["historySeasons"])]
    observations = SourceObservation.objects.filter(kind="fixtures", scope__in=scopes, observed_at__lte=as_of).order_by("observed_at", "id")
    known = {}
    for source in observations:
        for raw in entries(source.payload):
            known[raw["fixture"]["id"]] = (raw, source)
    if fixture.provider_id not in known:
        raise IngestionError("No target fixture was observed before the prediction clock.")
    target, target_source = known[fixture.provider_id]
    if utc(target["fixture"]["date"]) != fixture.kickoff or target["fixture"]["status"]["short"] not in {"NS", "TBD"}:
        raise IngestionError("Target fixture is not a matching pre-match observation.")
    if as_of - target_source.observed_at > SOURCE_MAX_AGE:
        raise IngestionError("Target fixture observation is stale.")
    history = []
    provenance = {target_source.pk}
    for provider_id, (raw, source) in sorted(known.items()):
        if provider_id != fixture.provider_id and raw["fixture"]["status"]["short"] == "FT" and utc(raw["fixture"]["date"]) < as_of:
            history.append(raw)
            provenance.add(source.pk)
    if len(history) > 5000:
        raise IngestionError("Prediction history exceeds the runner limit.")
    table = SourceObservation.objects.filter(kind="standings", scope=scopes[0], observed_at__lte=as_of,
                                              observed_at__gte=as_of - SOURCE_MAX_AGE).order_by("-observed_at", "-id").first()
    standings = [table.payload] if table else []
    if table:
        provenance.add(table.pk)
    quote_sources = SourceObservation.objects.filter(kind="odds", scope=str(fixture.provider_id), observed_at__lte=as_of,
                                                      observed_at__gte=as_of - SOURCE_MAX_AGE).order_by("-observed_at", "-id")
    latest = quote_sources.first()
    odds = []
    valid_until = min(fixture.kickoff, target_source.observed_at + SOURCE_MAX_AGE)
    if table:
        valid_until = min(valid_until, table.observed_at + SOURCE_MAX_AGE)
    if latest:
        for quote in OddsSnapshot.objects.filter(source=latest, fixture=fixture).order_by("market_id"):
            updated_at = quote.provider_updated_at
            if updated_at is None or updated_at > as_of or updated_at >= fixture.kickoff or as_of - updated_at > timedelta(minutes=configuration["odds"]["staleAfterMinutes"]):
                continue
            odds.append({"marketId": quote.market_id, "decimalOdds": float(quote.decimal_odds), "bookmaker": quote.bookmaker,
                         "timestamp": milliseconds(updated_at),
                         **({"marginAdjustedProbability": float(quote.margin_adjusted_probability)} if quote.margin_adjusted_probability is not None else {})})
            provenance.add(latest.pk)
            valid_until = min(valid_until, updated_at + timedelta(minutes=configuration["odds"]["staleAfterMinutes"]), latest.observed_at + SOURCE_MAX_AGE)
    return {"fixture": target, "allFixtures": history, "leaguesStandings": standings, "odds": odds,
            "standingsAreCurrent": True}, sorted(provenance), valid_until