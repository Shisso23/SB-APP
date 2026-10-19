"""PayFast checkout integration (Phase 6).

This module implements ONLY the parts of PayFast's current Custom Integration
that PredictXI needs to *start* a payment:

  * build the checkout form fields ("Step 1: Create your checkout form"), and
  * generate the signature ("Step 2: Create security signature").

ITN verification ("Step 4: Confirm payment is successful") lives in a separate
stage/module so the two concerns can be reviewed independently.

Reference: https://developers.payfast.co.za/docs (Custom Payment Integration).

Signature rules, quoted from that page and implemented exactly here:

  1. Concatenate the non-blank name/value pairs with "&", in the ORDER the
     fields appear in the documentation's attribute list. PayFast explicitly
     says: "Do not use the API signature format, which uses alphabetical
     ordering!"
  2. URL-encode with UPPERCASE percent-encoding and spaces as "+".
  3. Append the merchant passphrase to the end ("&passphrase=...") if one is
     set on the account.
  4. MD5 the resulting string; the hex digest is lower case.

Nothing here talks to the network and nothing here reads credentials from
anywhere except Django settings (which come from the backend environment).
No frontend code ever sees a credential or this signature's inputs.
"""

from __future__ import annotations

import hashlib
import urllib.parse

from django.conf import settings

__all__ = [
    "PayFastConfigurationError",
    "PayFastUnavailable",
    "PayFastITNError",
    "generate_signature",
    "build_checkout_payload",
    "require_checkout_readiness",
    "callback_urls",
    "verify_itn_signature",
    "verify_itn_source",
    "verify_itn_amount",
    "verify_itn_with_server",
    "verify_itn",
    "ip_is_allowed",
    "amounts_match",
]


class PayFastConfigurationError(Exception):
    """PayFast is enabled but the backend environment is incomplete.

    Raised BEFORE any payload is built so a half-configured integration fails
    closed instead of emitting a checkout with a blank merchant id or an
    unreachable notify_url.
    """


class PayFastUnavailable(Exception):
    """PayFast is disabled by configuration. Callers surface a generic error."""


# The exact field order from PayFast's checkout documentation. Only the fields
# PredictXI actually sends are listed; the relative order of the rest must be
# preserved if more are added later, because the signature covers this order.
CHECKOUT_FIELD_ORDER = (
    "merchant_id",
    "merchant_key",
    "return_url",
    "cancel_url",
    "notify_url",
    "name_first",
    "name_last",
    "email_address",
    "cell_number",
    "m_payment_id",
    "amount",
    "item_name",
    "item_description",
    "custom_int1",
    "custom_int2",
    "custom_int3",
    "custom_int4",
    "custom_int5",
    "custom_str1",
    "custom_str2",
    "custom_str3",
    "custom_str4",
    "custom_str5",
    "email_confirmation",
    "confirmation_address",
    "payment_method",
)


def _encode(value) -> str:
    """URL-encode a value the way PayFast requires for signatures.

    `quote_plus` encodes spaces as "+" and defaults to uppercase percent
    escapes, matching "The resultant URL encoding must be in upper case".
    """
    return urllib.parse.quote_plus(str(value).strip())


def generate_signature(data: dict, passphrase: str | None = None) -> str:
    """Return the lower-case MD5 signature for a checkout/ITN payload.

    `data` is hashed in `CHECKOUT_FIELD_ORDER`; any key outside that order is
    appended afterwards so a caller cannot accidentally drop a field.
    Blank values are skipped, per PayFast ("non-blank variables"). The
    `signature` key itself must never be part of the hash.
    """
    ordered_keys = [key for key in CHECKOUT_FIELD_ORDER if key in data]
    ordered_keys += [key for key in data if key not in CHECKOUT_FIELD_ORDER]

    pairs = [
        f"{key}={_encode(data[key])}"
        for key in ordered_keys
        if key != "signature" and data.get(key) not in (None, "")
    ]

    param_string = "&".join(pairs)
    if passphrase:
        param_string += f"&passphrase={_encode(passphrase)}"
    return hashlib.md5(param_string.encode("utf-8")).hexdigest()


