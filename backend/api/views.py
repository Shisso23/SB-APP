from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet
from rest_framework.exceptions import ValidationError
from django.db.models import F, OuterRef, Subquery
from django.utils import timezone

from api.models import Fixture, Prediction
from api.permissions import HasPredictionAccess, has_prediction_access
from api.serializers import FixtureSerializer, PredictionSerializer


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


class FixtureViewSet(ReadOnlyModelViewSet):
    queryset = Fixture.objects.order_by("kickoff", "id")
    serializer_class = FixtureSerializer


class PredictionViewSet(ReadOnlyModelViewSet):
    queryset = Prediction.objects.select_related("fixture").all()
    serializer_class = PredictionSerializer
    permission_classes = [IsAuthenticated, HasPredictionAccess]

    def get_queryset(self):
        history = self.request.query_params.get("history", "false")
        if history not in {"true", "false"}:
            raise ValidationError("history must be true or false.")
        latest = Prediction.objects.filter(fixture_id=OuterRef("fixture_id")).order_by("-generated_at", "-id")
        rows = super().get_queryset().annotate(latest_version_id=Subquery(latest.values("id")[:1]))
        if history == "true":
            return rows
        now = timezone.now()
        return rows.filter(pk=F("latest_version_id"), valid_until__gt=now, fixture__kickoff__gt=now,
                           fixture__status__in=["NS", "TBD"], generated_at__lt=F("fixture__kickoff"), as_of__lte=F("generated_at"))

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response