import logging

from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet
from rest_framework.exceptions import ValidationError, NotFound
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework import status as http_status
from django.conf import settings
from django.core.cache import cache
from django.db.models import F, OuterRef, Q, Subquery
from django.utils import timezone
from django.utils.dateparse import parse_date

from api.envelopes import ProviderPagination
from api.models import AccessProduct, Fixture, LeagueCatalog, OddsSnapshot, Prediction, PurchaseAttempt, StandingsSnapshot
from api.permissions import HasPredictionAccess, has_prediction_access, prediction_access_window
from api.serializers import (
    AccessProductSerializer,
    CheckoutSerializer,
    FixtureSerializer,
    LeagueSerializer,
    OddsSerializer,
    PredictionSerializer,
    PurchaseCreateSerializer,
    PurchaseStatusSerializer,
    StandingsSerializer,
)
from api import access as access_service
from api.payments.base import ProviderError, ProviderNotConfigured
from api.payments.payfast import PayFastConfigurationError, PayFastITNError, PayFastUnavailable

# Voucher-guessing protection. A single generic message is returned for every
# failure so a caller cannot distinguish a wrong PIN from an unusable voucher.
PURCHASE_RATE_LIMIT = 5
PURCHASE_RATE_WINDOW_SECONDS = 300
GENERIC_PURCHASE_ERROR = "The voucher could not be redeemed."
# One generic message for every checkout failure so a caller cannot probe which
# product exists, whether PayFast is configured, or whether the site URL is set.
GENERIC_CHECKOUT_ERROR = "Checkout is currently unavailable."

logger = logging.getLogger(__name__)


def _purchase_rate_limit_key(user):
    return f"purchase-attempt:{user.pk}"


def _rate_limit_exceeded(user):
    """Fixed-window counter. Uses the local cache; no external dependency."""
    key = _purchase_rate_limit_key(user)
    count = cache.get(key, 0)
    if count >= PURCHASE_RATE_LIMIT:
        return True
    cache.set(key, count + 1, PURCHASE_RATE_WINDOW_SECONDS)
    return False


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


class MeView(APIView):
    def get(self, request):
        window = prediction_access_window(request.user)
        response = Response({
            "id": request.user.pk,
            "firebase_uid": request.user.firebase_uid,
            "has_prediction_access": has_prediction_access(request.user),
            # Additive: lets the UI show expiry and tell "expired" apart from
            # "never purchased". Null when there is no active entitlement.
            "prediction_access_starts_at": window["starts_at"].isoformat() if window else None,
            "prediction_access_ends_at": window["ends_at"].isoformat() if window else None,
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


class AccessProductsView(APIView):
    """List purchasable access passes. Prices are server-owned."""

    def get(self, request):
        products = AccessProduct.objects.filter(is_active=True).order_by("price_amount")
        return Response({"products": AccessProductSerializer(products, many=True).data})


class PurchaseStartView(APIView):
    """Start a voucher redemption and grant access exactly once.

    Identity comes from the authenticated request only. Price, duration and the
    final access decision are server-owned. The voucher PIN is never stored,
    logged, or returned.
    """

    def post(self, request):
        serializer = PurchaseCreateSerializer(data=request.data)
        if not serializer.is_valid():
            # Field-level detail is intentionally reduced to the generic message
            # so validation cannot be used to probe PIN formats.
            return Response({"detail": GENERIC_PURCHASE_ERROR}, status=http_status.HTTP_400_BAD_REQUEST)

        if _rate_limit_exceeded(request.user):
            return Response({"detail": GENERIC_PURCHASE_ERROR}, status=http_status.HTTP_429_TOO_MANY_REQUESTS)

        idempotency_key = request.headers.get("Idempotency-Key", "").strip()
        if not idempotency_key or len(idempotency_key) > 128:
            return Response({"detail": "A valid Idempotency-Key header is required."},
                            status=http_status.HTTP_400_BAD_REQUEST)

        try:
            attempt, _entitlement = access_service.start_purchase(
                user=request.user,
                product_code=serializer.validated_data["product_code"],
                provider_name=serializer.validated_data["provider"],
                voucher_pin=serializer.validated_data["voucher_pin"],
                idempotency_key=idempotency_key,
            )
        except (ProviderNotConfigured, ProviderError):
            # Generic response: never reveal which provider state caused this.
            return Response({"detail": GENERIC_PURCHASE_ERROR}, status=http_status.HTTP_503_SERVICE_UNAVAILABLE)

        response = Response(PurchaseStatusSerializer(attempt).data, status=http_status.HTTP_202_ACCEPTED)
        response["Cache-Control"] = "private, no-store"
        return response


class PurchaseStatusView(APIView):
    """Owner-scoped purchase status. Another user's attempt is simply absent."""

    def get(self, request, attempt_id):
        attempt = PurchaseAttempt.objects.filter(pk=attempt_id).select_related("product").first()
        if attempt is None or access_service.result_for_owner(attempt, request.user) is None:
            raise NotFound()
        response = Response(PurchaseStatusSerializer(attempt).data)
        response["Cache-Control"] = "private, no-store"
        return response


class CheckoutView(APIView):
    """Start a PayFast checkout for a server-priced access product.

    Identity comes from the verified Firebase token only. The product code is
    the ONLY client input; price, currency, merchant reference and every
    PayFast parameter are server-owned. This endpoint never grants access - it
    only returns a signed payload the browser posts to PayFast.
    """

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "A valid product code is required."},
                            status=http_status.HTTP_400_BAD_REQUEST)

        idempotency_key = request.headers.get("Idempotency-Key", "").strip()
        if not idempotency_key or len(idempotency_key) > 128:
            return Response({"detail": "A valid Idempotency-Key header is required."},
                            status=http_status.HTTP_400_BAD_REQUEST)

        try:
            attempt, fields, process_url = access_service.start_checkout(
                user=request.user,
                product_code=serializer.validated_data["product_code"],
                idempotency_key=idempotency_key,
            )
        except (ProviderError, PayFastConfigurationError):
            # Never reveal which provider state caused this (unknown product,
            # missing credentials, unreachable site URL are indistinguishable).
            return Response({"detail": GENERIC_CHECKOUT_ERROR},
                            status=http_status.HTTP_503_SERVICE_UNAVAILABLE)
        except PayFastUnavailable:
            return Response({"detail": GENERIC_CHECKOUT_ERROR},
                            status=http_status.HTTP_503_SERVICE_UNAVAILABLE)

        response = Response({
            "attempt_id": attempt.pk,
            "status": attempt.status,
            "amount": f"{attempt.amount_expected:.2f}",
            "currency": attempt.currency,
            "process_url": process_url,
            # Signed, server-built. Contains no secret: merchant_key identifies
            # the account but cannot authorise a payment on its own, and the
            # passphrase is never included.
            "payfast_data": fields,
        }, status=http_status.HTTP_201_CREATED)
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


