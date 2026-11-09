from decimal import Decimal
import uuid

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
    source = models.ForeignKey("SourceObservation", null=True, blank=True, on_delete=models.PROTECT)
    margin_adjusted_probability = models.DecimalField(max_digits=12, decimal_places=10, null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["fixture", "market_id", "captured_at"], name="odds_fixture_market_time")]
        constraints = [
            models.CheckConstraint(condition=Q(decimal_odds__gt=Decimal("1")), name="odds_greater_than_one"),
            models.UniqueConstraint(fields=["source", "fixture", "bookmaker", "market_id"], name="quote_source_market_unique"),
        ]


hash_validator = RegexValidator(r"^[0-9a-f]{64}$", "A SHA-256 hex digest is required.")


class Prediction(SnapshotModel):
    fixture = models.ForeignKey(Fixture, on_delete=models.PROTECT, related_name="predictions")
    # Which administrative/automated run produced this forecast.
    #
    # Purely informational provenance: it is NEVER read by the engine, and it does
    # not participate in the uniqueness key (which stays fixture/engine/input/config
    # based). Adding it therefore cannot change any forecast, and an older run can
    # never be confused with a newer publication because revisions are ordered by
    # `generated_at`/`id`, not by this link.
    run = models.ForeignKey(
        "AdminJob", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="predictions",
    )
    engine_version = models.CharField(max_length=100)
    input_hash = models.CharField(max_length=64, validators=[hash_validator])
    config_hash = models.CharField(max_length=64, validators=[hash_validator])
    generated_at = models.DateTimeField(default=timezone.now)
    as_of = models.DateTimeField()
    inputs = models.JSONField(default=dict)
    output = models.JSONField(default=dict)
    valid_until = models.DateTimeField(null=True, blank=True)
    provenance = models.JSONField(default=list)
    configuration = models.JSONField(default=dict)

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


class JobRun(models.Model):
    kind = models.CharField(max_length=20)
    scope = models.CharField(max_length=80)
    slot = models.DateTimeField()
    status = models.CharField(max_length=20, default="running")
    claim_token = models.UUIDField(default=uuid.uuid4)
    attempts = models.PositiveSmallIntegerField(default=0)
    requests = models.PositiveIntegerField(default=0)
    checkpoint = models.JSONField(default=dict)
    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True)
    retry_after = models.DateTimeField(null=True)
    error_code = models.CharField(max_length=80, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["kind", "scope", "slot"], name="job_slot_unique")]


class ProviderBudget(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    day = models.DateField()
    minute = models.DateTimeField()
    daily_requests = models.PositiveIntegerField(default=0)
    minute_requests = models.PositiveIntegerField(default=0)
    blocked_until = models.DateTimeField(null=True)


class SourceObservation(SnapshotModel):
    job = models.ForeignKey(JobRun, on_delete=models.PROTECT)
    kind = models.CharField(max_length=20)
    scope = models.CharField(max_length=100)
    observed_at = models.DateTimeField(default=timezone.now, db_index=True)
    provider_updated_at = models.DateTimeField(null=True, blank=True)
    content_hash = models.CharField(max_length=64, validators=[hash_validator])
    payload = models.JSONField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["job", "kind", "scope", "content_hash"], name="observation_job_payload_unique")]
        indexes = [models.Index(fields=["kind", "scope", "observed_at"], name="observation_scope_time")]


# ---------------------------------------------------------------------------
# Access passes (Phase 5A)
#
# Provider-independent purchase/entitlement foundation. Customers redeem a
# voucher they already own; the backend alone decides price, duration, payment
# outcome and access. Voucher PINs are NEVER stored on any of these models.
# ---------------------------------------------------------------------------

class AccessProduct(models.Model):
    """A server-owned access pass definition. Price and duration live in data so
    changing them is a data change, not a code change."""

    code = models.CharField(max_length=60, unique=True)
    name = models.CharField(max_length=120)
    scope = models.CharField(max_length=40, choices=AccessEntitlement.Scope.choices,
                             default=AccessEntitlement.Scope.PREDICTIONS)
    price_amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="ZAR")
    duration_days = models.PositiveSmallIntegerField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(price_amount__gte=0), name="product_price_nonnegative"),
            models.CheckConstraint(condition=Q(duration_days__gt=0), name="product_duration_positive"),
        ]


