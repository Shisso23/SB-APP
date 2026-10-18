from rest_framework import serializers
from django.utils import timezone

from api.models import Fixture, Prediction


class FixtureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fixture
        fields = ["id", "provider_id", "league_id", "season", "home_team_name", "away_team_name", "kickoff", "status", "home_goals", "away_goals"]
        read_only_fields = fields


class PredictionSerializer(serializers.ModelSerializer):
    fixture = FixtureSerializer(read_only=True)
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