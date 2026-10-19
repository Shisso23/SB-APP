from pathlib import Path
import os
from urllib.parse import urlsplit

import environ
from django.core.exceptions import ImproperlyConfigured


BASE_DIR = Path(__file__).resolve().parent.parent

# Load the git-ignored local backend env file when present.
#
# This is backend/.env (NOT the frontend root .env) and is optional: real
# environments should inject variables directly. Existing variables always win, so
# a deployed environment is never overridden by a stray local file. Set
# DJANGO_IGNORE_LOCAL_ENV_FILE=1 to skip it entirely (used by configuration tests
# so a developer's local file cannot change their outcome).
_local_env = BASE_DIR / ".env"
_ignore_local_env = os.environ.get("DJANGO_IGNORE_LOCAL_ENV_FILE", "").strip().lower() in {"1", "true", "yes", "on"}
if _local_env.is_file() and not _ignore_local_env:
    environ.Env.read_env(str(_local_env))

env = environ.Env()

SECRET_KEY = env("DJANGO_SECRET_KEY")
if len(SECRET_KEY) < 50 or SECRET_KEY.startswith("replace-"):
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be a private random value of at least 50 characters.")

DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])
if "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must list explicit hosts.")

try:
    database_url = env("DATABASE_URL")
    if urlsplit(database_url).scheme not in {"postgres", "postgresql"}:
        raise ValueError
    database = env.db_url("DATABASE_URL")
    if not database.get("NAME"):
        raise ValueError
except (ValueError, ImproperlyConfigured):
    raise ImproperlyConfigured("DATABASE_URL must explicitly configure PostgreSQL.") from None

DATABASES = {"default": {**database, "CONN_MAX_AGE": 0}}
test_database_name = env("DJANGO_TEST_DATABASE_NAME", default="")
if test_database_name:
    if not test_database_name.startswith("test_predictxi_"):
        raise ImproperlyConfigured("DJANGO_TEST_DATABASE_NAME must start with test_predictxi_.")
    DATABASES["default"]["TEST"] = {"NAME": test_database_name}

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "rest_framework",
    "corsheaders",
    "api.apps.ApiConfig",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
]
ROOT_URLCONF = "predictxi.urls"
WSGI_APPLICATION = "predictxi.wsgi.application"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "api.User"
USE_TZ = True
TIME_ZONE = "UTC"
LANGUAGE_CODE = "en-us"
APPEND_SLASH = False

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["api.authentication.FirebaseAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}
CORS_ALLOWED_ORIGINS = env.list("DJANGO_CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = False
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])
SECURE_SSL_REDIRECT = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = 0 if DEBUG else 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = False

FIREBASE_PROJECT_ID = env("FIREBASE_PROJECT_ID", default="predcitz-backend")

# Where the Firebase Admin service-account JSON lives.
#
# Resolution order (first non-empty wins):
#   1. FIREBASE_CREDENTIALS_FILE  - explicit project setting (preferred)
#   2. GOOGLE_APPLICATION_CREDENTIALS - the standard Google SDK variable
# The file is PRIVATE. Keep it under backend/.secrets/ (git-ignored, mode 600) and
# never commit it. An empty value means "use Application Default Credentials".
FIREBASE_CREDENTIALS_FILE = (
    env("FIREBASE_CREDENTIALS_FILE", default="")
    or env("GOOGLE_APPLICATION_CREDENTIALS", default="")
)

if FIREBASE_CREDENTIALS_FILE:
    credentials_path = Path(FIREBASE_CREDENTIALS_FILE).expanduser()
    if not credentials_path.is_absolute():
        credentials_path = (BASE_DIR / credentials_path).resolve()
    if not credentials_path.is_file():
        raise ImproperlyConfigured(
            "FIREBASE_CREDENTIALS_FILE does not point to a readable service-account file."
        )
    FIREBASE_CREDENTIALS_FILE = str(credentials_path)

