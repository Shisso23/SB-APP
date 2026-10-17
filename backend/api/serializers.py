from rest_framework import serializers

from api.models import Fixture, Prediction


class FixtureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fixture
        fields = ["id", "provider_id", "league_id", "season", "home_team_name", "away_team_name", "kickoff", "status", "home_goals", "away_goals"]
        read_only_fields = fields


class PredictionSerializer(serializers.ModelSerializer):
    fixture = FixtureSerializer(read_only=True)

    class Meta:
        model = Prediction
        fields = ["id", "fixture", "engine_version", "config_hash", "generated_at", "as_of", "output"]
        read_only_fields = fields