import os
from pathlib import Path
import subprocess
import sys
import unittest


BACKEND = Path(__file__).resolve().parents[2]


class SettingsTests(unittest.TestCase):
    def load_settings(self, changes):
        environment = {name: value for name, value in os.environ.items()
                       if not name.startswith(("DJANGO_", "DATABASE_", "API_FOOTBALL_", "FIREBASE_"))}
        environment.update({
            "DJANGO_SECRET_KEY": "unit-test-only-not-a-production-secret-" * 2,
            "DATABASE_URL": "postgresql://localhost/predictxi_configuration_test",
            **changes,
        })
        return subprocess.run(
            [sys.executable, "-c", "from predictxi import settings; print(settings.DEBUG, settings.DATABASES['default']['ENGINE'], settings.SECURE_SSL_REDIRECT)"],
            cwd=BACKEND, env=environment, capture_output=True, text=True, timeout=10,
        )

    def test_postgresql_and_secure_defaults(self):
        result = self.load_settings({})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("False django.db.backends.postgresql True", result.stdout)

    def test_no_sqlite_fallback(self):
        for url in ["", "sqlite:///db.sqlite3", "mysql://localhost/example"]:
            with self.subTest(url=url):
                result = self.load_settings({"DATABASE_URL": url})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("must explicitly configure PostgreSQL", result.stderr)

    def test_missing_database_is_rejected(self):
        result = self.load_settings({"DATABASE_URL": "postgresql://localhost/"})
        self.assertNotEqual(result.returncode, 0)

    def test_placeholder_and_short_secrets_are_rejected(self):
        for secret in ["", "short", "replace-" + "x" * 60]:
            with self.subTest(length=len(secret)):
                self.assertNotEqual(self.load_settings({"DJANGO_SECRET_KEY": secret}).returncode, 0)

    def test_wildcard_host_is_rejected(self):
        self.assertNotEqual(self.load_settings({"DJANGO_ALLOWED_HOSTS": "*"}).returncode, 0)

    def test_only_isolated_test_database_names_are_accepted(self):
        self.assertNotEqual(self.load_settings({"DJANGO_TEST_DATABASE_NAME": "production"}).returncode, 0)

    def test_frontend_environment_is_not_a_settings_source(self):
        result = self.load_settings({"REACT_APP_API_KEY": "frontend-placeholder", "X_API_SPORTS_KEY": "frontend-placeholder"})
        self.assertEqual(result.returncode, 0, result.stderr)
        code = (BACKEND / "predictxi" / "settings.py").read_text()
        self.assertNotIn("read_env", code)
        self.assertNotIn("REACT_APP_", code)