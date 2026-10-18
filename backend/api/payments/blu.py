"""Blu Voucher adapter.

STATUS: NOT IMPLEMENTED. The public site markets Blu Voucher as a way for
merchants to accept payment, but no merchant redemption API documentation is
published, so no endpoint, signature scheme or PIN format is assumed.

To implement, supply: redemption endpoint + auth model, PIN format, request and
response schema, status/idempotency mechanism (or state that none exists),
callback/signature details if any, fees, denominations and refund semantics.
"""

from django.conf import settings

from api.payments.base import DisabledProvider


class BluVoucherProvider(DisabledProvider):
    def __init__(self):
        super().__init__(name="blu")
        self.enabled = bool(getattr(settings, "PAYMENT_PROVIDER_BLU_ENABLED", False))