from django.urls import include, path
from rest_framework.routers import SimpleRouter

from api.admin_views import (
    AdminCoverageView,
    AdminJobDetailView,
    AdminJobListView,
    AdminRunView,
    AdminStatusView,
)
from api.official_public_views import (
    PublicOfficialHistoryView,
    PublicOfficialSummaryView,
    PublicOfficialTodayView,
    PublicPreviewView,
)
from api.views import (
    AccessProductsView,
    CheckoutView,
    FixtureViewSet,
    HealthView,
    LeagueViewSet,
    MeView,
    OddsViewSet,
    PayFastCancelView,
    PayFastITNView,
    PayFastReturnView,
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
    # PayFast checkout initiation. Server-owned price; grants nothing by itself.
    path("access/checkout/", CheckoutView.as_view()),
    # PayFast ITN (server-to-server) and browser return/cancel redirects.
    path("payments/payfast/itn/", PayFastITNView.as_view()),
    path("payments/payfast/return/", PayFastReturnView.as_view()),
    path("payments/payfast/cancel/", PayFastCancelView.as_view()),
    # Public official list + history. No authentication: these are the free
    # experience and return only published rows and the cached daily preview.
    path("public/official/today/", PublicOfficialTodayView.as_view()),
    path("public/official/history/", PublicOfficialHistoryView.as_view()),
    path("public/official/summary/", PublicOfficialSummaryView.as_view()),
    path("public/official/preview/", PublicPreviewView.as_view()),
    # Administrative prediction workflow. Every route enforces IsAdmin on the
    # server; hiding the UI is never the control.
    path("admin/status/", AdminStatusView.as_view()),
    path("admin/coverage/", AdminCoverageView.as_view()),
    path("admin/runs/", AdminRunView.as_view()),
    path("admin/jobs/", AdminJobListView.as_view()),
    path("admin/jobs/<int:job_id>/", AdminJobDetailView.as_view()),
    path("", include(router.urls)),
]