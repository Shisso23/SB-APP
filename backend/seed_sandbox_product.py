"""Idempotently create the PredictXI local sandbox test product.

Sandbox-only. This does NOT establish production pricing.
Follows existing AccessProduct conventions (see docs/phase-5-access-passes.md).
"""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "predictxi.settings")
django.setup()

from decimal import Decimal
from api.models import AccessProduct, AccessEntitlement

CODE = "predictxi_test_7_days"
DEFAULTS = {
    "name": "PredictXI 7-Day Test Pass",
    "price_amount": Decimal("5.00"),
    "currency": "ZAR",
    "duration_days": 7,
    "scope": AccessEntitlement.Scope.PREDICTIONS,
    "is_active": True,
}

obj, created = AccessProduct.objects.update_or_create(code=CODE, defaults=DEFAULTS)
print(("CREATED" if created else "UPDATED (already existed)"), "->", obj.code)
print("  name=%r price=%s %s days=%s scope=%s active=%s"
      % (obj.name, obj.price_amount, obj.currency, obj.duration_days, obj.scope, obj.is_active))
print("total AccessProduct rows:", AccessProduct.objects.count())