class PayFastITNView(APIView):
    """PayFast Instant Transaction Notification endpoint.

    PayFast POSTs here server-to-server. It MUST receive HTTP 200 quickly or it
    retries immediately, then after 10 minutes, then at exponentially longer
    intervals. We therefore always answer 200 once the notification has been
    processed *or* recorded for reconciliation, and reserve non-200 only for
    malformed bodies.

    No authentication class is used because PayFast cannot present a Firebase
    token; authenticity is established instead by the four documented checks
    (signature, source IP, amount, server confirmation) performed in
    `access.apply_payfast_itn`. A failure grants nothing.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    # PayFast posts application/x-www-form-urlencoded; the project default is
    # JSON-only, so this endpoint must opt in explicitly or DRF answers 415.
    parser_classes = [FormParser, MultiPartParser]

    def post(self, request):
        # PayFast posts application/x-www-form-urlencoded.
        data = request.data.dict() if hasattr(request.data, "dict") else dict(request.data)
        if not data:
            return Response({"detail": "Malformed notification."},
                            status=http_status.HTTP_400_BAD_REQUEST)

        remote_addr = request.META.get("REMOTE_ADDR", "")
        try:
            attempt, outcome = access_service.apply_payfast_itn(data=data, remote_addr=remote_addr)
        except PayFastITNError as error:
            # Cryptographic/source/server failure. Never granted; log the code
            # (never the payload or credentials) so operators can investigate.
            logger.warning("PayFast ITN rejected (%s) from %s", error.code, remote_addr)
            return Response(status=http_status.HTTP_200_OK)
        except access_service.ITNRejected as error:
            logger.info("PayFast ITN not applied (%s)", error.code)
            return Response(status=http_status.HTTP_200_OK)

        logger.info("PayFast ITN %s for attempt %s", outcome, attempt.pk)
        return Response(status=http_status.HTTP_200_OK)


class PayFastReturnView(APIView):
    """Customer browser lands here after a successful PayFast payment.

    This is a UX redirect ONLY. It never grants access and never reports a
    definitive success: the authoritative state comes from the ITN (and the
    status endpoint), because a buyer can reach this URL without paying.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return _frontend_result_redirect("success")


class PayFastCancelView(APIView):
    """Customer cancelled on PayFast. Same rules as the return view."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return _frontend_result_redirect("cancelled")


def _frontend_result_redirect(status_value):
    """Redirect the browser to the frontend result route.

    The target is built from `PREDICTXI_SITE_URL` only. The status is passed in
    the query string as a hint; the frontend must still confirm entitlement
    server-side before showing premium content.
    """
    site_url = (getattr(settings, "PREDICTXI_SITE_URL", "") or "").strip().rstrip("/")
    if not site_url:
        return Response({"detail": "Checkout is currently unavailable."},
                        status=http_status.HTTP_503_SERVICE_UNAVAILABLE)
    response = Response(status=http_status.HTTP_302_FOUND)
    response["Location"] = f"{site_url}/access/result?status={status_value}"
    response["Cache-Control"] = "no-store"
    return response