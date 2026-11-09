"""Public (unauthenticated) read API for the official list and its history.

Access model
------------
These endpoints are the FREE experience. They are enforced on the **server**:
the querysets below only ever select published rows and a fixed preview payload.
Premium predictions are never serialised here and then hidden on the client — the
data simply is not in the response.

Nothing in this module triggers forecasting or provider calls. It reads only
already-published rows and the cached daily preview, so a public page load is
cheap and cacheable.
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.paginator import EmptyPage, Paginator
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.business_time import business_date, recent_business_dates
from api.models import DailyPreview, OfficialDailyList, OfficialListLeg
from api.official_returns import (
    HYPOTHETICAL_DISCLOSURE,
    compute_list_return,
    quantize_money,
    quantize_odds,
    summary_metrics,
)

#: Fixed explanation of how forecasts work and where they stop being useful.
FORECAST_EXPLAINER = {
    "summary": (
        "Each forecast is a model probability, not a certainty. The model blends recent form, "
        "venue splits, goals scored and conceded, and league standings matched to the correct season."
    ),
    "limitations": [
        "Probabilities describe likelihood, not outcomes. Any single match can go either way.",
        "Thin data produces lower confidence; the model withholds markets it cannot support.",
        "Standings reflect the current table and can carry hindsight bias for historic fixtures.",
        "No forecast guarantees a result, and PredictXI does not place or accept bets.",
    ],
    "how_the_list_is_made": (
        "Once a day, before the earliest kickoff, the strongest qualifying selection is taken for "
        "each of five distinct fixtures. The published selections are frozen at that moment and are "
        "never rewritten afterwards."
    ),
}


def _decimal_or_none(value):
    if value is None:
        return None
    return Decimal(str(value))


def _leg_payload(leg: OfficialListLeg) -> dict:
    return {
        "providerFixtureId": leg.provider_fixture_id,
        "leagueId": leg.league_id,
        "leagueName": leg.league_name,
        "homeTeam": leg.home_team_name,
        "awayTeam": leg.away_team_name,
        "kickoff": leg.kickoff.isoformat(),
        "marketId": leg.market_id,
        "marketLabel": leg.market_label,
        "marketLine": leg.market_line,
        "probability": str(leg.probability),
        "explanation": leg.explanation,
        "engineVersion": leg.engine_version,
        "status": leg.status,
        "homeGoals": leg.home_goals,
        "awayGoals": leg.away_goals,
        "settledAt": leg.settled_at.isoformat() if leg.settled_at else None,
        "resolutionNote": leg.resolution_note,
        # Odds are nullable and always the frozen pre-kickoff quote.
        "odds": (
            {
                "decimalOdds": str(leg.decimal_odds),
                "bookmaker": leg.odds_bookmaker,
                "source": leg.odds_source,
                "capturedAt": leg.odds_captured_at.isoformat() if leg.odds_captured_at else None,
            }
            if leg.decimal_odds is not None
            else None
        ),
    }


def _list_payload(official: OfficialDailyList, *, include_legs: bool = True) -> dict:
    legs = list(official.legs.all())
    result = compute_list_return(legs, stake=_exercise_stake(), list_status=official.status)
    payload = {
        "businessDate": official.business_date.isoformat(),
        "published": True,
        "publishedAt": official.published_at.isoformat(),
        "status": official.status,
        "leagues": official.leagues,
        "engineVersion": official.engine_version,
        "lastCheckedAt": official.last_checked_at.isoformat() if official.last_checked_at else None,
        "lastCheckError": official.last_check_error,
        "legCount": len(legs),
    }
    if include_legs:
        payload["legs"] = [_leg_payload(leg) for leg in legs]

    # Monetary figures are only shown when the original odds set is complete.
    if result.available:
        payload["hypothetical"] = {
            "stake": str(quantize_money(result.stake)),
            "available": True,
            "reason": result.reason,
            "settledFully": result.settled_fully,
            "combinedOdds": str(quantize_odds(result.combined_odds)) if result.combined_odds is not None else None,
            "totalReturn": str(quantize_money(result.total_return)) if result.total_return is not None else None,
            "net": str(quantize_money(result.net)) if result.net is not None else None,
            # Before settlement these are POTENTIAL returns, never earnings.
            "isPotential": not result.settled_fully,
            "disclosure": HYPOTHETICAL_DISCLOSURE,
        }
    else:
        payload["hypothetical"] = {
            "stake": str(quantize_money(result.stake)),
            "available": False,
            "reason": result.reason,
            "settledFully": result.settled_fully,
            "combinedOdds": None,
            "totalReturn": None,
            "net": None,
            "isPotential": True,
            "disclosure": HYPOTHETICAL_DISCLOSURE,
        }
    return payload


def _exercise_stake() -> Decimal:
    return Decimal(str(getattr(settings, "PREDICTXI_EXERCISE_STAKE", "1000.00")))


class PublicOfficialTodayView(APIView):
    """Today's published list, with selections, saved probabilities and explanations."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        today = business_date()
        official = OfficialDailyList.objects.filter(business_date=today).prefetch_related("legs").first()
        if official is None:
            return Response({
                "businessDate": today.isoformat(),
                "published": False,
                # Deliberately explicit: a missing list means no suitable set was
                # found, NOT a shorter list presented as a five-match list.
                "message": "No official five-match list was published for today.",
            })
        return Response(_list_payload(official))


