"""Idempotently create a small tiered sandbox product catalogue.

Sandbox-only placeholder pricing (AI-chosen, volume-discounted day rate) pending a
real business pricing decision. Does NOT establish production pricing (see
docs/phase-6-payfast-access-passes.md S11.3). Leaves the existing
predictxi_test_7_days row untouched.
"""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "predictxi.settings")
django.setup()

from decimal import Decimal
from api.models import AccessProduct, AccessEntitlement

PRODUCTS = [
    {
        "code": "predictxi_pass_1_day",
        "name": "PredictXI 1-Day Pass",
        "price_amount": Decimal("19.00"),
        "currency": "ZAR",
        "duration_days": 1,
        "scope": AccessEntitlement.Scope.PREDICTIONS,
        "is_active": True,
    },
    {
        "code": "predictxi_pass_7_day",
        "name": "PredictXI 7-Day Pass",
        "price_amount": Decimal("59.00"),
        "currency": "ZAR",
        "duration_days": 7,
        "scope": AccessEntitlement.Scope.PREDICTIONS,
        "is_active": True,
    },
    {
        "code": "predictxi_pass_30_day",
        "name": "PredictXI 30-Day Pass",
        "price_amount": Decimal("149.00"),
        "currency": "ZAR",
        "duration_days": 30,
        "scope": AccessEntitlement.Scope.PREDICTIONS,
        "is_active": True,
    },
]

for defaults in PRODUCTS:
    code = defaults.pop("code")
    obj, created = AccessProduct.objects.update_or_create(code=code, defaults=defaults)
    print(("CREATED" if created else "UPDATED (already existed)"), "->", obj.code)
    print("  name=%r price=%s %s days=%s scope=%s active=%s"
          % (obj.name, obj.price_amount, obj.currency, obj.duration_days, obj.scope, obj.is_active))

print("total AccessProduct rows:", AccessProduct.objects.count())
