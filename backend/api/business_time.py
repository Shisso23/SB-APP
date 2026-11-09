"""Business-time helpers for the official daily betting list.

Money and business *dates* are deliberately separated from storage time:

  * Every timestamp column stays UTC (`USE_TZ=True`), as everywhere else in this
    project.
  * A "business date" is the calendar date in the configured business timezone
    (default `Africa/Johannesburg`). Publication, reconciliation and the public
    history all key off that date, so a job that runs just after midnight in
    Johannesburg does not land on the wrong day.

Nothing here reads the wall clock directly: callers pass `now`, which keeps every
function deterministic under test.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.utils import timezone

#: Fallback used when settings are unavailable (e.g. a bare import in a script).
DEFAULT_BUSINESS_TIMEZONE = "Africa/Johannesburg"


class BusinessTimezoneError(Exception):
    """The configured business timezone is missing or not a valid zone."""


def business_timezone() -> ZoneInfo:
    """Return the configured business timezone as a `ZoneInfo`.

    Raises rather than silently falling back to UTC: a wrong business date would
    publish the official list against the wrong day, which is worse than failing.
    """
    name = getattr(settings, "PREDICTXI_BUSINESS_TIMEZONE", DEFAULT_BUSINESS_TIMEZONE)
    if not name:
        raise BusinessTimezoneError("PREDICTXI_BUSINESS_TIMEZONE is empty.")
    try:
        return ZoneInfo(str(name))
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise BusinessTimezoneError(f"Unknown business timezone: {name!r}") from exc


def local_now(now: datetime | None = None) -> datetime:
    """`now` (default: current instant) expressed in the business timezone."""
    moment = now or timezone.now()
    if timezone.is_naive(moment):
        moment = timezone.make_aware(moment, dt_timezone.utc)
    return moment.astimezone(business_timezone())


def business_date(now: datetime | None = None) -> date:
    """The business date that `now` falls on."""
    return local_now(now).date()


def business_day_bounds(day: date) -> tuple[datetime, datetime]:
    """Return `(start_utc, end_utc)` for a business date.

    `end_utc` is exclusive, so consecutive days never overlap and a fixture at
    exactly midnight belongs to the day that is starting, not the one ending.
    """
    tz = business_timezone()
    start_local = datetime.combine(day, time.min, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(dt_timezone.utc), end_local.astimezone(dt_timezone.utc)


def publication_deadline(day: date) -> tuple[int, int]:
    """Return the configured `(hour, minute)` deadline for publishing `day`.

    The list must be published *before* the earliest included kickoff; that hard
    rule is enforced separately by the publisher. This is only the scheduled
    target time.
    """
    hour = int(getattr(settings, "PREDICTXI_PUBLISH_HOUR", 6))
    minute = int(getattr(settings, "PREDICTXI_PUBLISH_MINUTE", 0))
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise BusinessTimezoneError("Publish schedule must be a valid time of day.")
    return hour, minute


def publication_target(day: date) -> datetime:
    """The UTC instant by which `day`'s list is scheduled to be published."""
    hour, minute = publication_deadline(day)
    tz = business_timezone()
    local = datetime.combine(day, time(hour, minute), tzinfo=tz)
    return local.astimezone(dt_timezone.utc)


def recent_business_dates(count: int, now: datetime | None = None) -> list[date]:
    """The `count` most recent business dates, newest first, including today.

    Dates with no published list are included on purpose: the public history must
    show gaps rather than quietly skipping them.
    """
    if count <= 0:
        return []
    today = business_date(now)
    return [today - timedelta(days=offset) for offset in range(count)]