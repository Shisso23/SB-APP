"""OTT Voucher adapter.

STATUS: NOT IMPLEMENTED. No official merchant redemption documentation is
available, and the public site could not be read during planning, so nothing
about this provider's merchant capabilities is confirmed.

To implement, supply: redemption endpoint + auth model, PIN format, request and
response schema, status/idempotency mechanism (or state that none exists),
callback/signature details if any, fees, denominations and refund semantics.
"""

from django.conf import settings

from api.payments.base import DisabledProvider


class OttVoucherProvider(DisabledProvider):
    def __init__(self):
        super().__init__(name="ott")
        self.enabled = bool(getattr(settings, "PAYMENT_PROVIDER_OTT_ENABLED", False))