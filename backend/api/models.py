from decimal import Decimal

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, firebase_uid, password=None, **extra_fields):
        if not firebase_uid or password is not None:
            raise ValueError("A Firebase UID and no local password are required.")
        user = self.model(firebase_uid=firebase_uid, **extra_fields)
        user.set_unusable_password()
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    firebase_uid = models.CharField(max_length=128, unique=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()
    USERNAME_FIELD = "firebase_uid"
    REQUIRED_FIELDS = []

    class Meta:
        constraints = [models.CheckConstraint(condition=~Q(firebase_uid=""), name="user_uid_nonempty")]


class Fixture(models.Model):
    provider_id = models.PositiveBigIntegerField(unique=True)
    league_id = models.PositiveIntegerField(db_index=True)
    season = models.PositiveSmallIntegerField()
    home_team_id = models.PositiveBigIntegerField()
    away_team_id = models.PositiveBigIntegerField()
    home_team_name = models.CharField(max_length=200)
    away_team_name = models.CharField(max_length=200)
    kickoff = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=20)
    home_goals = models.PositiveSmallIntegerField(null=True, blank=True)
    away_goals = models.PositiveSmallIntegerField(null=True, blank=True)
    source_updated_at = models.DateTimeField(null=True, blank=True)
    fetched_at = models.DateTimeField(default=timezone.now)
    source_payload = models.JSONField(default=dict)

    class Meta:
        indexes = [models.Index(fields=["league_id", "season", "kickoff"], name="fixture_league_season_time")]
        constraints = [models.CheckConstraint(condition=Q(provider_id__gt=0), name="fixture_provider_positive")]


class SnapshotModel(models.Model):
    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Snapshots must be appended, not overwritten.")
        return super().save(*args, **kwargs)


class OddsSnapshot(SnapshotModel):
    fixture = models.ForeignKey(Fixture, on_delete=models.PROTECT, related_name="odds_snapshots")
    bookmaker = models.CharField(max_length=200)
    market_id = models.CharField(max_length=60)
    decimal_odds = models.DecimalField(max_digits=18, decimal_places=8)
    provider_updated_at = models.DateTimeField(null=True, blank=True)
    captured_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [models.Index(fields=["fixture", "market_id", "captured_at"], name="odds_fixture_market_time")]
        constraints = [models.CheckConstraint(condition=Q(decimal_odds__gt=Decimal("1")), name="odds_greater_than_one")]


hash_validator = RegexValidator(r"^[0-9a-f]{64}$", "A SHA-256 hex digest is required.")


class Prediction(SnapshotModel):
    fixture = models.ForeignKey(Fixture, on_delete=models.PROTECT, related_name="predictions")
    engine_version = models.CharField(max_length=100)
    input_hash = models.CharField(max_length=64, validators=[hash_validator])
    config_hash = models.CharField(max_length=64, validators=[hash_validator])
    generated_at = models.DateTimeField(default=timezone.now)
    as_of = models.DateTimeField()
    inputs = models.JSONField(default=dict)
    output = models.JSONField(default=dict)

    class Meta:
        ordering = ["-generated_at", "-id"]
        constraints = [models.UniqueConstraint(
            fields=["fixture", "engine_version", "input_hash", "config_hash"], name="prediction_version_inputs_unique",
        )]


class AccessEntitlement(models.Model):
    class Scope(models.TextChoices):
        PREDICTIONS = "predictions", "Premium predictions"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="entitlements")
    scope = models.CharField(max_length=40, choices=Scope.choices, default=Scope.PREDICTIONS)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["user", "scope", "ends_at"], name="entitlement_user_scope_end")]
        constraints = [models.CheckConstraint(condition=Q(ends_at__gt=F("starts_at")), name="entitlement_positive_window")]


def validate_payment_metadata(value):
    allowed = {"event_type", "provider_reference", "reason_code"}
    if not isinstance(value, dict) or set(value) - allowed or any(
        not isinstance(item, str) or len(item) > 256 for item in value.values()
    ):
        raise ValidationError("Only bounded non-sensitive event reference metadata is allowed.")


class PaymentEvent(models.Model):
    class Status(models.TextChoices):
        RECEIVED = "received", "Received"
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="payment_events")
    provider = models.CharField(max_length=80)
    event_id = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="ZAR")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RECEIVED)
    verified_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict, validators=[validate_payment_metadata])

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["provider", "event_id"], name="payment_provider_event_unique"),
            models.CheckConstraint(condition=Q(amount__gte=0), name="payment_amount_nonnegative"),
        ]