"""Grant or revoke the staff free-pass (unlimited prediction access) for a user.

Staff/superuser accounts bypass AccessEntitlement checks entirely (see
api/permissions.py). This is a server-side-only flag: it is never derived
from Firebase ID token claims, only set here by whoever controls this shell.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Grant or revoke free (staff) prediction access for a user by Firebase UID."

    def add_arguments(self, parser):
        parser.add_argument("firebase_uid", help="Find it from the 'firebase_uid' field in GET /api/v1/me/.")
        parser.add_argument("--revoke", action="store_true", help="Remove staff access instead of granting it.")

    def handle(self, *args, **options):
        User = get_user_model()
        try:
            user = User.objects.get(firebase_uid=options["firebase_uid"])
        except User.DoesNotExist:
            raise CommandError("No user with that firebase_uid. Sign in at least once first.") from None
        user.is_staff = not options["revoke"]
        user.save(update_fields=["is_staff"])
        self.stdout.write(self.style.SUCCESS(
            f"{'Revoked' if options['revoke'] else 'Granted'} free access for user id={user.pk}."
        ))
