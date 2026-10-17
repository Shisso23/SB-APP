from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

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

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response