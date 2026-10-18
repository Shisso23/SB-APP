import logging
import os
from threading import Lock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.exceptions import ImproperlyConfigured
import firebase_admin
from firebase_admin import auth, credentials
from firebase_admin.exceptions import FirebaseError
from google.auth.exceptions import GoogleAuthError
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import APIException, AuthenticationFailed


logger = logging.getLogger(__name__)
_app_lock = Lock()


class AuthenticationUnavailable(APIException):
    status_code = 503
    default_detail = "Authentication verification is unavailable."


def _log_unavailable(reason, error):
    """Record a sanitized cause server-side.

    The client always receives a generic message so no internal detail leaks, but
    operators need to distinguish a TLS trust failure from a bad credential or a
    network outage.
    """
    hint = ""
    text = str(error)
    if "CERTIFICATE_VERIFY_FAILED" in text or "certificate verify failed" in text.lower():
        hint = (
            " TLS certificate verification failed. If this host inspects TLS, point "
            "SSL_CERT_FILE at the corporate CA bundle (or set REQUESTS_CA_BUNDLE)."
        )
    logger.error("Firebase authentication unavailable (%s): %s.%s", reason, type(error).__name__, hint)


def get_firebase_app():
    project_id = settings.FIREBASE_PROJECT_ID
    if not project_id or project_id.startswith("replace-") or os.environ.get("FIREBASE_AUTH_EMULATOR_HOST"):
        raise ImproperlyConfigured("A real Firebase project must be configured; emulator authentication is disabled.")
    with _app_lock:
        try:
            return firebase_admin.get_app("predictxi-backend")
        except ValueError:
            credential = credentials.Certificate(settings.FIREBASE_CREDENTIALS_FILE) if settings.FIREBASE_CREDENTIALS_FILE else credentials.ApplicationDefault()
            return firebase_admin.initialize_app(credential, {"projectId": project_id}, name="predictxi-backend")


class FirebaseAuthentication(BaseAuthentication):
    def authenticate_header(self, request):
        return "Bearer"

    def authenticate(self, request):
        header = get_authorization_header(request)
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != b"bearer" or len(parts[1]) > 8192:
            raise AuthenticationFailed("A valid Bearer ID token is required.")
        try:
            token = parts[1].decode("ascii")
        except UnicodeError:
            raise AuthenticationFailed("A valid Bearer ID token is required.") from None
        try:
            app = get_firebase_app()
        except (ImproperlyConfigured, ValueError, OSError, FirebaseError, GoogleAuthError) as error:
            _log_unavailable("initialisation", error)
            raise AuthenticationUnavailable() from None
        try:
            claims = auth.verify_id_token(token, app=app, check_revoked=True, clock_skew_seconds=0)
        except (auth.CertificateFetchError, GoogleAuthError) as error:
            _log_unavailable("token verification", error)
            raise AuthenticationUnavailable() from None
        except (FirebaseError, ValueError):
            raise AuthenticationFailed("Invalid or expired ID token.") from None
        uid = claims.get("uid") if isinstance(claims, dict) else None
        if not isinstance(uid, str) or not 1 <= len(uid) <= 128 or not uid.strip():
            raise AuthenticationFailed("Invalid ID token subject.")
        user, _created = get_user_model().objects.get_or_create(
            firebase_uid=uid, defaults={"password": make_password(None)},
        )
        if not user.is_active:
            raise AuthenticationFailed("Account is inactive.")
        return user, None