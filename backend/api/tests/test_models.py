from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.utils import timezone

from api.models import AccessEntitlement, Fixture, OddsSnapshot, PaymentEvent, Prediction, User


class SchemaTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("verified-uid")
        cls.fixture = Fixture.objects.create(
            provider_id=1, league_id=39, season=2026, home_team_id=1, away_team_id=2,
            home_team_name="Home", away_team_name="Away", kickoff=timezone.now() + timedelta(days=1), status="NS",
        )

    def test_uses_postgresql_and_firebase_identity(self):
        self.assertEqual(connection.vendor, "postgresql")
        self.assertFalse(self.user.has_usable_password())
        with self.assertRaises(ValueError):
            User.objects.create_user("another", password="not-accepted")
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user("verified-uid")

    def test_fixture_provider_ids_are_unique(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Fixture.objects.create(
                provider_id=1, league_id=39, season=2026, home_team_id=3, away_team_id=4,
                home_team_name="Other", away_team_name="Away", kickoff=timezone.now(), status="NS",
            )

    def test_odds_require_positive_prices_above_one(self):
        for price in [Decimal("1"), Decimal("0"), Decimal("-1")]:
            with self.subTest(price=price), self.assertRaises(IntegrityError), transaction.atomic():
                OddsSnapshot.objects.create(fixture=self.fixture, bookmaker="Example", market_id="home_win", decimal_odds=price)
        quote = OddsSnapshot.objects.create(fixture=self.fixture, bookmaker="Example", market_id="home_win", decimal_odds=Decimal("2"))
        self.assertIsNone(quote.provider_updated_at)
        quote.decimal_odds = Decimal("3")
        with self.assertRaises(ValidationError):
            quote.save()

    def test_entitlement_window_must_be_positive(self):
        now = timezone.now()
        with self.assertRaises(IntegrityError), transaction.atomic():
            AccessEntitlement.objects.create(user=self.user, starts_at=now, ends_at=now)

    def test_predictions_preserve_versions_and_deduplicate_inputs(self):
        values = dict(fixture=self.fixture, engine_version="engine-v1", input_hash="a" * 64,
                      config_hash="b" * 64, as_of=timezone.now(), output={"homeWin": 0.6})
        original = Prediction.objects.create(**values)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Prediction.objects.create(**values)
        Prediction.objects.create(**{**values, "engine_version": "engine-v2"})
        self.assertEqual(Prediction.objects.count(), 2)
        with self.assertRaises(ValidationError):
            original.save()

    def test_payment_events_never_grant_entitlements(self):
        values = dict(user=self.user, provider="example", event_id="event-1", amount=Decimal("20"), status="completed")
        PaymentEvent.objects.create(**values)
        self.assertFalse(AccessEntitlement.objects.exists())
        with self.assertRaises(IntegrityError), transaction.atomic():
            PaymentEvent.objects.create(**values)

    def test_payment_metadata_rejects_raw_voucher_data(self):
        event = PaymentEvent(provider="example", event_id="event-2", amount=Decimal("20"), metadata={"voucher_pin": "not-stored"})
        with self.assertRaises(ValidationError):
            event.full_clean()