class PurchaseAttempt(models.Model):
    """One customer attempt to buy an access pass.

    A single lifecycle record for every provider (PayFast today; voucher
    providers were never enabled). Holds no credential or voucher PIN. Status is
    written only by server-side orchestration; there is no API route that lets a
    customer set it.
    """

    class Status(models.TextChoices):
        CREATED = "created", "Created"
        PENDING = "pending", "Pending provider confirmation"
        PROVIDER_CONFIRMED = "provider_confirmed", "Provider confirmed"
        GRANTED = "granted", "Access granted"
        DECLINED = "declined", "Declined"
        EXPIRED = "expired", "Expired"
        REFUNDED = "refunded", "Refunded"
        NEEDS_REVIEW = "needs_review", "Needs manual review"

    class Provider(models.TextChoices):
        PAYFAST = "payfast", "PayFast"
        ONEVOUCHER = "1voucher", "1Voucher"
        OTT = "ott", "OTT Voucher"
        BLU = "blu", "Blu Voucher"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="purchase_attempts")
    product = models.ForeignKey(AccessProduct, on_delete=models.PROTECT, related_name="purchase_attempts")
    provider = models.CharField(max_length=20, choices=Provider.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CREATED)
    idempotency_key = models.CharField(max_length=128, unique=True)
    amount_expected = models.DecimalField(max_digits=14, decimal_places=2)
    amount_confirmed = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="ZAR")
    provider_reference = models.CharField(max_length=200, null=True, blank=True)
    # PayFast-specific fields. `merchant_reference` is our m_payment_id and is
    # echoed back on every ITN, so it is the anchor that ties a notification to
    # exactly this attempt. It is unique so a duplicate cannot collide.
    merchant_reference = models.CharField(max_length=100, unique=True, null=True, blank=True)
    pf_payment_id = models.CharField(max_length=100, null=True, blank=True)
    amount_gross = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    amount_fee = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    amount_net = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    provider_status = models.CharField(max_length=40, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "status"], name="attempt_user_status"),
            models.Index(fields=["provider", "provider_reference"], name="attempt_provider_ref"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(amount_expected__gte=0), name="attempt_amount_expected_nonnegative"),
        ]


class PurchaseEvent(models.Model):
    """Append-only record of every provider event for an attempt.

    Unique per (provider, provider_event_id) so duplicate or out-of-order
    callbacks collapse to a single row.
    """

    attempt = models.ForeignKey(PurchaseAttempt, on_delete=models.PROTECT, related_name="events")
    provider = models.CharField(max_length=20, choices=PurchaseAttempt.Provider.choices)
    provider_event_id = models.CharField(max_length=200)
    status = models.CharField(max_length=40)
    raw_status_code = models.CharField(max_length=40, blank=True)
    metadata = models.JSONField(default=dict, validators=[validate_payment_metadata])
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["provider", "provider_event_id"], name="purchase_event_provider_event_unique"),
        ]


class PassGrant(models.Model):
    """Durable link proving an entitlement was granted for exactly one attempt.

    `attempt` is OneToOne: that is what makes "grant once per verified purchase"
    a database guarantee rather than a code convention, and it is what prevents a
    replayed/duplicated provider event from double-granting.

    `entitlement` is a plain FK, NOT OneToOne, because repeat purchases extend an
    existing entitlement: several grants legitimately point at one entitlement.
    """

    attempt = models.OneToOneField(PurchaseAttempt, on_delete=models.PROTECT, related_name="grant")
    entitlement = models.ForeignKey(AccessEntitlement, on_delete=models.PROTECT, related_name="grants")
    granted_at = models.DateTimeField(default=timezone.now)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(ends_at__gt=F("starts_at")), name="grant_positive_window"),
        ]