def _require_configuration() -> tuple[str, str, str, str]:
    """Return (merchant_id, merchant_key, passphrase, site_url) or raise.

    Fails closed: a missing credential or an unset public site URL is a
    configuration error, never a silently broken checkout.
    """
    if not getattr(settings, "PAYFAST_ENABLED", False):
        raise PayFastUnavailable("PayFast is disabled.")

    merchant_id = (getattr(settings, "PAYFAST_MERCHANT_ID", "") or "").strip()
    merchant_key = (getattr(settings, "PAYFAST_MERCHANT_KEY", "") or "").strip()
    passphrase = (getattr(settings, "PAYFAST_PASSPHRASE", "") or "").strip()
    site_url = (getattr(settings, "PREDICTXI_SITE_URL", "") or "").strip().rstrip("/")

    if not merchant_id or not merchant_key:
        raise PayFastConfigurationError("PayFast merchant credentials are not configured.")
    if not site_url:
        # Without a public origin, notify_url/return_url/cancel_url would point
        # nowhere and PayFast could never confirm the payment.
        raise PayFastConfigurationError("PREDICTXI_SITE_URL is required for PayFast callbacks.")
    return merchant_id, merchant_key, passphrase, site_url


def require_checkout_readiness(product=None) -> None:
    """Assert the gateway and (optionally) the product are safe to charge.

    Called BEFORE any database write so a disabled or misconfigured gateway
    cannot leave a dangling pending attempt behind. Raises
    `PayFastUnavailable` / `PayFastConfigurationError`; the caller maps both to
    one generic client message.
    """
    _require_configuration()
    if product is not None:
        amount = product.price_amount
        if amount is None or amount <= 0:
            raise PayFastConfigurationError("The selected product has no payable price.")
        minimum = getattr(settings, "PAYFAST_MIN_AMOUNT", "5.00")
        if amount < type(amount)(str(minimum)):
            # PayFast documents a ZAR 5.00 floor; refuse rather than emit a
            # doomed checkout (sandbox tolerates it, live does not).
            raise PayFastConfigurationError("The selected product price is below the PayFast minimum.")


def callback_urls() -> dict:
    """Return the three absolute URLs PayFast needs, built from settings.

    These are server-owned: the frontend may not choose them, otherwise a
    caller could redirect the ITN (and therefore entitlement granting) to a
    host they control.
    """
    site_url = (getattr(settings, "PREDICTXI_SITE_URL", "") or "").strip().rstrip("/")
    return {
        "return_url": f"{site_url}/api/v1/payments/payfast/return/",
        "cancel_url": f"{site_url}/api/v1/payments/payfast/cancel/",
        "notify_url": f"{site_url}/api/v1/payments/payfast/itn/",
    }


def build_checkout_payload(*, attempt, product, email: str = "", first_name: str = "", last_name: str = "") -> tuple[dict, str]:
    """Build the signed checkout fields for one purchase attempt.

    Returns `(fields, process_url)`.

    SECURITY: the amount is taken ONLY from `product.price_amount` (a server
    row). The caller cannot influence price, currency, or the merchant
    reference. `m_payment_id` is our own attempt reference, which is echoed
    back on the ITN so the notification can be tied to exactly this attempt.
    """
    merchant_id, merchant_key, passphrase, _site_url = _require_configuration()
    require_checkout_readiness(product)

    amount = product.price_amount

    fields = {
        "merchant_id": merchant_id,
        "merchant_key": merchant_key,
        **callback_urls(),
        "name_first": (first_name or "PredictXI")[:100],
        "name_last": (last_name or "Customer")[:100],
        "email_address": email[:100],
        "m_payment_id": attempt.merchant_reference,
        "amount": f"{amount:.2f}",
        "item_name": f"{product.name}"[:100],
        "item_description": f"{product.duration_days}-day access to premium predictions"[:255],
        # Echoed back on the ITN; used to re-confirm the attempt server-side.
        "custom_str1": str(attempt.pk),
        "custom_str2": product.code[:255],
        "custom_int1": int(product.duration_days),
    }
    fields["signature"] = generate_signature(fields, passphrase)
    return fields, getattr(settings, "PAYFAST_PROCESS_URL", "")


# ---------------------------------------------------------------------------
# ITN verification ("Step 4: Confirm payment is successful")
#
# PayFast documents FOUR checks that must ALL pass before a payment is treated
# as real. They are implemented here as small, independently testable
# functions so the view stays readable and each rule can be asserted on its own:
#
#   1. pfValidSignature        - recompute the MD5 and compare
#   2. pfValidIP               - source address inside PayFast's ranges
#   3. pfValidPaymentData      - amount_gross matches what we expected
#   4. pfValidServerConfirmation - POST the payload back; must return "VALID"
#
# A failure at ANY step must not grant access. The caller decides whether to
# record the attempt as needs_review for reconciliation.
# ---------------------------------------------------------------------------

# The ITN parameter order is the order PayFast posts the fields in. PayFast's
# own sample builds the signature string from the posted order and stops at
# `signature`, so the signature must be reconstructed from the RAW posted
# order - not from an alphabetically sorted dict, and not from a re-ordered
# field list like the checkout payload uses.
ITN_TERMINATOR = "signature"


