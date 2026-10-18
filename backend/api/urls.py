from django.urls import include, path
from rest_framework.routers import SimpleRouter

from api.views import (
    AccessProductsView,
    FixtureViewSet,
    HealthView,
    LeagueViewSet,
    MeView,
    OddsViewSet,
    PredictionViewSet,
    PurchaseStartView,
    PurchaseStatusView,
    StandingsViewSet,
)


router = SimpleRouter()
router.register("fixtures", FixtureViewSet, basename="fixture")
router.register("leagues", LeagueViewSet, basename="league")
router.register("standings", StandingsViewSet, basename="standings")
router.register("odds", OddsViewSet, basename="odds")
router.register("predictions", PredictionViewSet, basename="prediction")
urlpatterns = [
    path("health/", HealthView.as_view()),
    path("me/", MeView.as_view()),
    # Access passes. Read-only product list, server-driven purchase, owner-scoped status.
    path("access/products/", AccessProductsView.as_view()),
    path("access/purchases/", PurchaseStartView.as_view()),
    path("access/purchases/<int:attempt_id>/", PurchaseStatusView.as_view()),
    path("", include(router.urls)),
]