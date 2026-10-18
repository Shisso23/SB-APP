from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet
from rest_framework.exceptions import ValidationError
from django.db.models import F, OuterRef, Q, Subquery
from django.utils import timezone
from django.utils.dateparse import parse_date

from api.envelopes import ProviderPagination
from api.models import Fixture, LeagueCatalog, OddsSnapshot, Prediction, StandingsSnapshot
from api.permissions import HasPredictionAccess, has_prediction_access
from api.serializers import FixtureSerializer, LeagueSerializer, OddsSerializer, PredictionSerializer, StandingsSerializer


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


class MeView(APIView):
    def get(self, request):
        response = Response({
            "id": request.user.pk,
            "firebase_uid": request.user.firebase_uid,
            "has_prediction_access": has_prediction_access(request.user),
        })
        response["Cache-Control"] = "private, no-store"
        return response


class ReadOnlyEnvelopeViewSet(ReadOnlyModelViewSet):
    pagination_class = ProviderPagination
    permission_classes = [IsAuthenticated]

    def integer_param(self, name):
        raw = self.request.query_params.get(name)
        if raw in (None, ""):
            return None
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise ValidationError(f"{name} must be an integer.") from None
        if value <= 0:
            raise ValidationError(f"{name} must be positive.")
        return value

    def date_param(self, name):
        raw = self.request.query_params.get(name)
        if raw in (None, ""):
            return None
        value = parse_date(raw)
        if value is None:
            raise ValidationError(f"{name} must use YYYY-MM-DD.")
        return value


class FixtureViewSet(ReadOnlyEnvelopeViewSet):
    serializer_class = FixtureSerializer

    def get_queryset(self):
        if self.request.query_params.keys() - {"date", "from", "to", "league", "season", "team", "page", "page_size"}:
            raise ValidationError("Unsupported fixture filter.")
        rows = Fixture.objects.all()
        league, season, team = (self.integer_param(name) for name in ("league", "season", "team"))
        if league:
            rows = rows.filter(league_id=league)
        if season:
            rows = rows.filter(season=season)
        if team:
            rows = rows.filter(Q(home_team_id=team) | Q(away_team_id=team))
        single_date, start, end = (self.date_param(name) for name in ("date", "from", "to"))
        if single_date:
            rows = rows.filter(kickoff__date=single_date)
        if start:
            rows = rows.filter(kickoff__date__gte=start)
        if end:
            rows = rows.filter(kickoff__date__lte=end)
        if start and end and start > end:
            raise ValidationError("from must not be after to.")
        return rows.order_by("kickoff", "provider_id")


class LeagueViewSet(ReadOnlyEnvelopeViewSet):
    serializer_class = LeagueSerializer

    def get_queryset(self):
        if self.request.query_params.keys() - {"current", "type", "id", "search", "page", "page_size"}:
            raise ValidationError("Unsupported league filter.")
        rows = LeagueCatalog.objects.all().order_by("provider_id")
        current = self.request.query_params.get("current")
        if current not in (None, "", "true", "false"):
            raise ValidationError("current must be true or false.")
        league_type = self.request.query_params.get("type") or ""
        provider_id = self.integer_param("id")
        if provider_id:
            rows = rows.filter(provider_id=provider_id)
        if league_type and len(league_type) > 40:
            raise ValidationError("type is too long.")
        return rows


class StandingsViewSet(ReadOnlyEnvelopeViewSet):
    serializer_class = StandingsSerializer

    def get_queryset(self):
        if self.request.query_params.keys() - {"league", "season", "page", "page_size"}:
            raise ValidationError("Unsupported standings filter.")
        league, season = (self.integer_param(name) for name in ("league", "season"))
        if not league or not season:
            raise ValidationError("league and season are required.")
        latest = StandingsSnapshot.objects.filter(league_id=league, season=season).order_by("-observed_at", "-id")
        return latest[:1]


class OddsViewSet(ReadOnlyEnvelopeViewSet):
    serializer_class = OddsSerializer
    permission_classes = [IsAuthenticated, HasPredictionAccess]

    def get_queryset(self):
        if self.request.query_params.keys() - {"fixture", "date", "league", "season", "page", "page_size"}:
            raise ValidationError("Unsupported odds filter.")
        now = timezone.now()
        rows = OddsSnapshot.objects.select_related("fixture").filter(
            fixture__kickoff__gt=now, fixture__status__in=["NS", "TBD"], provider_updated_at__isnull=False,
            provider_updated_at__lt=F("fixture__kickoff"),
        )
        fixture_id = self.integer_param("fixture")
        league, season = (self.integer_param(name) for name in ("league", "season"))
        single_date = self.date_param("date")
        if fixture_id:
            rows = rows.filter(fixture__provider_id=fixture_id)
        if league:
            rows = rows.filter(fixture__league_id=league)
        if season:
            rows = rows.filter(fixture__season=season)
        if single_date:
            rows = rows.filter(fixture__kickoff__date=single_date)
        if not any([fixture_id, league, single_date]):
            raise ValidationError("A fixture, league or date filter is required.")
        return rows.order_by("fixture__kickoff", "market_id", "bookmaker")

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response


class PredictionViewSet(ReadOnlyEnvelopeViewSet):
    queryset = Prediction.objects.select_related("fixture").all()
    serializer_class = PredictionSerializer
    permission_classes = [IsAuthenticated, HasPredictionAccess]

    def get_queryset(self):
        history = self.request.query_params.get("history", "false")
        if history not in {"true", "false"}:
            raise ValidationError("history must be true or false.")
        latest = Prediction.objects.filter(fixture_id=OuterRef("fixture_id")).order_by("-generated_at", "-id")
        rows = Prediction.objects.select_related("fixture").annotate(latest_version_id=Subquery(latest.values("id")[:1]))
        if history == "true":
            return rows
        now = timezone.now()
        return rows.filter(pk=F("latest_version_id"), valid_until__gt=now, fixture__kickoff__gt=now,
                           fixture__status__in=["NS", "TBD"], generated_at__lt=F("fixture__kickoff"), as_of__lte=F("generated_at"))

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response