class PublicOfficialHistoryView(APIView):
    """Paginated public history. No membership required."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        page_size = int(getattr(settings, "PREDICTXI_HISTORY_PAGE_SIZE", 10))
        try:
            page_number = max(1, int(request.query_params.get("page", 1)))
        except (TypeError, ValueError):
            page_number = 1

        published = OfficialDailyList.objects.order_by("-business_date").prefetch_related("legs")
        paginator = Paginator(published, page_size)
        try:
            page = paginator.page(page_number)
        except EmptyPage:
            page = paginator.page(paginator.num_pages) if paginator.num_pages else None

        # The most recent business dates are always shown, INCLUDING dates with no
        # publication, so gaps are visible instead of silently skipped.
        recent_count = int(getattr(settings, "PREDICTXI_HISTORY_RECENT_DATES", 5))
        recent_dates = recent_business_dates(recent_count)
        published_by_date = {
            row.business_date: row
            for row in OfficialDailyList.objects.filter(business_date__in=recent_dates).prefetch_related("legs")
        }
        recent = []
        for day in recent_dates:
            row = published_by_date.get(day)
            if row is None:
                recent.append({
                    "businessDate": day.isoformat(),
                    "published": False,
                    "message": "No official five-match list was published for this date.",
                    "legs": [],
                })
            else:
                recent.append(_list_payload(row, include_legs=False))

        return Response({
            "recent": recent,
            "page": page.number if page else 0,
            "pageSize": page_size,
            "totalPages": paginator.num_pages,
            "totalLists": paginator.count,
            "results": [_list_payload(row) for row in (page.object_list if page else [])],
        })


class PublicOfficialSummaryView(APIView):
    """Labeled summary metrics with explicit denominators."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        published = OfficialDailyList.objects.prefetch_related("legs").order_by("-business_date")
        metrics = summary_metrics(published[:500])
        return Response({
            "metrics": metrics,
            "definitions": {
                "fullListWinRate": "won lists / (won lists + lost lists). Void, pending and unresolved lists are excluded.",
                "selectionHitRate": "won selections / (won selections + lost selections).",
                "note": "Void legs use odds 1.00 in any hypothetical calculation and an entirely void list returns the stake.",
            },
            "scope": {
                "listsConsidered": min(published.count(), 500),
                "period": {
                    "from": published.last().business_date.isoformat() if published.exists() else None,
                    "to": published.first().business_date.isoformat() if published.exists() else None,
                },
            },
        })


class PublicPreviewView(APIView):
    """The single cached featured match plus the forecast explainer.

    Served from the daily cache so all visitors see the same preview and no
    forecasting or provider work happens on request.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        today = business_date()
        preview = DailyPreview.objects.filter(business_date=today).select_related("leg").first()
        payload = {
            "businessDate": today.isoformat(),
            "available": preview is not None,
            "explainer": FORECAST_EXPLAINER,
        }
        if preview is None:
            payload["message"] = "No featured match is available for today."
            return Response(payload)
        leg = preview.leg
        payload["featured"] = {
            "providerFixtureId": leg.provider_fixture_id if leg else None,
            "leagueName": leg.league_name if leg else "",
            "homeTeam": leg.home_team_name if leg else "",
            "awayTeam": leg.away_team_name if leg else "",
            "kickoff": leg.kickoff.isoformat() if leg else None,
            **preview.payload,
        }
        return Response(payload)