class RefundRecord(models.Model):
    """Reversal or correction against a purchase. Audit only; never grants access."""

    attempt = models.ForeignKey(PurchaseAttempt, on_delete=models.PROTECT, related_name="refunds")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reason_code = models.CharField(max_length=80)
    provider_reference = models.CharField(max_length=200)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["provider_reference"], name="refund_provider_reference_unique"),
        ]


class EntitlementRevocation(models.Model):
    """Auditable record of why an entitlement was revoked. Access itself is
    denied by `AccessEntitlement.revoked_at`."""

    entitlement = models.ForeignKey(AccessEntitlement, on_delete=models.PROTECT, related_name="revocations")
    reason_code = models.CharField(max_length=80)
    revoked_at = models.DateTimeField(default=timezone.now)


class StandingsSnapshot(SnapshotModel):
    league_id = models.PositiveIntegerField(db_index=True)
    season = models.PositiveSmallIntegerField()
    observed_at = models.DateTimeField(default=timezone.now, db_index=True)
    source = models.ForeignKey(SourceObservation, on_delete=models.PROTECT)
    payload = models.JSONField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["source"], name="standings_source_unique")]
        indexes = [models.Index(fields=["league_id", "season", "observed_at"], name="standings_league_season_time")]


class LeagueCatalog(models.Model):
    provider_id = models.PositiveIntegerField(unique=True)
    payload = models.JSONField()
    observed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(provider_id__gt=0), name="league_provider_positive")]


class Settlement(SnapshotModel):
    prediction = models.ForeignKey(Prediction, on_delete=models.PROTECT, related_name="settlements")
    market_id = models.CharField(max_length=60)
    result_observation = models.ForeignKey(SourceObservation, on_delete=models.PROTECT)
    home_goals = models.PositiveSmallIntegerField()
    away_goals = models.PositiveSmallIntegerField()
    outcome = models.BooleanField(null=True)
    profit = models.DecimalField(max_digits=18, decimal_places=8)
    settled_at = models.DateTimeField(default=timezone.now)
    correction_flagged_at = models.DateTimeField(null=True, blank=True)
    correction_observation = models.ForeignKey(SourceObservation, null=True, blank=True, on_delete=models.PROTECT, related_name="flagged_settlements")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["prediction", "market_id"], name="settlement_prediction_market_unique")]

# ---------------------------------------------------------------------------
# Official daily betting list (Phase 7)
#
# One published list per business date, shared by every user. This is
# deliberately SEPARATE from user-generated/custom lists: a publication is an
# immutable evidence record, whereas a custom list is a per-user draft.
#
# Immutability rules enforced by this schema:
#   * `(business_date)` is unique, so a retried or concurrent job cannot publish
#     a second list for the same day.
#   * legs store their own copy of the selected market, probability, odds and
#     the prediction they came from, so a later model run or a corrected result
#     can never rewrite what was originally published.
#   * corrections are appended to OfficialListCorrection as an audit trail; the
#     leg row itself is never silently mutated.
# ---------------------------------------------------------------------------


class OfficialListStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    WON = "won", "Won"
    LOST = "lost", "Lost"
    VOID = "void", "Void"
    UNRESOLVED = "unresolved", "Unresolved"


class LegStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    WON = "won", "Won"
    LOST = "lost", "Lost"
    VOID = "void", "Void"
    UNRESOLVED = "unresolved", "Unresolved"


class OfficialDailyList(models.Model):
    """An immutable published list for one business date.

    A day with no suitable fixtures produces NO row at all (rather than an empty
    or short list), so the public history can distinguish "not published" from
    "published and later voided".
    """

    business_date = models.DateField(unique=True)
    published_at = models.DateTimeField()
    # Which configured leagues this publication was drawn from.
    leagues = models.JSONField(default=list)
    engine_version = models.CharField(max_length=120)
    config_hash = models.CharField(max_length=128)
    # Publication target for the date, kept for auditing late publications.
    target_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=OfficialListStatus.choices,
                              default=OfficialListStatus.PENDING)
    # Reconciliation bookkeeping surfaced in admin.
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_check_error = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["-business_date"], name="official_list_date_desc")]
        constraints = [
            models.CheckConstraint(condition=~Q(engine_version=""), name="official_list_engine_nonempty"),
        ]

    def __str__(self):
        return f"Official list {self.business_date} ({self.status})"