class PayFastITNError(Exception):
    """An ITN failed one of PayFast's documented verification checks.

    `code` is a short, non-sensitive reason used for the audit trail. It never
    contains the signature, credentials, or the raw payload.
    """

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _encoded_itn_string(data: dict) -> str:
    """Rebuild the exact string PayFast signed, from the posted field order.

    Blank values are still included when PayFast includes them, but PayFast
    omits blank fields entirely, so we mirror the checkout rule and skip
    blanks while preserving the posted order.
    """
    pairs = [
        f"{key}={_encode(value)}"
        for key, value in data.items()
        if key != ITN_TERMINATOR and value not in (None, "")
    ]
    return "&".join(pairs)


def verify_itn_signature(data: dict, passphrase: str | None = None) -> None:
    """Raise `PayFastITNError("invalid_signature")` unless the MD5 matches."""
    provided = str(data.get(ITN_TERMINATOR) or "").strip().lower()
    if not provided:
        raise PayFastITNError("missing_signature")

    param_string = _encoded_itn_string(data)
    if passphrase:
        param_string += f"&passphrase={_encode(passphrase)}"
    expected = hashlib.md5(param_string.encode("utf-8")).hexdigest()

    # Constant-time compare so a caller cannot learn the signature byte by byte.
    import hmac

    if not hmac.compare_digest(expected, provided):
        raise PayFastITNError("invalid_signature")


def ip_is_allowed(remote_addr: str, networks=None) -> bool:
    """Return True when `remote_addr` falls inside a documented PayFast range.

    Only the source address is trusted; `HTTP_REFERER`/`X-Forwarded-For` are
    attacker-controlled and are deliberately never consulted.
    """
    import ipaddress

    if not remote_addr:
        return False
    try:
        address = ipaddress.ip_address(remote_addr.strip())
    except ValueError:
        return False

    configured = networks or getattr(settings, "PAYFAST_NOTIFY_NETWORKS", []) or []
    for cidr in configured:
        try:
            if address in ipaddress.ip_network(str(cidr), strict=False):
                return True
        except ValueError:
            # A malformed allowlist entry must never widen access.
            continue
    return False


def verify_itn_source(remote_addr: str) -> None:
    """Raise `PayFastITNError("invalid_source")` for a non-PayFast IP."""
    if not ip_is_allowed(remote_addr):
        raise PayFastITNError("invalid_source")


def amounts_match(expected, gross) -> bool:
    """Compare money with PayFast's documented 0.01 tolerance.

    PayFast's own reference is `!(abs(expected - amount_gross) > 0.01)`, i.e.
    a difference of up to one cent is accepted. Anything larger fails.
    """
    from decimal import Decimal, InvalidOperation

    try:
        expected_value = Decimal(str(expected))
        gross_value = Decimal(str(gross))
    except (InvalidOperation, TypeError):
        return False
    return abs(expected_value - gross_value) <= Decimal("0.01")


def verify_itn_amount(expected, gross) -> None:
    """Raise `PayFastITNError("invalid_amount")` when amount_gross is wrong."""
    if not amounts_match(expected, gross):
        raise PayFastITNError("invalid_amount")


def verify_itn_with_server(data: dict, post=None) -> None:
    """POST the ITN back to PayFast; the response must be exactly "VALID".

    This is the check that makes a forged-yet-well-signed callback useless: an
    attacker who somehow knows the passphrase still cannot make PayFast's own
    server confirm a transaction that does not exist.

    `post` is injectable so tests never perform real network I/O.
    """
    import requests

    validate_url = (getattr(settings, "PAYFAST_VALIDATE_URL", "") or "").strip()
    if not validate_url:
        raise PayFastITNError("validate_not_configured")

    payload = {key: value for key, value in data.items() if value not in (None, "")}
    sender = post or requests.post
    try:
        response = sender(validate_url, data=payload, timeout=10)
    except Exception:  # network error - fail closed, never grant
        raise PayFastITNError("validate_unreachable") from None

    if getattr(response, "status_code", None) != 200:
        raise PayFastITNError("validate_failed")
    if (getattr(response, "text", "") or "").strip() != "VALID":
        raise PayFastITNError("validate_failed")


def verify_itn(data: dict, remote_addr: str, *, post=None) -> None:
    """Run all four documented PayFast checks in order. Raises on any failure.

    The passphrase is read from settings here (never from the request), so a
    caller cannot influence the verification key.
    """
    passphrase = (getattr(settings, "PAYFAST_PASSPHRASE", "") or "").strip()
    verify_itn_signature(data, passphrase)
    verify_itn_source(remote_addr)
    # Amount must be checked against our stored expectation by the caller,
    # which owns the attempt row; that happens before this server round-trip.
    verify_itn_with_server(data, post=post)