API_FOOTBALL_KEY = env("API_FOOTBALL_KEY", default="")

# ---------------------------------------------------------------------------
# Voucher access-pass providers (Phase 5)
#
# Every provider integration is INDEPENDENT and defaults to DISABLED. Three
# separate flags, one per provider: enabling one never enables another.
#
# Do NOT enable any provider until:
#   1. official merchant redemption documentation has been supplied, and
#   2. the provider has confirmed IN WRITING that paid football-prediction
#      analytics is an accepted merchant category.
#
# No endpoint, credential, signature scheme or voucher format is configured
# here, because none has been verified. Supply provider details as separate
# settings only once documented.
# ---------------------------------------------------------------------------
PAYMENT_PROVIDER_ONEVOUCHER_ENABLED = env.bool("PAYMENT_PROVIDER_ONEVOUCHER_ENABLED", default=False)
PAYMENT_PROVIDER_OTT_ENABLED = env.bool("PAYMENT_PROVIDER_OTT_ENABLED", default=False)
PAYMENT_PROVIDER_BLU_ENABLED = env.bool("PAYMENT_PROVIDER_BLU_ENABLED", default=False)

# ---------------------------------------------------------------------------
# PayFast (Phase 6)
#
# CREDENTIALS ARE BACKEND-ONLY. merchant_id, merchant_key and passphrase are
# never sent to, stored in, or read by the frontend. The frontend only receives
# a server-built, signed checkout payload and the process URL.
#
# Everything is DISABLED/UNCONFIGURED by default: the integration must be
# explicitly turned on AND given credentials before it can start a checkout.
# There is no hardcoded fallback merchant id/key/passphrase - unlike some
# reference implementations, this project never ships credentials in source.
#
# Sandbox vs live differ ONLY by these values (credentials + the two URLs).
# ---------------------------------------------------------------------------
PAYFAST_ENABLED = env.bool("PAYFAST_ENABLED", default=False)
PAYFAST_MERCHANT_ID = env("PAYFAST_MERCHANT_ID", default="")
PAYFAST_MERCHANT_KEY = env("PAYFAST_MERCHANT_KEY", default="")
# The passphrase is the "salt" appended to the signature parameter string. It is
# optional per PayFast, but when set it MUST be appended (both at checkout and
# when verifying an ITN) or every signature comparison fails.
PAYFAST_PASSPHRASE = env("PAYFAST_PASSPHRASE", default="")
# Checkout form POST target.
PAYFAST_PROCESS_URL = env("PAYFAST_PROCESS_URL", default="https://sandbox.payfast.co.za/eng/process")
# Server-to-server ITN confirmation endpoint; a POST must return exactly "VALID".
PAYFAST_VALIDATE_URL = env("PAYFAST_VALIDATE_URL", default="https://sandbox.payfast.co.za/eng/query/validate")
# Public base URL of THIS backend. PayFast posts the ITN here and redirects the
# customer to return/cancel here, so it must be reachable from the internet.
# Empty means "not configured": checkout initiation is refused rather than
# silently emitting an unreachable notify_url.
PREDICTXI_SITE_URL = env("PREDICTXI_SITE_URL", default="").rstrip("/")
# PayFast posts ITNs from these source ranges (documented under "Ports and IP
# addresses"). Request IPs outside them are rejected before any state change.
PAYFAST_NOTIFY_NETWORKS = env.list("PAYFAST_NOTIFY_NETWORKS", default=[
    "197.97.145.144/28",
    "41.74.179.192/27",
    "102.216.36.0/28",
    "102.216.36.128/28",
    "144.126.193.139/32",
])
# Refuse values below PayFast's documented live minimum of ZAR 5.00 so a
# misconfigured product cannot produce a checkout the gateway will reject.
PAYFAST_MIN_AMOUNT = env("PAYFAST_MIN_AMOUNT", default="5.00")