class OfficialListLeg(models.Model):
    """One fixture's single selected market inside a published list.

    Every field needed to audit the selection *as published* is copied here, so
    nothing depends on the current state of `Prediction`, odds or the engine.
    """

    official_list = models.ForeignKey(OfficialDailyList, on_delete=models.CASCADE, related_name="legs")
    # Stable provider fixture id (matches Fixture.provider_id).
    provider_fixture_id = models.PositiveBigIntegerField()
    fixture = models.ForeignKey("Fixture", null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="official_legs")
    # The prediction this leg was selected from; informational only.
    prediction = models.ForeignKey("Prediction", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="official_legs")

    league_id = models.PositiveIntegerField()
    league_name = models.CharField(max_length=160, blank=True)
    home_team_name = models.CharField(max_length=160)
    away_team_name = models.CharField(max_length=160)
    kickoff = models.DateTimeField()

    market_id = models.CharField(max_length=60)
    market_label = models.CharField(max_length=160, blank=True)
    # Human-readable line/range, e.g. "Over 2.5" or "Total goals 2-5".
    market_line = models.CharField(max_length=60, blank=True)
    # Model probability at publication, as a fraction (0-1].
    probability = models.DecimalField(max_digits=6, decimal_places=5)
    explanation = models.CharField(max_length=400, blank=True)
    engine_version = models.CharField(max_length=120, blank=True)

    # Odds are nullable by design: a leg with no quoted price still shows the
    # prediction and its result, but never a fabricated price.
    decimal_odds = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    odds_bookmaker = models.CharField(max_length=120, blank=True)
    odds_source = models.CharField(max_length=60, blank=True)
    odds_captured_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=LegStatus.choices, default=LegStatus.PENDING)
    home_goals = models.PositiveSmallIntegerField(null=True, blank=True)
    away_goals = models.PositiveSmallIntegerField(null=True, blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    # Why a leg is unresolved/void, shown to users (e.g. postponement policy).
    resolution_note = models.CharField(max_length=200, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["official_list", "provider_fixture_id"],
                                    name="official_leg_fixture_unique"),
            models.CheckConstraint(condition=Q(probability__gt=0) & Q(probability__lte=1),
                                   name="official_leg_probability_range"),
            models.CheckConstraint(condition=Q(decimal_odds__isnull=True) | Q(decimal_odds__gte=1),
                                   name="official_leg_odds_gte_one"),
        ]

    def __str__(self):
        return f"{self.home_team_name} v {self.away_team_name} — {self.market_id}"


class OfficialListCorrection(models.Model):
    """Append-only audit trail for any administrative change to a publication.

    A correction never edits history in place without a record: the reason, the
    actor, and the before/after values are all captured here.
    """

    official_list = models.ForeignKey(OfficialDailyList, on_delete=models.CASCADE, related_name="corrections")
    leg = models.ForeignKey(OfficialListLeg, null=True, blank=True, on_delete=models.SET_NULL,
                            related_name="corrections")
    reason = models.CharField(max_length=300)
    actor = models.CharField(max_length=160, blank=True)
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["official_list", "-created_at"], name="official_correction_recent")]

    def __str__(self):
        return f"Correction on {self.official_list.business_date}: {self.reason}"


class DailyPreview(models.Model):
    """The single cached free-preview featured match for a business date.

    Selected once per day so every visitor sees the same preview, and so opening
    the public page never triggers new forecasting or provider calls.
    """

    business_date = models.DateField(unique=True)
    leg = models.ForeignKey(OfficialListLeg, null=True, blank=True, on_delete=models.SET_NULL,
                            related_name="previews")
    # Snapshot of the analysis shown publicly, frozen at selection time.
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["-business_date"], name="preview_date_desc")]

    def __str__(self):
        return f"Daily preview {self.business_date}"


