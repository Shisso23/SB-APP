from django.urls import include, path
from rest_framework.routers import SimpleRouter

from api.views import FixtureViewSet, HealthView, MeView, PredictionViewSet


router = SimpleRouter()
router.register("fixtures", FixtureViewSet, basename="fixture")
router.register("predictions", PredictionViewSet, basename="prediction")
urlpatterns = [path("health/", HealthView.as_view()), path("me/", MeView.as_view()), path("", include(router.urls))]