"""1Voucher adapter.

STATUS: NOT IMPLEMENTED. No official merchant redemption documentation is
available, so no endpoint, signature scheme, PIN format, fee or status
semantics are assumed here.

Public consumer site (1voucher.co.za) confirms only that 1Voucher is a cash
voucher with a PIN. Whether merchant voucher redemption is offered via an API,
and whether paid football-prediction analytics is an accepted merchant category,
are UNCONFIRMED and require written provider confirmation.

To implement, supply: redemption endpoint + auth model, PIN format, request and
response schema, status/idempotency mechanism (or state that none exists),
callback/signature details if any, fees, denominations and refund semantics.
"""

from django.conf import settings

from api.payments.base import DisabledProvider


class OneVoucherProvider(DisabledProvider):
    def __init__(self):
        super().__init__(name="1voucher")
        self.enabled = bool(getattr(settings, "PAYMENT_PROVIDER_ONEVOUCHER_ENABLED", False))