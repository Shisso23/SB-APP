from django.utils import timezone
from rest_framework.permissions import BasePermission

from api.models import AccessEntitlement


def has_prediction_access(user, now=None):
    if not user or not user.is_authenticated or not user.is_active:
        return False
    # Server-side staff flag only (never trust claims from the ID token itself).
    if user.is_staff or user.is_superuser:
        return True
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
    if user.is_staff or user.is_superuser:
        return {"starts_at": user.created_at, "ends_at": current.replace(year=current.year + 50)}
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

def is_admin(user):
    """True only for an active, authenticated Django staff or superuser.

    ADMINISTRATIVE PERMISSION IS NOT MEMBERSHIP. `is_staff` is a server-side
    Django flag that only a superuser or a database change can grant; it is never
    derived from Firebase claims, an access pass, or a purchase. A paying member
    is therefore never an admin, and an admin does not need a membership.

    Deliberately strict: an inactive account is refused even if flagged staff, so
    deactivating a user immediately removes administrative reach.
    """
    return bool(
        user
        and getattr(user, "is_authenticated", False)
        and getattr(user, "is_active", False)
        and (user.is_staff or user.is_superuser)
    )


class IsAdmin(BasePermission):
    """Gate for every administrative endpoint.

    Applied to generation, source-data refresh, publication and job management.
    Nothing relies on the frontend hiding navigation: an ordinary user calling
    these endpoints directly receives 403.
    """

    message = "Administrative access is required."

    def has_permission(self, request, view):
        return is_admin(request.user)
