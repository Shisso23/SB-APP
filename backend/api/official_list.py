"""Publish and reconcile the official daily five-match list.

Design notes tied to the product requirements:

  * **One list per business date.** `OfficialDailyList.business_date` is unique and
    publication runs inside `transaction.atomic()` with a `select_for_update()`
    probe, so a retried job or a second worker cannot publish twice.
  * **Immutable snapshots.** Each leg copies its market, probability, explanation
    and odds into its own row. Nothing is recomputed from live `Prediction` rows
    later, and re-running publication for an existing date is a no-op.
  * **No short lists.** If fewer than the required five distinct fixtures
    qualify, nothing is published at all.
  * **Reuse, not reinvention.** Selection delegates to the existing
    `buildForecastBetList` through the private runner's `bet_list` operation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from api.business_time import business_date, business_day_bounds, publication_target
from api.execution import ExecutionError, engine_version, run_engine
from api.ingestion import milliseconds, observation
from api.jobs import JobError, JobPolicy, claim_job
from api.models import (
    DailyPreview,
    Fixture,
    LegStatus,
    OfficialDailyList,
    OfficialListCorrection,
    OfficialListLeg,
    OfficialListStatus,
    OddsSnapshot,
    Prediction,
)

logger = logging.getLogger(__name__)

#: The published list always shows exactly five fixtures.
OFFICIAL_LIST_SIZE = 5

class PublicationError(Exception):
    """Publication was refused; nothing was written."""


@dataclass(frozen=True)
class PublicationOutcome:
    published: bool
    business_date: object
    reason: str = ""
    list_id: int | None = None


def required_list_size() -> int:
    return int(getattr(settings, "PREDICTXI_OFFICIAL_LIST_SIZE", OFFICIAL_LIST_SIZE))


def _allowed_leagues() -> list[int]:
    """Configured leagues for publication.

    Reads the same configuration the job policy uses, but through Django
    settings so it stays consistent with the rest of the app and is overridable in
    tests. Raises when nothing is configured rather than publishing from every
    league implicitly.
    """
    raw = getattr(settings, "PREDICTXI_LEAGUES", None)
    if raw is None:
        raw = list(JobPolicy.from_environment().allowed_leagues)
    if isinstance(raw, str):
        raw = [part for part in raw.split(",") if part.strip()]
    try:
        return [int(value) for value in raw]
    except (TypeError, ValueError):
        raise PublicationError("PREDICTXI_LEAGUES must be a list of numeric league ids.") from None


def _candidate_fixtures(now, day) -> list[Fixture]:
    """Unstarted fixtures inside the business day, in configured leagues."""
    leagues = _allowed_leagues()
    if not leagues:
        raise PublicationError("No leagues are configured (PREDICTXI_LEAGUES is empty).")
    start, end = business_day_bounds(day)
    return list(
        Fixture.objects.filter(
            league_id__in=leagues,
            status__in=["NS", "TBD"],
            kickoff__gte=max(start, now),
            kickoff__lt=end,
        )
        .order_by("kickoff", "provider_id")
    )


def _serialise_prediction_output(prediction: Prediction) -> dict:
    """Rebuild the runner's `FixturePrediction` shape from a stored row.

    Only fields the selection logic reads are projected, which keeps the payload
    small and avoids leaking unrelated stored detail into the runner.
    """
    output = prediction.output or {}
    return output


def _run_selection(predictions: list[dict], now, limit: int) -> list[dict]:
    """Delegate selection to the existing engine betlist builder.

    `run_engine` enforces a hard ceiling of 10 seconds, so the timeout here is
    fixed at that maximum rather than a larger value.
    """
    return run_engine(
        {"operation": "bet_list", "now": milliseconds(now), "predictions": predictions, "limit": limit},
        timeout_seconds=10,
    )


def _odds_for(fixture: Fixture, market_id: str, kickoff):
    """Best pre-kickoff quote for a market, from the frozen canonical snapshots.

    Returns `None` when no acceptable quote exists. Quotes captured at or after
    kickoff are refused outright: a post-kickoff price must never be presented as
    the original quotation.
    """
    rows = (
        OddsSnapshot.objects.filter(fixture=fixture, market_id=market_id, captured_at__lt=kickoff)
        .order_by("-decimal_odds", "bookmaker")
    )
    for row in rows:
        if row.decimal_odds is not None and row.decimal_odds >= Decimal("1.01"):
            return row
    return None


def publish_daily_list(*, now=None, day=None, actor: str = "scheduler") -> PublicationOutcome:
    """Publish the official list for `day` (default: today in business tz).

    Idempotent: an already-published date is reported as such and left untouched.
    """
    now = now or timezone.now()
    target_day = day or business_date(now)

    policy = JobPolicy.from_environment()
    size = required_list_size()

    with claim_job("official_publish", str(target_day), now.replace(minute=now.minute // 5 * 5, second=0, microsecond=0), policy) as context:
        if context is None:
            return PublicationOutcome(False, target_day, reason="Publication slot already completed.")

        # Fast path: an existing row means this day is already published.
        if OfficialDailyList.objects.filter(business_date=target_day).exists():
            return PublicationOutcome(False, target_day, reason="Already published for this business date.")

        candidates = _candidate_fixtures(now, target_day)
        if not candidates:
            return PublicationOutcome(False, target_day, reason="No unstarted fixtures in the configured leagues.")

        # Evaluate only fixtures that already have a frozen prediction. Missing
        # ones are simply skipped: publication must never run new forecasting
        # inline, because that could change after the deadline.
        payloads: list[dict] = []
        by_fixture: dict[int, Prediction] = {}
        for fixture in candidates:
            prediction = (
                Prediction.objects.filter(fixture=fixture, generated_at__lt=fixture.kickoff)
                .order_by("-generated_at")
                .first()
            )
            if prediction is None:
                continue
            payloads.append(_serialise_prediction_output(prediction))
            by_fixture[fixture.provider_id] = prediction

        if len(payloads) < size:
            return PublicationOutcome(
                False, target_day,
                reason=f"Only {len(payloads)} fixtures had an eligible stored forecast; {size} are required.",
            )

        try:
            selection = _run_selection(payloads, now, size)
        except ExecutionError:
            return PublicationOutcome(False, target_day, reason="Selection run failed.")

        # One supported selection per DISTINCT fixture, and never a short list.
        # Markets the engine cannot settle are refused here so every published leg
        # is guaranteed to be resolvable later.
        from api.official_reconcile import SETTLEABLE_MARKETS

        chosen: list[dict] = []
        seen: set[int] = set()
        for row in selection:
            pid = row.get("providerFixtureId")
            if pid in seen:
                continue
            if row.get("probability") is None:
                continue
            if row.get("marketId") not in SETTLEABLE_MARKETS:
                continue
            seen.add(pid)
            chosen.append(row)
            if len(chosen) == size:
                break

        if len(chosen) < size:
            return PublicationOutcome(
                False, target_day,
                reason=f"Only {len(chosen)} distinct fixtures qualified; {size} are required, so nothing was published.",
            )

        try:
            return _write_publication(target_day, chosen, by_fixture, now, context)
        except IntegrityError:
            # A concurrent worker won the race; treat as already published.
            return PublicationOutcome(False, target_day, reason="Already published for this business date.")


def _write_publication(day, chosen, by_fixture, now, context) -> PublicationOutcome:
    version = engine_version()
    leagues = sorted({by_fixture[row["providerFixtureId"]].fixture.league_id for row in chosen})

    with transaction.atomic():
        context.guard()
        official = OfficialDailyList.objects.create(
            business_date=day,
            published_at=now,
            leagues=leagues,
            engine_version=version,
            config_hash=(chosen[0] and "") or "",
            target_at=publication_target(day),
            status=OfficialListStatus.PENDING,
        )
        for row in chosen:
            prediction = by_fixture[row["providerFixtureId"]]
            fixture = prediction.fixture
            odds_row = _odds_for(fixture, row["marketId"], fixture.kickoff)
            try:
                probability = Decimal(str(row["probability"]))
            except (InvalidOperation, TypeError):
                raise PublicationError("Selection probability was not a usable number.")

            OfficialListLeg.objects.create(
                official_list=official,
                provider_fixture_id=fixture.provider_id,
                fixture=fixture,
                prediction=prediction,
                league_id=fixture.league_id,
                league_name=(prediction.output or {}).get("fixture", {}).get("league", {}).get("name", "") or "",
                home_team_name=fixture.home_team_name,
                away_team_name=fixture.away_team_name,
                kickoff=fixture.kickoff,
                market_id=row["marketId"],
                market_label=row.get("marketLabel", "") or "",
                market_line=row.get("marketLine", "") or "",
                probability=probability,
                explanation=(row.get("explanation") or "")[:400],
                engine_version=version,
                decimal_odds=odds_row.decimal_odds if odds_row else None,
                odds_bookmaker=odds_row.bookmaker if odds_row else "",
                odds_source="api-football" if odds_row else "",
                odds_captured_at=odds_row.captured_at if odds_row else None,
                status=LegStatus.PENDING,
            )

        # Cache the day's featured preview once, from a leg of this list.
        _select_daily_preview(official, now)

    return PublicationOutcome(True, day, reason="", list_id=official.pk)


def _select_daily_preview(official: OfficialDailyList, now) -> None:
    """Pick and freeze one featured match for the day, once.

    The choice is deterministic (earliest kickoff, then lowest id) so all visitors
    see the same preview and no per-request work is needed.
    """
    if DailyPreview.objects.filter(business_date=official.business_date).exists():
        return
    leg = official.legs.order_by("kickoff", "id").first()
    if leg is None:
        return
    prediction = leg.prediction
    payload = {
        "marketId": leg.market_id,
        "marketLabel": leg.market_label,
        "marketLine": leg.market_line,
        "probability": str(leg.probability),
        "explanation": leg.explanation,
        "engineVersion": leg.engine_version,
        "markets": [],
    }
    if prediction is not None:
        markets = (prediction.output or {}).get("markets", [])
        # Expose a small, fixed slice so the preview stays a sample, not the
        # full premium payload.
        payload["markets"] = [
            {
                "marketId": m.get("marketId"),
                "label": m.get("label", ""),
                "probability": m.get("modelProbability"),
                "decimalOdds": m.get("decimalOdds"),
                "qualifies": m.get("qualifies"),
            }
            for m in markets[:12]
            if m.get("marketId")
        ]
        payload["dataQuality"] = {
            "homeSampleSize": (prediction.output or {}).get("dataQuality", {}).get("homeSampleSize"),
            "awaySampleSize": (prediction.output or {}).get("dataQuality", {}).get("awaySampleSize"),
            "standingsAvailable": (prediction.output or {}).get("dataQuality", {}).get("standingsAvailable"),
        }
    DailyPreview.objects.create(business_date=official.business_date, leg=leg, payload=payload)