from pathlib import Path
import os
from urllib.parse import urlsplit

import environ
from django.core.exceptions import ImproperlyConfigured


BASE_DIR = Path(__file__).resolve().parent.parent

# Load the git-ignored local backend env file when present.
#
# This is this repo's own .env (NOT the PredictXI frontend's .env, which lives in
# a separate repository) and is optional: real
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
# Default header allowlist plus the client's checkout idempotency header.
from corsheaders.defaults import default_headers as _cors_default_headers

CORS_ALLOW_HEADERS = list(_cors_default_headers) + ["idempotency-key"]
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
# The file is PRIVATE. Keep it under .secrets/ (git-ignored, mode 600) and
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

# ---------------------------------------------------------------------------
# Official daily list + public history (Phase 7)
#
# Business *dates* are computed in a business timezone (default Johannesburg)
# while every stored timestamp remains UTC. Publishing is scheduled, not
# triggered by a request, and stays disabled until an operator enables it.
# ---------------------------------------------------------------------------
# Business timezone for daily publication dates and reconciliation windows.
PREDICTXI_BUSINESS_TIMEZONE = env("PREDICTXI_BUSINESS_TIMEZONE", default="Africa/Johannesburg")
# Leagues allowed for ingestion AND for the official daily list. Comma-separated
# numeric API-Football league ids. Empty means "no leagues configured", which
# refuses publication rather than silently drawing from every league.
PREDICTXI_LEAGUES = env.list("PREDICTXI_LEAGUES", default=[])
# Scheduled publication time (local business time) for each day's list. The hard
# requirement is "before the earliest kickoff"; this is the target, not the rule.
PREDICTXI_PUBLISH_HOUR = env.int("PREDICTXI_PUBLISH_HOUR", default=6)
PREDICTXI_PUBLISH_MINUTE = env.int("PREDICTXI_PUBLISH_MINUTE", default=0)
# The published list always shows this many fixtures, or nothing at all.
PREDICTXI_OFFICIAL_LIST_SIZE = env.int("PREDICTXI_OFFICIAL_LIST_SIZE", default=5)
# How long an unplayed selection stays unresolved before it is voided.
PREDICTXI_POSTPONEMENT_HOURS = env.int("PREDICTXI_POSTPONEMENT_HOURS", default=48)
# Cap on how many past business dates a single reconciliation pass rechecks.
PREDICTXI_RECONCILE_MAX_DATES = env.int("PREDICTXI_RECONCILE_MAX_DATES", default=30)
# Illustrative stake for the hypothetical examples. Never a deposit or balance.
PREDICTXI_EXERCISE_STAKE = env("PREDICTXI_EXERCISE_STAKE", default="1000.00")
# Public history page size.
PREDICTXI_HISTORY_PAGE_SIZE = env.int("PREDICTXI_HISTORY_PAGE_SIZE", default=10)
# How many of the most recent business dates the public history highlights, even
# when a date has no published list (so gaps are visible rather than hidden).
PREDICTXI_HISTORY_RECENT_DATES = env.int("PREDICTXI_HISTORY_RECENT_DATES", default=5)
# Presentation threshold: how old stored forecasts may be before the UI flags a
# league as stale. This is a display warning only - it is not a prediction or
# selection rule and cannot change any forecast or betlist.
PREDICTXI_STALE_AFTER_HOURS = env.int("PREDICTXI_STALE_AFTER_HOURS", default=24)

# ---------------------------------------------------------------------------
# Scheduled automation (Phase 3)
#
# Cron invokes `manage.py run_schedule --due` frequently; the due decision is made
# in Django from the settings below, so schedules have ONE source of truth and the
# crontab holds no times. Due times are evaluated in the business timezone above,
# not the host's local time, so a UTC host behaves correctly.
#
# DISABLED BY DEFAULT: installing the cron entry changes nothing until an operator
# sets PREDICTXI_AUTOMATION_ENABLED=True. Manual admin runs keep working either way.
# ---------------------------------------------------------------------------
PREDICTXI_AUTOMATION_ENABLED = env.bool("PREDICTXI_AUTOMATION_ENABLED", default=False)
# Local business time for the daily generation pass.
PREDICTXI_SCHEDULE_DAILY_TIME = env("PREDICTXI_SCHEDULE_DAILY_TIME", default="05:00")
# Optional second pass close to kickoff. Empty disables it.
PREDICTXI_SCHEDULE_REFRESH_TIME = env("PREDICTXI_SCHEDULE_REFRESH_TIME", default="")
# How late a scheduled pass may still fire, so a missed cron tick is recovered
# rather than skipped entirely. Paired with the per-(kind, date) uniqueness guard,
# a late tick still runs the day's work exactly once.
PREDICTXI_SCHEDULE_WINDOW_HOURS = env.int("PREDICTXI_SCHEDULE_WINDOW_HOURS", default=6)
# Leagues processed per invocation. Bounds work per call; it does NOT change what
# a run means, because league selection is a filter over eligible fixtures.
PREDICTXI_BATCH_SIZE = env.int("PREDICTXI_BATCH_SIZE", default=4)
# A RUNNING job older than this is treated as interrupted and failed, so a killed
# process cannot wedge the queue behind the concurrency guard.
PREDICTXI_STALE_JOB_HOURS = env.int("PREDICTXI_STALE_JOB_HOURS", default=3)