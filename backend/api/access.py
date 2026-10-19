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
import uuid
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


def start_checkout(*, user, product_code, idempotency_key):
    """Create (or replay) a PayFast checkout attempt for a server-owned product.

    Security rules, mirroring `start_purchase`:

      * Identity comes only from the authenticated request.
      * Price/duration come only from `AccessProduct`.
      * The merchant reference is generated server-side.
      * Replaying an idempotency key returns the existing attempt instead of
        creating a second one or a second payment.

    Returns `(attempt, fields, process_url)`. The caller must NOT treat this as
    payment: access is granted only later, by verified ITN handling.
    """
    from api.payments import payfast as payfast_gateway

    try:
        product = AccessProduct.objects.get(code=product_code, is_active=True)
    except AccessProduct.DoesNotExist:
        raise ProviderError("Unknown or inactive product.") from None

    if product.currency != "ZAR":
        raise ProviderError("PayFast requires a ZAR product.")

    # Fail closed BEFORE writing anything: a disabled/misconfigured gateway must
    # not leave a dangling pending attempt behind for every rejected request.
    payfast_gateway.require_checkout_readiness(product)

    now = timezone.now()
    attempt, created = PurchaseAttempt.objects.get_or_create(
        idempotency_key=idempotency_key,
        defaults={
            "user": user,
            "product": product,
            "provider": PurchaseAttempt.Provider.PAYFAST,
            "status": PurchaseAttempt.Status.CREATED,
            "amount_expected": product.price_amount,
            "currency": product.currency,
            # Unique, unguessable, and stable: this is what the ITN echoes back.
            "merchant_reference": f"PXI-{uuid.uuid4().hex}",
        },
    )

    # An existing key is a client retry, not a new payment. Rebuild the same
    # signed payload so the customer can resume; never redeem or charge again.
    fields, process_url = payfast_gateway.build_checkout_payload(
        attempt=attempt, product=product,
        email=getattr(user, "email", "") or "",
    )

    if created:
        attempt.status = PurchaseAttempt.Status.PENDING
        attempt.save(update_fields=["status", "updated_at"])

    return attempt, fields, process_url


class ITNRejected(Exception):
    """An ITN was well-formed enough to look up but failed a business check.

    Distinct from `PayFastITNError` (which is a cryptographic/source failure):
    this covers unknown references, amount mismatches, and attempts already in a
    final state. The view records it for reconciliation and still returns 200 so
    PayFast stops retrying.
    """

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def apply_payfast_itn(*, data, remote_addr, post=None):
    """Verify a PayFast ITN and, only if it passes every check, grant access.

    Returns `(attempt, outcome)` where outcome is one of:
      "granted"   - verified and access granted (or already granted)
      "declined"  - verified but the payment was CANCELLED/failed
      "recorded"  - verified but the attempt was already final (idempotent no-op)

    Raises `PayFastITNError` for cryptographic/source/server failures and
    `ITNRejected` for anything that cannot be tied to a live attempt. In BOTH
    cases nothing is granted.

    Idempotency: PayFast retries an ITN until it receives HTTP 200. Each retry
    re-runs verification, but `PassGrant.attempt` is OneToOne and the attempt
    row is locked, so a duplicate can never grant access twice.
    """
    from api.payments import payfast as payfast_gateway

    merchant_reference = str(data.get("m_payment_id") or "").strip()
    if not merchant_reference:
        raise ITNRejected("missing_reference")

    # One transaction for the whole notification: the row lock serializes
    # concurrent retries, and the grant + status write commit together or not
    # at all.
    with transaction.atomic():
        attempt = (
            PurchaseAttempt.objects.select_for_update()
            .filter(merchant_reference=merchant_reference)
            .select_related("product")
            .first()
        )
        if attempt is None or attempt.provider != PurchaseAttempt.Provider.PAYFAST:
            raise ITNRejected("unknown_reference")

        # The amount must match what THIS attempt was created with, checked
        # before the server round-trip so an obvious tamper costs one fewer
        # request.
        payfast_gateway.verify_itn_amount(attempt.amount_expected, data.get("amount_gross"))

        # Signature, source IP and PayFast's own server confirmation.
        payfast_gateway.verify_itn(data, remote_addr, post=post)

        now = timezone.now()

        # Already granted: a retry. Record the event for audit but change nothing.
        if attempt.status == PurchaseAttempt.Status.GRANTED:
            _record_itn_event(attempt, data)
            return attempt, "recorded"

        status_code = str(data.get("payment_status") or "").upper()
        attempt.provider_status = status_code[:40]
        attempt.pf_payment_id = str(data.get("pf_payment_id") or "")[:100]
        attempt.amount_gross = _decimal_or_none(data.get("amount_gross"))
        attempt.amount_fee = _decimal_or_none(data.get("amount_fee"))
        attempt.amount_net = _decimal_or_none(data.get("amount_net"))

        if status_code != "COMPLETE":
            # CANCELLED (and anything else) never grants access.
            attempt.status = PurchaseAttempt.Status.DECLINED
            attempt.failure_code = (status_code or "not_complete")[:80]
            attempt.failed_at = now
            attempt.save()
            _record_itn_event(attempt, data)
            return attempt, "declined"

        attempt.amount_confirmed = attempt.amount_gross
        attempt.paid_at = now
        attempt.status = PurchaseAttempt.Status.PROVIDER_CONFIRMED
        attempt.save()

        entitlement, _created = _entitlement_for(attempt, now)
        _grant_pass(attempt, entitlement, now)
        attempt.status = PurchaseAttempt.Status.GRANTED
        attempt.save()
        _record_itn_event(attempt, data)
        return attempt, "granted"


def _decimal_or_none(value):
    from decimal import Decimal, InvalidOperation
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError):
        return None


def _record_itn_event(attempt, data):
    """Append one audit row per PayFast event id, tolerating duplicates.

    The insert is wrapped in its own savepoint so a duplicate (which raises
    IntegrityError on the unique (provider, provider_event_id) constraint)
    cannot poison the surrounding transaction - without this, the caller's
    later queries would fail with TransactionManagementError.
    """
    event_id = str(data.get("pf_payment_id") or "").strip()
    if not event_id:
        return
    try:
        with transaction.atomic():
            PurchaseEvent.objects.create(
                attempt=attempt,
                provider=attempt.provider,
                provider_event_id=event_id,
                status=str(data.get("payment_status") or "")[:40],
                raw_status_code=str(data.get("payment_status") or "")[:40],
            )
    except IntegrityError:
        # Duplicate or out-of-order callback: the original row wins.
        logger.info("Duplicate PayFast ITN ignored for attempt %s", attempt.pk)