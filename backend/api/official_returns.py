"""Hypothetical return arithmetic for a published official list.

This is a *simulation display*, never a wallet, stake, or deposit facility. Every
number here is derived from the odds frozen at publication time; nothing is
fetched retrospectively and nothing is invented.

Rules implemented (all from the product specification):

  * A void leg settles at decimal odds **1.00** (it neither adds nor removes
    return), so an all-void list returns the stake.
  * Combined decimal odds = product of the legs' odds, with voids treated as 1.00.
  * If any non-void leg loses, total return is 0.
  * If every leg is void, total return is the stake (excluded from win rate).
  * Missing odds are NEVER substituted with 1 / probability. A list with an
    incomplete set of original quotes has no monetary calculation at all.

Decimal arithmetic throughout; rounding happens only at the display boundary.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from api.models import LegStatus, OfficialListStatus

#: Illustrative stake. Not a real deposit, balance, or bet.
DEFAULT_EXERCISE_STAKE = Decimal("1000.00")

#: Disclosure that must accompany every hypothetical figure.
HYPOTHETICAL_DISCLOSURE = (
    "Hypothetical example—no bet placed. Returns include the stake. "
    "Predictions do not guarantee outcomes."
)

#: A void leg is treated as odds 1.00 in any accumulator calculation.
VOID_ODDS = Decimal("1.00")


@dataclass(frozen=True)
class LegReturn:
    """Per-leg contribution to the hypothetical calculation."""

    provider_fixture_id: int
    status: str
    odds: Decimal | None
    effective_odds: Decimal | None
    counted: bool


@dataclass(frozen=True)
class ListReturn:
    """Result of the hypothetical calculation for one published list.

    `combined_odds` / `total_return` / `net` are `None` whenever the original
    odds set is incomplete, which is the explicit "unavailable" state.
    """

    stake: Decimal
    available: bool
    reason: str
    combined_odds: Decimal | None
    total_return: Decimal | None
    net: Decimal | None
    settled_fully: bool
    legs: tuple[LegReturn, ...]
    missing_odds_count: int


def _effective_odds(status: str, odds: Decimal | None) -> Decimal | None:
    """Odds actually used in the product, treating void as 1.00."""
    if status == LegStatus.VOID:
        return VOID_ODDS
    return odds


def compute_list_return(
    legs,
    *,
    stake: Decimal = DEFAULT_EXERCISE_STAKE,
    list_status: str | None = None,
) -> ListReturn:
    """Compute the hypothetical return for a published list's legs.

    `legs` is any iterable of objects exposing `provider_fixture_id`, `status`
    and `decimal_odds`.
    """
    stake = Decimal(str(stake))
    rows: list[LegReturn] = []
    missing = 0
    any_loss = False
    any_unsettled = False
    all_void = True

    for leg in legs:
        status = leg.status
        odds = Decimal(str(leg.decimal_odds)) if leg.decimal_odds is not None else None
        effective = _effective_odds(status, odds)

        if status == LegStatus.LOST:
            any_loss = True
        if status not in (LegStatus.WON, LegStatus.LOST, LegStatus.VOID):
            any_unsettled = True
        if status != LegStatus.VOID:
            all_void = False
        # A leg that is neither void nor priced cannot contribute a product.
        if effective is None and status != LegStatus.VOID:
            missing += 1

        rows.append(
            LegReturn(
                provider_fixture_id=leg.provider_fixture_id,
                status=status,
                odds=odds,
                effective_odds=effective,
                counted=effective is not None or status == LegStatus.VOID,
            )
        )

    settled_fully = not any_unsettled

    if missing:
        return ListReturn(
            stake=stake, available=False,
            reason="Original odds are incomplete for this list, so no monetary figure is shown.",
            combined_odds=None, total_return=None, net=None,
            settled_fully=settled_fully, legs=tuple(rows), missing_odds_count=missing,
        )

    combined = Decimal("1.0000")
    for row in rows:
        if row.effective_odds is not None:
            combined *= row.effective_odds

    if all_void and rows:
        return ListReturn(
            stake=stake, available=True, reason="Every selection was void; the stake is returned.",
            combined_odds=combined, total_return=stake, net=Decimal("0.00"),
            settled_fully=settled_fully, legs=tuple(rows), missing_odds_count=0,
        )

    if not settled_fully:
        # Before settlement these are POTENTIAL returns, never earnings.
        return ListReturn(
            stake=stake, available=True, reason="Not fully settled yet; figures are potential returns.",
            combined_odds=combined, total_return=None, net=None,
            settled_fully=False, legs=tuple(rows), missing_odds_count=0,
        )

    if any_loss:
        total = Decimal("0.00")
    else:
        total = stake * combined

    return ListReturn(
        stake=stake, available=True, reason="",
        combined_odds=combined, total_return=total, net=total - stake,
        settled_fully=True, legs=tuple(rows), missing_odds_count=0,
    )


def quantize_money(value: Decimal | None) -> Decimal | None:
    """Round a monetary value for display only (2 dp, half-up)."""
    if value is None:
        return None
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def quantize_odds(value: Decimal | None) -> Decimal | None:
    """Round combined odds for display only."""
    if value is None:
        return None
    return Decimal(value).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def summary_metrics(lists) -> dict:
    """Win/hit rates over published lists and their legs.

    Denominators are fixed by the specification:
      * full-list win rate = won / (won + lost)   — void and unresolved EXCLUDED
      * selection hit rate = won selections / (won + lost selections)
    Pending, void and unresolved counts are reported separately so they are never
    silently folded into a rate.
    """
    list_won = list_lost = list_void = list_pending = list_unresolved = 0
    sel_won = sel_lost = sel_void = sel_pending = sel_unresolved = 0
    for entry in lists:
        status = entry.status
        if status == OfficialListStatus.WON:
            list_won += 1
        elif status == OfficialListStatus.LOST:
            list_lost += 1
        elif status == OfficialListStatus.VOID:
            list_void += 1
        elif status == OfficialListStatus.UNRESOLVED:
            list_unresolved += 1
        else:
            list_pending += 1
        for leg in entry.legs.all():
            if leg.status == LegStatus.WON:
                sel_won += 1
            elif leg.status == LegStatus.LOST:
                sel_lost += 1
            elif leg.status == LegStatus.VOID:
                sel_void += 1
            elif leg.status == LegStatus.UNRESOLVED:
                sel_unresolved += 1
            else:
                sel_pending += 1

    list_denom = list_won + list_lost
    sel_denom = sel_won + sel_lost
    return {
        "lists": {
            "won": list_won, "lost": list_lost, "void": list_void,
            "pending": list_pending, "unresolved": list_unresolved,
            "denominator": list_denom,
            "win_rate": (Decimal(list_won) / Decimal(list_denom)) if list_denom else None,
        },
        "selections": {
            "won": sel_won, "lost": sel_lost, "void": sel_void,
            "pending": sel_pending, "unresolved": sel_unresolved,
            "denominator": sel_denom,
            "hit_rate": (Decimal(sel_won) / Decimal(sel_denom)) if sel_denom else None,
        },
    }