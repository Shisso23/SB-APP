from django.utils import timezone
from rest_framework.permissions import BasePermission

from api.models import AccessEntitlement


def has_prediction_access(user, now=None):
    if not user or not user.is_authenticated or not user.is_active:
        return False
    current = now if now is not None else timezone.now()
    return AccessEntitlement.objects.filter(
        user=user, scope=AccessEntitlement.Scope.PREDICTIONS,
        starts_at__lte=current, ends_at__gt=current, revoked_at__isnull=True,
    ).exists()


def prediction_access_window(user, now=None):
    """Return the current prediction entitlement window, or None.

    Used by `GET /me/` so the UI can show expiry and distinguish "expired" from
    "never purchased". Read-only and owner-scoped by construction: the caller
    passes the authenticated user.

    When several entitlements overlap (repeat purchases extend one, but older
    rows can coexist), the one ending last is the effective access window.
    """
    if not user or not user.is_authenticated or not user.is_active:
        return None
    current = now if now is not None else timezone.now()
    entitlement = (
        AccessEntitlement.objects.filter(
            user=user, scope=AccessEntitlement.Scope.PREDICTIONS,
            starts_at__lte=current, ends_at__gt=current, revoked_at__isnull=True,
        )
        .order_by("-ends_at")
        .first()
    )
    if entitlement is None:
        return None
    return {"starts_at": entitlement.starts_at, "ends_at": entitlement.ends_at}


class HasPredictionAccess(BasePermission):
    message = "An active prediction entitlement is required."

    def has_permission(self, request, view):
        return has_prediction_access(request.user)