# ---------------------------------------------------------------------------
# Admin-managed prediction runs (Phase 8)
#
# Orchestration ONLY. This records *who asked for what, and when* so an admin run
# can be tracked, audited and retried. It deliberately does not hold, recompute,
# or reinterpret any prediction: forecasts and betlists are produced by the
# existing engine entry point, unchanged.
#
# The job record is written and committed BEFORE the work is dispatched, so a
# crash between the two leaves a visible queued job rather than a silent gap.
# ---------------------------------------------------------------------------


class AdminJobKind(models.TextChoices):
    # Forecasting for a date across the selected leagues (league is a FILTER over
    # the fixture set, never a partition of the run).
    GENERATE = "generate", "Generate predictions"
    # Refresh source data (fixtures/standings/odds) via the existing pipeline.
    REFRESH = "refresh", "Refresh source data"
    # Publish/refresh the official daily list from already-generated predictions.
    PUBLISH = "publish", "Publish official list"


class AdminJobStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    RUNNING = "running", "Running"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"
    # Superseded by a newer run for the same date/kind before it started.
    CANCELLED = "cancelled", "Cancelled"


class AdminJob(models.Model):
    """One administratively requested run. Auditable, executable off-request."""

    kind = models.CharField(max_length=20, choices=AdminJobKind.choices)
    status = models.CharField(max_length=20, choices=AdminJobStatus.choices,
                              default=AdminJobStatus.QUEUED)
    # Business date the run targets (predictions for this date).
    target_date = models.DateField()
    season = models.PositiveSmallIntegerField()
    # Leagues the run covers. A FILTER over eligible fixtures, not a split.
    leagues = models.JSONField(default=list)

    # --- audit: who asked, and how ------------------------------------------
    # Trigger is recorded so a scheduled run can never masquerade as an admin one.
    trigger = models.CharField(max_length=20, default="admin")
    # Stable identifier for a scheduled run, e.g. "daily-generate". Empty for a
    # manual admin run. This is what makes a cron run attributable without needing
    # a Celery task id.
    schedule_id = models.CharField(max_length=80, blank=True)
    # How the run was executed: "cron", "admin request", or an existing task
    # executor. Recorded for diagnostics; never used for authorisation.
    execution_mechanism = models.CharField(max_length=40, default="admin request")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name="admin_jobs")
    # Stable identifier of the requesting admin, kept even if the row is removed.
    requested_by_label = models.CharField(max_length=160, blank=True)

    # --- execution bookkeeping ---------------------------------------------
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    error_code = models.CharField(max_length=200, blank=True)
    # Human-readable summary recorded on success (counts, leagues covered).
    summary = models.JSONField(default=dict)
    # Per-league outcome, so the coverage dashboard can show partial success
    # without re-deriving it from logs.
    league_results = models.JSONField(default=dict)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["target_date", "kind", "-created_at"], name="adminjob_date_kind"),
            models.Index(fields=["status", "created_at"], name="adminjob_status_time"),
        ]
        constraints = [
            models.CheckConstraint(condition=~Q(trigger=""), name="adminjob_trigger_nonempty"),
            # A run must target at least one league; an empty filter would be
            # ambiguous between "all leagues" and "none".
            models.CheckConstraint(condition=~Q(leagues=[]), name="adminjob_leagues_nonempty"),
            # At most ONE in-flight run per (kind, target date).
            #
            # This is the duplicate/overlap guard: two admins pressing Predict for
            # the same date cannot queue conflicting work, and a retried request
            # cannot double-queue. Completed and failed runs are excluded from the
            # constraint so history is preserved and a retry after failure is
            # allowed.
            models.UniqueConstraint(
                fields=["kind", "target_date"],
                condition=Q(status__in=["queued", "running"]),
                name="adminjob_one_active_per_kind_date",
            ),
        ]

    def __str__(self):
        return f"AdminJob {self.pk} {self.kind} {self.target_date} [{self.status}]"
