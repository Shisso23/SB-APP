import os
from pathlib import Path
import subprocess
import sys
import unittest


BACKEND = Path(__file__).resolve().parents[2]


class SettingsTests(unittest.TestCase):
    def _environment(self, changes):
        environment = {name: value for name, value in os.environ.items()
                       if not name.startswith(("DJANGO_", "DATABASE_", "API_FOOTBALL_", "FIREBASE_", "GOOGLE_"))}
        environment.update({
            "DJANGO_SECRET_KEY": "unit-test-only-not-a-production-secret-" * 2,
            "DATABASE_URL": "postgresql://localhost/predictxi_configuration_test",
            **changes,
        })
        return environment

    def load_settings(self, changes):
        return subprocess.run(
            [sys.executable, "-c", "from predictxi import settings; print(settings.DEBUG, settings.DATABASES['default']['ENGINE'], settings.SECURE_SSL_REDIRECT)"],
            cwd=BACKEND, env=self._environment(changes), capture_output=True, text=True, timeout=10,
        )

    def load_firebase_project_id(self, changes):
        return subprocess.run(
            [sys.executable, "-c", "from predictxi import settings; print(settings.FIREBASE_PROJECT_ID)"],
            cwd=BACKEND, env=self._environment(changes), capture_output=True, text=True, timeout=10,
        )

    def load_settings(self, changes):
        return subprocess.run(
            [sys.executable, "-c", "from predictxi import settings; print(settings.DEBUG, settings.DATABASES['default']['ENGINE'], settings.SECURE_SSL_REDIRECT)"],
            cwd=BACKEND, env=self._environment(changes), capture_output=True, text=True, timeout=10,
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

    def test_firebase_credentials_resolve_from_relative_path(self):
        result = self.load_firebase_project_id({
            "FIREBASE_CREDENTIALS_FILE": ".secrets/firebase-service-account.json",
            "FIREBASE_PROJECT_ID": "predcitz-backend",
        })
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "predcitz-backend")

    def test_firebase_credentials_accept_the_standard_sdk_variable(self):
        result = self.load_firebase_project_id({
            "GOOGLE_APPLICATION_CREDENTIALS": ".secrets/firebase-service-account.json",
            "FIREBASE_PROJECT_ID": "predcitz-backend",
        })
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "predcitz-backend")

    def test_missing_firebase_credentials_file_fails_loudly(self):
        result = self.load_firebase_project_id({"FIREBASE_CREDENTIALS_FILE": ".secrets/definitely-missing.json"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("readable service-account file", result.stderr)

    def test_example_environment_contains_no_provider_key(self):
        example = (BACKEND / ".env.example").read_text()
        self.assertNotIn("10a431e50d961756f81938b1c9733eae", example)
        self.assertNotIn("4372e5ba5bmsh28397c7eaf9cd14p11bd2fjsnbdd07523cbbd", example)
        self.assertRegex(example, r"FIREBASE_CREDENTIALS_FILE=\.secrets/firebase-service-account\.json")