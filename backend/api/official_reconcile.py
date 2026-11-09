"""Reconcile published official lists against final results.

Settlement reuses the existing engine rules through the private runner's
`settle` operation (which wraps `evaluateMarket`), so the official list cannot
disagree with how the rest of the app settles the same market.

Status model
------------
Two independent axes, deliberately not conflated:

  * **Match status** (`Fixture.status`) — whether the *fixture* is played, e.g.
    NS/TBD/FT/PST. This is the provider's view of the game.
  * **Selection status** (`OfficialListLeg.status`) — whether the *selection*
    won, lost, void, or is still unresolved. This is our view of the outcome.

A fixture can be finished (FT) while a selection remains unresolved (awaiting a
correction), and a fixture can be unplayed while its selection is already void
(postponement window elapsed).

Postponement policy (documented and user-visible)
-------------------------------------------------
If a fixture is not played and no authoritative result exists, the selection
stays unresolved until a configurable window elapses from the *original* kickoff
(default 48 hours). After that it becomes **void**, and a note is stored so the
public history can explain why. The window is never used to guess a result.

Regulation-time rule
--------------------
Standard markets settle on regulation time including stoppage time, excluding
extra time and penalties. The fixtures endpoint's full-time goals are used for
that purpose; markets that explicitly differ are out of scope for this phase and
are never guessed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from api.business_time import business_date, business_day_bounds
from api.execution import ExecutionError, run_engine
from api.ingestion import milliseconds
from api.jobs import JobError, JobPolicy, claim_job
from api.models import (
    Fixture,
    LegStatus,
    OfficialDailyList,
    OfficialListCorrection,
    OfficialListLeg,
    OfficialListStatus,
)

logger = logging.getLogger(__name__)

#: Fixtures the provider reports as definitively not played.
NOT_PLAYED_STATUSES = {"PST", "CANC", "ABD", "AWD", "WO"}

#: Fixtures whose full-time score is authoritative for regulation-time markets.
FINISHED_STATUSES = {"FT"}

#: Markets the engine can actually settle, verified by running the runner's
#: `settle` operation against each id. The derived range/total-band markets
#: (`total_2_5`, `home_1_2`, `home_over_1_5`, …) exist in the highlight config but
#: are NOT handled by the settlement rules, so they return `None` (unsupported).
#: Publishing one would leave a leg that can never be resolved and would
#: permanently distort the win rate, so publication refuses them outright rather
#: than guessing a settlement.
SETTLEABLE_MARKETS = frozenset({
    "home_win", "draw", "away_win",
    "home_over_0_5", "away_over_0_5",
    "btts_yes",
    "over_1_5", "under_1_5", "over_2_5", "under_2_5", "over_3_5", "under_3_5",
    "home_or_draw", "away_or_draw", "home_dnb", "away_dnb",
})


class ReconciliationError(Exception):
    """Reconciliation could not proceed; existing rows are left untouched."""


@dataclass
class ReconciliationOutcome:
    checked_dates: list = field(default_factory=list)
    legs_settled: int = 0
    legs_voided: int = 0
    legs_unresolved: int = 0
    lists_finalised: int = 0
    errors: list = field(default_factory=list)
    skipped: bool = False
    reason: str = ""


def postponement_window() -> timedelta:
    """Configurable window before an unplayed selection is voided."""
    hours = float(getattr(settings, "PREDICTXI_POSTPONEMENT_HOURS", 48))
    if hours <= 0:
        raise ReconciliationError("Postponement window must be positive.")
    return timedelta(hours=hours)


def _dates_to_check(now, limit: int) -> list:
    """The most recent business date plus every older list still unsettled.

    Older lists are always rechecked, so a late result is still reconciled no
    matter how long it took to appear.
    """
    today = business_date(now)
    yesterday = today - timedelta(days=1)
    dates = [yesterday, today]
    stale = (
        OfficialDailyList.objects.exclude(status__in=[OfficialListStatus.WON, OfficialListStatus.LOST, OfficialListStatus.VOID])
        .order_by("-business_date")
        .values_list("business_date", flat=True)
    )
    for value in stale:
        if value not in dates:
            dates.append(value)
        if len(dates) >= limit:
            break
    return dates


def reconcile_lists(*, now=None, dates=None) -> ReconciliationOutcome:
    """Settle every published list that still has unsettled legs."""
    now = now or timezone.now()
    outcome = ReconciliationOutcome()
    policy = JobPolicy.from_environment()

    targets = dates if dates is not None else _dates_to_check(now, int(getattr(settings, "PREDICTXI_RECONCILE_MAX_DATES", 30)))

    for day in targets:
        outcome.checked_dates.append(day)
        official = OfficialDailyList.objects.filter(business_date=day).first()
        if official is None:
            continue
        try:
            with claim_job("official_reconcile", str(day), now.replace(minute=now.minute // 5 * 5, second=0, microsecond=0), policy) as context:
                if context is None:
                    continue
                _reconcile_one(official, now, outcome)
        except (JobError, ReconciliationError) as exc:
            outcome.errors.append(f"{day}: {type(exc).__name__}")
            OfficialDailyList.objects.filter(pk=official.pk).update(
                last_checked_at=now, last_check_error=type(exc).__name__[:200]
            )
            continue
        OfficialDailyList.objects.filter(pk=official.pk).update(last_checked_at=now, last_check_error="")
    return outcome


def _reconcile_one(official: OfficialDailyList, now, outcome: ReconciliationOutcome) -> None:
    window = postponement_window()
    legs = list(official.legs.select_related("fixture").order_by("id"))

    for leg in legs:
        if leg.status in (LegStatus.WON, LegStatus.LOST, LegStatus.VOID):
            continue
        fixture = leg.fixture

        # A missing Fixture row means we cannot verify anything: stay unresolved
        # rather than guessing from the snapshot's team names.
        if fixture is None:
            _mark_unresolved(leg, "Fixture record is unavailable for settlement.")
            outcome.legs_unresolved += 1
            continue

        if fixture.status in FINISHED_STATUSES and fixture.home_goals is not None and fixture.away_goals is not None:
            _settle_leg(leg, fixture, now, outcome)
            continue

        if fixture.status in NOT_PLAYED_STATUSES:
            if now - leg.kickoff >= window:
                hours = int(window.total_seconds() // 3600)
                _void_leg(leg, f"Fixture was not played and the {hours}-hour postponement window has elapsed.", now)
                outcome.legs_voided += 1
            else:
                _mark_unresolved(leg, "Fixture was not played; awaiting the postponement window.")
                outcome.legs_unresolved += 1
            continue

        # Still scheduled, or a status we do not treat as authoritative.
        if now - leg.kickoff >= window:
            hours = int(window.total_seconds() // 3600)
            _void_leg(leg, f"No authoritative result within the {hours}-hour window; selection voided.", now)
            outcome.legs_voided += 1
        else:
            _mark_unresolved(leg, "Awaiting a final result.")
            outcome.legs_unresolved += 1

    _refresh_list_status(official, outcome)


def _mark_unresolved(leg: OfficialListLeg, note: str) -> None:
    if leg.status != LegStatus.UNRESOLVED or leg.resolution_note != note:
        OfficialListLeg.objects.filter(pk=leg.pk).update(status=LegStatus.UNRESOLVED, resolution_note=note[:200])


def _void_leg(leg: OfficialListLeg, note: str, now) -> None:
    OfficialListLeg.objects.filter(pk=leg.pk).update(
        status=LegStatus.VOID, resolution_note=note[:200], settled_at=now
    )
    OfficialListCorrection.objects.create(
        official_list=leg.official_list, leg=leg,
        reason="Automatic void under the postponement policy", actor="reconciler",
        before={"status": leg.status}, after={"status": LegStatus.VOID, "note": note[:200]},
    )


def _settle_leg(leg: OfficialListLeg, fixture: Fixture, now, outcome: ReconciliationOutcome) -> None:
    """Settle one leg using the engine's own market rules.

    The runner's `settle` operation requires `decimalOdds` because it also
    computes profit. The published leg's frozen odds are passed when present; a
    leg with no quoted price uses 1.00 purely so the *market outcome* can still be
    evaluated. That placeholder never reaches the displayed monetary figures,
    because `compute_list_return` reports those as unavailable when the original
    odds set is incomplete.
    """
    settled_at = now

    # Fail closed on a market the engine has no rule for. This must be checked
    # BEFORE evaluating, because the engine signals both "unsupported market" and
    # "genuine push" as null - conflating them would silently void a leg we simply
    # cannot settle.
    if leg.market_id not in SETTLEABLE_MARKETS:
        _mark_unresolved(leg, "No settlement rule exists for this market.")
        outcome.legs_unresolved += 1
        return

    odds = float(leg.decimal_odds) if leg.decimal_odds is not None else 1.0
    try:
        results = run_engine(
            {
                "operation": "settle",
                "now": milliseconds(settled_at),
                "selections": [{"marketId": leg.market_id, "decimalOdds": odds}],
                "homeGoals": fixture.home_goals,
                "awayGoals": fixture.away_goals,
            },
            timeout_seconds=10,
        )
    except ExecutionError:
        _mark_unresolved(leg, "Settlement rules could not be evaluated for this market.")
        outcome.legs_unresolved += 1
        return

    if not results:
        _mark_unresolved(leg, "No settlement rule exists for this market.")
        outcome.legs_unresolved += 1
        return

    settled = results[0].get("settled") or {}
    won = settled.get("won")

    if won is None:
        # The market IS supported and returned no winner: a genuine push (for
        # example a drawn draw-no-bet), which is void by rule.
        _void_leg(leg, "Selection had no winner under its own market rule; treated as void.", now)
        outcome.legs_voided += 1
        return

    new_status = LegStatus.WON if won else LegStatus.LOST
    previous_goals = (leg.home_goals, leg.away_goals)
    current_goals = (fixture.home_goals, fixture.away_goals)

    OfficialListLeg.objects.filter(pk=leg.pk).update(
        status=new_status, home_goals=fixture.home_goals, away_goals=fixture.away_goals,
        settled_at=settled_at, resolution_note="",
    )

    # A provider correction after settlement is recorded, never applied silently.
    if leg.status in (LegStatus.WON, LegStatus.LOST) and previous_goals != current_goals:
        OfficialListCorrection.objects.create(
            official_list=leg.official_list, leg=leg,
            reason="Result corrected by the provider", actor="reconciler",
            before={"home_goals": leg.home_goals, "away_goals": leg.away_goals, "status": leg.status},
            after={"home_goals": fixture.home_goals, "away_goals": fixture.away_goals, "status": new_status},
        )
    outcome.legs_settled += 1


def _refresh_list_status(official: OfficialDailyList, outcome: ReconciliationOutcome) -> None:
    """Derive the list's overall status from its legs.

    A list is LOST as soon as any leg loses — but the remaining legs keep
    settling, so the complete record stays visible.
    """
    statuses = list(official.legs.values_list("status", flat=True))
    if not statuses:
        return

    if any(s == LegStatus.LOST for s in statuses):
        target = OfficialListStatus.LOST
    elif all(s == LegStatus.VOID for s in statuses):
        target = OfficialListStatus.VOID
    elif any(s == LegStatus.UNRESOLVED for s in statuses):
        target = OfficialListStatus.UNRESOLVED
    elif any(s == LegStatus.PENDING for s in statuses):
        target = OfficialListStatus.PENDING
    else:
        target = OfficialListStatus.WON

    if official.status != target:
        OfficialDailyList.objects.filter(pk=official.pk).update(status=target)
        official.status = target
        if target in (OfficialListStatus.WON, OfficialListStatus.LOST, OfficialListStatus.VOID):
            outcome.lists_finalised += 1