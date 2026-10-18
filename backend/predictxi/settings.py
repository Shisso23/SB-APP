from pathlib import Path
from urllib.parse import urlsplit

import environ
from django.core.exceptions import ImproperlyConfigured


BASE_DIR = Path(__file__).resolve().parent.parent

# Load the git-ignored local backend env file when present.
#
# This is backend/.env (NOT the frontend root .env) and is optional: real
# environments should inject variables directly. Existing variables always win, so
# a deployed environment is never overridden by a stray local file.
_local_env = BASE_DIR / ".env"
if _local_env.is_file():
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