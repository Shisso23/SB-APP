"""Read-only readiness summary for the local sandbox. Prints no secrets."""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "predictxi.settings")
django.setup()

from django.conf import settings as s
from api.models import AccessProduct
from api.payments import payfast

print("PAYFAST_ENABLED :", s.PAYFAST_ENABLED)
print("PROCESS host    :", s.PAYFAST_PROCESS_URL.split("/")[2] if s.PAYFAST_PROCESS_URL else "")
print("VALIDATE host   :", s.PAYFAST_VALIDATE_URL.split("/")[2] if s.PAYFAST_VALIDATE_URL else "")
print("SITE_URL        :", s.PREDICTXI_SITE_URL)
print("MIN_AMOUNT      :", s.PAYFAST_MIN_AMOUNT)

for p in AccessProduct.objects.all():
    print("PRODUCT         : code=%s price=%s %s days=%s active=%s"
          % (p.code, p.price_amount, p.currency, p.duration_days, p.is_active))

print("--- callback URLs the server would send ---")
for k, v in payfast.callback_urls().items():
    print("  %-11s %s" % (k, v))

print("--- readiness gate ---")
try:
    payfast.require_checkout_readiness(AccessProduct.objects.get(code="predictxi_test_7_days"))
    print("  OK - checkout would start (config-level only; says nothing about reachability)")
except Exception as e:
    print("  BLOCKED ->", type(e).__name__, e)