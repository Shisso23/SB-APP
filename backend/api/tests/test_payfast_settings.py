"""Phase 6 Stage 4: PayFast configuration and credential-hygiene guarantees.

Two properties matter here and are easy to regress silently:

  1. The integration ships DISABLED and UNCONFIGURED. No credential may ever
     be hardcoded in source, and the distributed example environment must
     contain placeholders, not values.
  2. Turning the flag on without real credentials must fail closed, so a
     half-configured deployment cannot start a checkout against the wrong
     account or emit an unreachable callback URL.

These assertions read source files rather than importing modules, so they catch
a secret that was added to a default even before the app is started.
"""
from pathlib import Path
import unittest

from django.test import SimpleTestCase, override_settings

from api.payments.payfast import (
    PayFastConfigurationError,
    PayFastUnavailable,
    require_checkout_readiness,
)

BACKEND = Path(__file__).resolve().parents[2]

# Values that must never appear as a settings default. The first two are the
# well-known PUBLIC PayFast sandbox test credentials published in the docs;
# even those are used in tests only, never as a shipped default.
PAYFAST_SANDBOX_TEST_VALUES = ["10000100", "46f0cd694581a", "jt7NOE43FZPn"]


class PayFastSourceHygieneTests(SimpleTestCase):
    def test_settings_define_no_credential_default(self):
        source = (BACKEND / "predictxi" / "settings.py").read_text()
        # merchant id / key / passphrase must default to empty, never to a value.
        for name in ["PAYFAST_MERCHANT_ID", "PAYFAST_MERCHANT_KEY", "PAYFAST_PASSPHRASE"]:
            with self.subTest(name=name):
                self.assertRegex(source, rf'{name}\s*=\s*env\(\s*"{name}"\s*,\s*default=""\s*\)')

    def test_no_payfast_credential_is_hardcoded_anywhere_in_source(self):
        for path in (BACKEND / "predictxi").rglob("*.py"):
            text = path.read_text()
            for value in PAYFAST_SANDBOX_TEST_VALUES:
                with self.subTest(path=path.name, value=value):
                    self.assertNotIn(value, text)
        for path in (BACKEND / "api").rglob("*.py"):
            if "tests" in path.parts:
                continue
            text = path.read_text()
            for value in PAYFAST_SANDBOX_TEST_VALUES:
                with self.subTest(path=path.name, value=value):
                    self.assertNotIn(value, text)

    def test_example_environment_has_empty_payfast_values(self):
        example = (BACKEND / ".env.example").read_text()
        values = {}
        for line in example.splitlines():
            if "=" in line and not line.strip().startswith("#"):
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip()
        for name in ["PAYFAST_MERCHANT_ID", "PAYFAST_MERCHANT_KEY", "PAYFAST_PASSPHRASE"]:
            with self.subTest(name=name):
                self.assertIn(name, values)
                self.assertEqual(values[name], "")
        self.assertEqual(values.get("PAYFAST_ENABLED"), "False")

    def test_example_environment_documents_sandbox_not_live(self):
        example = (BACKEND / ".env.example").read_text()
        self.assertIn("sandbox.payfast.co.za", example)
        # The live host must not be the shipped default, so nobody tests against
        # production by accident.
        self.assertNotIn("PAYFAST_PROCESS_URL=https://www.payfast.co.za", example)
        self.assertNotIn("PAYFAST_VALIDATE_URL=https://www.payfast.co.za", example)

    def test_frontend_source_contains_no_payfast_credential(self):
        repo = BACKEND.parent
        frontend = repo / "src"
        if not frontend.is_dir():
            self.skipTest("frontend source not present")
        offenders = []
        for path in frontend.rglob("*"):
            if path.is_dir() or path.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
                continue
            if path.name.endswith((".test.ts", ".test.tsx")):
                continue
            text = path.read_text(errors="ignore")
            if "PAYFAST_PASSPHRASE" in text or "merchant_passphrase" in text.lower():
                offenders.append(str(path.relative_to(repo)))
        self.assertEqual(offenders, [])


class PayFastFailClosedTests(SimpleTestCase):
    """A half-configured gateway must refuse, not guess."""

    @override_settings(PAYFAST_ENABLED=False)
    def test_disabled_refuses(self):
        with self.assertRaises(PayFastUnavailable):
            require_checkout_readiness()

    @override_settings(PAYFAST_ENABLED=True, PAYFAST_MERCHANT_ID="", PAYFAST_MERCHANT_KEY="key")
    def test_missing_merchant_id_refuses(self):
        with self.assertRaises(PayFastConfigurationError):
            require_checkout_readiness()

    @override_settings(PAYFAST_ENABLED=True, PAYFAST_MERCHANT_ID="id", PAYFAST_MERCHANT_KEY="")
    def test_missing_merchant_key_refuses(self):
        with self.assertRaises(PayFastConfigurationError):
            require_checkout_readiness()

    @override_settings(PAYFAST_ENABLED=True, PAYFAST_MERCHANT_ID="id",
                       PAYFAST_MERCHANT_KEY="key", PREDICTXI_SITE_URL="")
    def test_missing_site_url_refuses(self):
        # Without a public origin the ITN could never arrive, so starting a
        # checkout would silently produce an unpayable order.
        with self.assertRaises(PayFastConfigurationError):
            require_checkout_readiness()

    @override_settings(PAYFAST_ENABLED=True, PAYFAST_MERCHANT_ID="id",
                       PAYFAST_MERCHANT_KEY="key", PREDICTXI_SITE_URL="https://example.test")
    def test_fully_configured_passes(self):
        require_checkout_readiness()

    def test_default_flag_is_disabled(self):
        # The shipped default must be off; enabling is an explicit deployment act.
        source = (BACKEND / "predictxi" / "settings.py").read_text()
        self.assertRegex(source, r'PAYFAST_ENABLED\s*=\s*env\.bool\(\s*"PAYFAST_ENABLED"\s*,\s*default=False\s*\)')

    def test_notify_networks_default_to_documented_ranges(self):
        from django.conf import settings as django_settings
        networks = django_settings.PAYFAST_NOTIFY_NETWORKS
        self.assertIn("197.97.145.144/28", networks)
        self.assertIn("41.74.179.192/27", networks)
        self.assertIn("102.216.36.0/28", networks)
        self.assertIn("102.216.36.128/28", networks)
        self.assertIn("144.126.193.139/32", networks)