from rest_framework import serializers
from django.utils import timezone

from api.models import Fixture, LeagueCatalog, OddsSnapshot, Prediction, StandingsSnapshot


class ProviderFixtureSerializer(serializers.ModelSerializer):
    """Provider-shaped fixture JSON consumed directly by the existing screens."""

    fixture = serializers.SerializerMethodField()
    league = serializers.SerializerMethodField()
    teams = serializers.SerializerMethodField()
    goals = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()

    class Meta:
        model = Fixture
        fields = ["fixture", "league", "teams", "goals", "score"]
        read_only_fields = fields

    def get_fixture(self, fixture):
        return {
            "id": fixture.provider_id,
            "date": fixture.kickoff.isoformat(),
            "timestamp": int(fixture.kickoff.timestamp()),
            "timezone": "UTC",
            "status": {"short": fixture.status, "long": fixture.status, "elapsed": None},
        }

    def get_league(self, fixture):
        return {"id": fixture.league_id, "season": fixture.season}

    def get_teams(self, fixture):
        return {
            "home": {"id": fixture.home_team_id, "name": fixture.home_team_name, "logo": "", "winner": None},
            "away": {"id": fixture.away_team_id, "name": fixture.away_team_name, "logo": "", "winner": None},
        }

    def get_goals(self, fixture):
        return {"home": fixture.home_goals, "away": fixture.away_goals}

    def get_score(self, fixture):
        full_time = {"home": fixture.home_goals, "away": fixture.away_goals}
        return {"halftime": {"home": None, "away": None}, "fulltime": full_time, "extratime": {"home": None, "away": None}}


class FixtureSerializer(ProviderFixtureSerializer):
    pass


class LeagueSerializer(serializers.ModelSerializer):
    """Only an allowlisted canonical subset is ever exposed."""

    league = serializers.SerializerMethodField()
    country = serializers.SerializerMethodField()
    seasons = serializers.SerializerMethodField()

    class Meta:
        model = LeagueCatalog
        fields = ["league", "country", "seasons"]
        read_only_fields = fields

    @staticmethod
    def _sources(instance):
        payload = instance.get("payload", {}) if isinstance(instance, dict) else instance.payload
        return payload.get("league", {}), payload.get("country", {}), payload.get("seasons", [])

    def get_league(self, league):
        source, _country, _seasons = self._sources(league)
        return {"id": source.get("id"), "name": source.get("name"), "type": source.get("type"), "logo": source.get("logo")}

    def get_country(self, league):
        _source, country, _seasons = self._sources(league)
        return {"name": country.get("name"), "code": country.get("code"), "flag": country.get("flag")}

    def get_seasons(self, league):
        _source, _country, seasons = self._sources(league)
        return [{"year": season.get("year"), "start": season.get("start"), "end": season.get("end"), "current": bool(season.get("current"))} for season in seasons]


class StandingsSerializer(serializers.ModelSerializer):
    league = serializers.SerializerMethodField()

    class Meta:
        model = StandingsSnapshot
        fields = ["league"]
        read_only_fields = fields

    def get_league(self, snapshot):
        rows = snapshot.payload.get("league", {})
        return {
            "id": rows.get("id"), "name": rows.get("name"), "country": rows.get("country"),
            "logo": rows.get("logo"), "flag": rows.get("flag"), "season": snapshot.season,
            "standings": rows.get("standings", []),
        }


class OddsSerializer(serializers.ModelSerializer):
    """Stored canonical quotes only; raw provider payloads are never returned."""

    fixture_id = serializers.IntegerField(source="fixture.provider_id", read_only=True)

    class Meta:
        model = OddsSnapshot
        fields = ["fixture_id", "bookmaker", "market_id", "decimal_odds", "provider_updated_at", "captured_at", "margin_adjusted_probability"]
        read_only_fields = fields


class PredictionSerializer(serializers.ModelSerializer):
    fixture = ProviderFixtureSerializer(read_only=True)
    is_actionable = serializers.SerializerMethodField()

    def get_is_actionable(self, prediction):
        now = timezone.now()
        return bool(prediction.pk == getattr(prediction, "latest_version_id", None) and prediction.valid_until
                    and now < prediction.valid_until and now < prediction.fixture.kickoff
                    and prediction.fixture.status in {"NS", "TBD"} and prediction.generated_at < prediction.fixture.kickoff
                    and prediction.as_of <= prediction.generated_at)

    class Meta:
        model = Prediction
        fields = ["id", "fixture", "engine_version", "config_hash", "generated_at", "as_of", "valid_until", "is_actionable", "output"]
        read_only_fields = fields