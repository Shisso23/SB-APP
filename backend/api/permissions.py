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


class HasPredictionAccess(BasePermission):
    message = "An active prediction entitlement is required."

    def has_permission(self, request, view):
        return has_prediction_access(request.user)