"""Purchase orchestration shared by all voucher providers.

Security rules enforced here (not in the views):

  * Identity comes only from the authenticated request; never from the body.
  * Price and duration come only from `AccessProduct`; never from the client.
  * A voucher PIN is used in memory and never logged, stored, or returned.
  * Access is granted exactly once per verified purchase, inside a single
    transaction, guarded by row locks AND unique constraints.
  * An `ambiguous` outcome is NEVER retried blindly.
  * A `PaymentEvent`/`PurchaseEvent` alone never grants access.
"""

import logging
from dataclasses import asdict
from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from api.models import (
    AccessEntitlement,
    AccessProduct,
    PassGrant,
    PurchaseAttempt,
    PurchaseEvent,
)
from api.payments.base import (
    ProviderError,
    ProviderNotConfigured,
    RedemptionRequest,
    RedemptionResult,
)
from api.payments.blu import BluVoucherProvider
from api.payments.onevoucher import OneVoucherProvider
from api.payments.ott import OttVoucherProvider

logger = logging.getLogger(__name__)

_PROVIDERS = {
    PurchaseAttempt.Provider.ONEVOUCHER: OneVoucherProvider,
    PurchaseAttempt.Provider.OTT: OttVoucherProvider,
    PurchaseAttempt.Provider.BLU: BluVoucherProvider,
}


def get_provider(name):
    """Return the adapter for a provider value, or None if unknown."""
    factory = _PROVIDERS.get(name)
    return factory() if factory else None


def provider_is_available(name):
    provider = get_provider(name)
    return bool(provider and provider.enabled)


def _grant_pass(attempt, entitlement, now):
    """Create the entitlement and its PassGrant inside the caller's transaction.

    The OneToOne on PassGrant.attempt raises IntegrityError on a second grant,
    so replay cannot double-grant.
    """
    PassGrant.objects.create(
        attempt=attempt,
        entitlement=entitlement,
        starts_at=entitlement.starts_at,
        ends_at=entitlement.ends_at,
    )


def _entitlement_for(attempt, now):
    """Grant, or extend, the entitlement for a confirmed purchase.

    Repeat purchase behaviour: extend from the current end when the pass is
    still active, otherwise start from now. Chosen by the owner (revisable).
    """
    duration = timedelta(days=attempt.product.duration_days)
    existing = (
        AccessEntitlement.objects.select_for_update()
        .filter(user=attempt.user, scope=attempt.product.scope, revoked_at__isnull=True, ends_at__gt=now)
        .order_by("-ends_at")
        .first()
    )
    if existing:
        existing.ends_at = existing.ends_at + duration
        existing.save(update_fields=["ends_at"])
        return existing, False
    entitlement = AccessEntitlement.objects.create(
        user=attempt.user,
        scope=attempt.product.scope,
        starts_at=now,
        ends_at=now + duration,
    )
    return entitlement, True


def _apply_result(attempt, result, now):
    """Apply a provider result. Caller holds the row lock and transaction."""
    attempt.provider_reference = result.provider_reference or attempt.provider_reference
    attempt.amount_confirmed = result.amount_confirmed

    if result.provider_event_id:
        try:
            PurchaseEvent.objects.create(
                attempt=attempt,
                provider=attempt.provider,
                provider_event_id=result.provider_event_id,
                status=result.outcome,
                raw_status_code=(result.status_code or "")[:40],
            )
        except IntegrityError:
            # Duplicate or out-of-order event. Not an error: the original wins.
            logger.info("Duplicate purchase event ignored for attempt %s", attempt.pk)

    if result.outcome == "declined":
        attempt.status = PurchaseAttempt.Status.DECLINED
        attempt.failure_code = (result.status_code or "declined")[:80]
        attempt.save()
        return attempt, None

    if result.outcome in {"ambiguous", "needs_review"}:
        # Do NOT grant, do NOT retry. A human or a reconciliation pass decides.
        attempt.status = PurchaseAttempt.Status.NEEDS_REVIEW
        attempt.failure_code = (result.status_code or result.outcome)[:80]
        attempt.save()
        return attempt, None

    # outcome == "confirmed"
    if result.amount_confirmed is None or result.amount_confirmed < attempt.amount_expected:
        # Underpayment is never granted access.
        attempt.status = PurchaseAttempt.Status.NEEDS_REVIEW
        attempt.failure_code = "amount_mismatch"
        attempt.save()
        return attempt, None

    attempt.status = PurchaseAttempt.Status.PROVIDER_CONFIRMED
    attempt.save()

    entitlement, _created = _entitlement_for(attempt, now)
    _grant_pass(attempt, entitlement, now)
    attempt.status = PurchaseAttempt.Status.GRANTED
    attempt.save()
    return attempt, entitlement


def start_purchase(*, user, product_code, provider_name, voucher_pin, idempotency_key):
    """Create (or replay) a purchase attempt and try to redeem once.

    Raises ProviderNotConfigured when the provider has no verified integration,
    which is the case for all three providers today.
    """
    provider = get_provider(provider_name)
    if provider is None:
        raise ProviderError("Unknown voucher provider.")

    try:
        product = AccessProduct.objects.get(code=product_code, is_active=True)
    except AccessProduct.DoesNotExist:
        raise ProviderError("Unknown or inactive product.") from None

    if not provider.enabled:
        raise ProviderNotConfigured(f"{provider.name} is not configured.")

    now = timezone.now()
    attempt, created = PurchaseAttempt.objects.get_or_create(
        idempotency_key=idempotency_key,
        defaults={
            "user": user,
            "product": product,
            "provider": provider_name,
            "status": PurchaseAttempt.Status.PENDING,
            "amount_expected": product.price_amount,
            "currency": product.currency,
        },
    )
    if not created:
        # Replay of a known key: return the existing outcome, never re-redeem.
        return attempt, attempt.grant.entitlement if hasattr(attempt, "grant") else None

    request = RedemptionRequest(
        reference=str(attempt.pk),
        voucher_pin=voucher_pin,
        amount_expected=product.price_amount,
        currency=product.currency,
    )

    try:
        result = provider.redeem(request)
    except ProviderNotConfigured:
        raise
    except ProviderError as error:
        # Generic failure: no PIN, no provider internals in the message.
        logger.warning("Provider redemption failed for attempt %s: %s", attempt.pk, error)
        result = RedemptionResult(outcome="declined", status_code="provider_error")

    with transaction.atomic():
        locked = PurchaseAttempt.objects.select_for_update().get(pk=attempt.pk)
        if locked.status == PurchaseAttempt.Status.GRANTED:
            return locked, getattr(locked, "grant", None) and locked.grant.entitlement
        return _apply_result(locked, result, now)


def result_for_owner(attempt, user):
    """Owner-scoped lookup. Returns None for any other user."""
    if attempt.user_id != user.pk:
        return None
    return attempt